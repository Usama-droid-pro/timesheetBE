const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
dayjs.extend(utc);
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
        if (!events || events.length === 0) {
            return { processed: 0, updated: 0, errors: 0 };
        }

        console.log(`[ATTENDANCE SYNC] Fetched ${events.length} raw events`);

        // Extract unique biometric IDs efficiently
        const biometricIds = [...new Set(events.map(e => e.employeeNoString).filter(Boolean))];

        // Fetch users in single query
        const users = await User.find({
            bioMetricId: { $in: biometricIds },
            isDeleted: false
        }).lean(); // Use lean() to avoid Mongoose overhead

        const userMap = new Map(users.map(u => [u.bioMetricId, u]));

        // Group events by user and date
        const groups = {};
        for (const event of events) {
            const user = userMap.get(event.employeeNoString);
            const eventTime = parseTime(event.time);
            if (!user || !eventTime) continue;

            const dateKey = eventTime.format('YYYY-MM-DD');
            const dateObj = dayjs.utc(dateKey).toDate();
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

        const groupList = Object.values(groups);
        
        // Pre-fetch all attendance records in batch
        const attendanceRecords = await Attendance.find({
            userId: { $in: [...new Set(groupList.map(g => g.userId))] },
            date: { $in: [...new Set(groupList.map(g => g.date))] }
        });

        const attendanceMap = new Map(
            attendanceRecords.map(r => [`${r.userId}_${r.date.toISOString().split('T')[0]}`, r])
        );

        // Prepare bulk operations
        const bulkOps = [];
        const createDocs = [];
        let stats = { processed: events.length, updated: 0, errors: 0 };

        for (const group of groupList) {
            try {
                const dateKey = group.date.toISOString().split('T')[0];
                const mapKey = `${group.userId}_${dateKey}`;
                const existingRecord = attendanceMap.get(mapKey);

                if (!existingRecord) {
                    // Prepare for batch insert
                    createDocs.push({
                        userId: group.userId,
                        date: group.date,
                        punches: group.punches,
                        status: 'Present'
                    });
                    stats.updated += group.punches.length;
                    continue;
                }

                // Check if update needed
                let changed = false;
                let newPunchesAdded = 0;

                const statusChanged = existingRecord.status !== 'Present';
                const existingTimes = new Set(existingRecord.punches.map(p => p.time));
                const newPunches = group.punches.filter(p => !existingTimes.has(p.time));

                if (statusChanged || newPunches.length > 0) {
                    const updatedPunches = [
                        ...existingRecord.punches,
                        ...newPunches
                    ].sort((a, b) => a.rawTime - b.rawTime);

                    bulkOps.push({
                        updateOne: {
                            filter: { _id: existingRecord._id },
                            update: {
                                $set: {
                                    status: 'Present',
                                    punches: updatedPunches
                                }
                            }
                        }
                    });

                    stats.updated++;
                }

            } catch (err) {
                console.error(`[ATTENDANCE SYNC] Error processing group ${group.userId}:`, err.message);
                stats.errors++;
            }
        }

        // Execute all operations in parallel
        const operations = [];

        if (createDocs.length > 0) {
            operations.push(
                Attendance.insertMany(createDocs, { ordered: false }).catch(err => {
                    console.error('[ATTENDANCE SYNC] Batch insert error:', err.message);
                    stats.errors += createDocs.length;
                })
            );
        }

        if (bulkOps.length > 0) {
            operations.push(
                Attendance.bulkWrite(bulkOps, { ordered: false }).catch(err => {
                    console.error('[ATTENDANCE SYNC] Bulk write error:', err.message);
                    stats.errors += bulkOps.length;
                })
            );
        }

        // Wait for all operations to complete
        if (operations.length > 0) {
            await Promise.all(operations);
        }

        console.log(`[ATTENDANCE SYNC] Completed: ${stats.updated} updated, ${stats.errors} errors`);
        return stats;

    } catch (error) {
        console.error('[ATTENDANCE SYNC] Fatal Error:', error);
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
    const normalizedDate = dayjs.utc(dayjs(date).format('YYYY-MM-DD')).toDate();
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
        const start = dayjs.utc(date).startOf('day').toDate();
        const end = dayjs.utc(date).endOf('day').toDate();
        query.date = { $gte: start, $lte: end };
    } else if (startDate && endDate) {
        query.date = {
            $gte: dayjs.utc(startDate).startOf('day').toDate(),
            $lte: dayjs.utc(endDate).endOf('day').toDate()
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

    if(userId) query.userId = userId;
    // Use UTC for date matching to ignore server/client timezone offsets
    if (month) {
        const startOfMonth = dayjs.utc(month).startOf('month').toDate();
        const endOfMonth = dayjs.utc(month).endOf('month').toDate();
        query.date = { $gte: startOfMonth, $lte: endOfMonth };
    } else if (date) {
        const start = dayjs.utc(date).startOf('day').toDate();
        const end = dayjs.utc(date).endOf('day').toDate();
        query.date = { $gte: start, $lte: end };
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
