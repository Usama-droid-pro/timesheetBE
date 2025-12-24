const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');

// Sync endpoints
router.post('/sync', attendanceController.triggerSync);

// Log endpoints
router.get('/logs', attendanceController.getLogs);
router.get('/logs/filter', attendanceController.getLogsWithFilter);

// Report endpoints
router.get('/report', attendanceController.getReport);

// Manual marking
router.post('/mark', attendanceController.markAttendance);

module.exports = router;
