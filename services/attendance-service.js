const dayjs = require('dayjs');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const { fetchAllBiometricEvents, parseTime } = require('./extrahours-automation');

/**
 * Syncs raw biocmetric punches into the Attendance collection.
 * No filtering of in-between punches.
 */
async function syncAttendancePunches(startTime, endTime) {
    try {
        console.log(`[ATTENDANCE SYNC] Starting sync from ${startTime} to ${endTime}`);
        const events = await fetchAllBiometricEvents(startTime, endTime);
        if (events.length === 0) return { processed: 0, updated: 0, errors: 0 };
        console.log(`[ATTENDANCE SYNC] Fetched ${events.length} raw events`);

        // 1. Bulk Fetch Users
        const biometricIds = [...new Set(events.map(e => e.employeeNoString).filter(Boolean))];
        const users = await User.find({ bioMetricId: { $in: biometricIds }, isDeleted: false });
        const userMap = new Map(users.map(u => [u.bioMetricId, u]));

        // 2. Group Events by UserID and Logical Date
        const groups = {};
        for (const event of events) {
            const user = userMap.get(event.employeeNoString);
            const eventTime = parseTime(event.time);
            if (!user || !eventTime) continue;

            const dateObj = eventTime.clone().startOf('day').toDate();
            const dateKey = eventTime.format('YYYY-MM-DD');
            const key = `${user._id}_${dateKey}`;
            
            if (!groups[key]) {
                groups[key] = {
                    userId: user._id,
                    date: dateObj,
                    punches: []
                };
            }
            groups[key].punches.push({
                time: eventTime.format('HH:mm:ss'),
                rawTime: eventTime.toDate()
            });
        }

        const stats = { processed: events.length, updated: 0, errors: 0 };
        const groupList = Object.values(groups);

        // 3. Process each user+date group in parallel
        await Promise.all(groupList.map(async (group) => {
            try {
                let record = await Attendance.findOne({ userId: group.userId, date: group.date });

                if (!record) {
                    record = new Attendance({
                        userId: group.userId,
                        date: group.date,
                        punches: group.punches,
                        status: 'Present'
                    });
                    await record.save();
                    stats.updated += group.punches.length;
                } else {
                    let newPunchesAdded = 0;
                    for (const p of group.punches) {
                        const exists = record.punches.some(existing => existing.time === p.time);
                        if (!exists) {
                            record.punches.push(p);
                            newPunchesAdded++;
                        }
                    }
                    if (newPunchesAdded > 0) {
                        record.punches.sort((a, b) => a.rawTime - b.rawTime);
                        await record.save();
                        stats.updated += newPunchesAdded;
                    }
                }
            } catch (err) {
                console.error(`[ATTENDANCE SYNC] Error processing group ${group.userId} on ${group.date}:`, err);
                stats.errors++;
            }
        }));

        return stats;
    } catch (error) {
        console.error('[ATTENDANCE SYNC] Error:', error);
        throw error;
    }
}

/**
 * Generates a report for a user and month.
 * Working Days: Monday to Friday.
 */
async function getUserAttendanceReport(userId, monthYear) {
    // monthYear format: 'YYYY-MM'
    const startOfMonth = dayjs(monthYear).startOf('month');
    const endOfMonth = dayjs(monthYear).endOf('month');
    
    // Get all attendance records for this user in this month
    const records = await Attendance.find({
        userId,
        date: { $gte: startOfMonth.toDate(), $lte: endOfMonth.toDate() }
    });

    const recordMap = new Map();
    records.forEach(r => {
        recordMap.set(dayjs(r.date).format('YYYY-MM-DD'), r);
    });

    let totalPresent = 0;
    let totalAbsent = 0;
    let totalLeave = 0;
    const workingDaysList = [];

    let current = startOfMonth;
    while (current.isBefore(endOfMonth) || current.isSame(endOfMonth)) {
        const dayOfWeek = current.day(); // 0 (Sun) to 6 (Sat)
        const isWorkingDay = dayOfWeek >= 1 && dayOfWeek <= 5;
        const dateKey = current.format('YYYY-MM-DD');
        
        if (isWorkingDay) {
            const record = recordMap.get(dateKey);
            
            let status = 'Absent';
            if (record) {
                if (record.adminStatus !== 'NA') {
                    status = record.adminStatus;
                } else if (record.punches.length > 0) {
                    status = 'Present';
                }
            }

            if (status === 'Present') totalPresent++;
            else if (status === 'Approved Leave') totalLeave++;
            else if (status === 'Absent' || status === 'Rejected Leave') totalAbsent++;

            workingDaysList.push({
                date: dateKey,
                status,
                punches: record ? record.punches.map(p => p.time) : []
            });
        }
        current = current.add(1, 'day');
    }

    return {
        userId,
        month: monthYear,
        totalPresent,
        totalAbsent,
        totalLeave,
        workingDaysCount: workingDaysList.length,
        days: workingDaysList
    };
}

/**
 * Manually mark or override attendance status.
 */
async function markAttendanceManual({ userId, date, adminStatus, note }) {
    const normalizedDate = dayjs(date).startOf('day').toDate();
    let record = await Attendance.findOne({ userId, date: normalizedDate });

    if (!record) {
        record = new Attendance({
            userId,
            date: normalizedDate,
            adminStatus,
            note,
            isManual: true,
            punches: []
        });
    } else {
        record.adminStatus = adminStatus;
        record.note = note;
        record.isManual = true;
    }

    return await record.save();
}

/**
 * Get raw attendance logs with basic filters.
 */
async function getAttendanceLogs(filters) {
    const { userId, startDate, endDate, date } = filters;
    let query = {};

    if (userId) query.userId = userId;

    if (date) {
        query.date = dayjs(date).startOf('day').toDate();
    } else if (startDate && endDate) {
        query.date = {
            $gte: dayjs(startDate).startOf('day').toDate(),
            $lte: dayjs(endDate).endOf('day').toDate()
        };
    }

    return await Attendance.find(query)
        .populate('userId', 'name email bioMetricId profilePic role memberOfHW')
        .sort({ date: -1 });
}

/**
 * Get logs with specific filters (by month OR by date, optional userId).
 */
async function getFilteredLogs({ userId, month, date }) {
    let query = {};

    if (userId) query.userId = userId;

    if (month) {
        const startOfMonth = dayjs(month).startOf('month').toDate();
        const endOfMonth = dayjs(month).endOf('month').toDate();
        query.date = { $gte: startOfMonth, $lte: endOfMonth };
    } else if (date) {
        query.date = dayjs(date).startOf('day').toDate();
    }

    return await Attendance.find(query)
        .populate('userId', 'name email bioMetricId profilePic role memberOfHW')
        .sort({ date: -1 });
}

module.exports = {
    syncAttendancePunches,
    getUserAttendanceReport,
    markAttendanceManual,
    getAttendanceLogs,
    getFilteredLogs
};
