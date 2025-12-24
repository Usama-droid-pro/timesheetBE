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
        console.log(`[ATTENDANCE SYNC] Fetched ${events.length} raw events`);

        const stats = { processed: 0, updated: 0, errors: 0 };

        for (const event of events) {
            const biometricId = event.employeeNoString;
            const eventTime = parseTime(event.time); // Already returns naive moment

            if (!biometricId || !eventTime) continue;

            const user = await User.findOne({ bioMetricId: biometricId, isDeleted: false });
            if (!user) {
                // console.log(`[ATTENDANCE SYNC] User not found for biometricId: ${biometricId}`);
                continue;
            }

            const date = eventTime.clone().startOf('day').toDate();
            const punchStr = eventTime.format('HH:mm:ss');

            // Find or create attendance record for this day
            let record = await Attendance.findOne({ userId: user._id, date });

            if (!record) {
                record = new Attendance({
                    userId: user._id,
                    date,
                    punches: [{ time: punchStr, rawTime: eventTime.toDate() }],
                    status: 'Present'
                });
                await record.save();
                stats.updated++;
            } else {
                // Check if punch already exists
                const exists = record.punches.some(p => p.time === punchStr);
                if (!exists) {
                    record.punches.push({ time: punchStr, rawTime: eventTime.toDate() });
                    // Sort punches by time
                    record.punches.sort((a, b) => a.rawTime - b.rawTime);
                    await record.save();
                    stats.updated++;
                }
            }
            stats.processed++;
        }

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
