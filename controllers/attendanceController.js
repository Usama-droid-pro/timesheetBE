const attendanceService = require('../services/attendance-service');
const dayjs = require('dayjs');

exports.markAttendance = async (req, res) => {
    try {
        const { userId, date, adminStatus, note } = req.body;
        if (!userId || !date || !adminStatus) {
            return res.status(400).json({ success: false, message: 'userId, date, and adminStatus are required' });
        }

        const record = await attendanceService.markAttendanceManual({ userId, date, adminStatus, note });
        res.json({ success: true, message: 'Attendance marked successfully', data: record });
    } catch (error) {
        console.error('[CONTROLLER] markAttendance error:', error);
        res.status(500).json({ success: false, message: 'Error marking attendance', error: error.message });
    }
};

exports.getLogs = async (req, res) => {
    try {
        const logs = await attendanceService.getAttendanceLogs(req.query);
        res.json({ success: true, data: logs });
    } catch (error) {
        console.error('[CONTROLLER] getLogs error:', error);
        res.status(500).json({ success: false, message: 'Error fetching logs', error: error.message });
    }
};

exports.getLogsWithFilter = async (req, res) => {
    try {
        const logs = await attendanceService.getFilteredLogs(req.query);
        res.json({ success: true, data: logs });
    } catch (error) {
        console.error('[CONTROLLER] getLogsWithFilter error:', error);
        res.status(500).json({ success: false, message: 'Error fetching filtered logs', error: error.message });
    }
};

exports.getReport = async (req, res) => {
    try {
        const { userId, month } = req.query; // month format: 'YYYY-MM'
        if (!userId || !month) {
            return res.status(400).json({ success: false, message: 'userId and month are required' });
        }

        const report = await attendanceService.getUserAttendanceReport(userId, month);
        res.json({ success: true, data: report });
    } catch (error) {
        console.error('[CONTROLLER] getReport error:', error);
        res.status(500).json({ success: false, message: 'Error generating report', error: error.message });
    }
};

exports.triggerSync = async (req, res) => {
    try {
        const startDate = dayjs().subtract(10, 'minutes').toDate(); 
        // const startDate = dayjs().startOf("month").toDate();

        const endDate = dayjs().toDate();
        const stats = await attendanceService.syncAttendancePunches(startDate, endDate);
        res.json({ success: true, message: 'Sync completed', stats });
    } catch (error) {
        console.error('[CONTROLLER] triggerSync error:', error);
        res.status(500).json({ success: false, message: 'Error syncing attendance', error: error.message });
    }
};
