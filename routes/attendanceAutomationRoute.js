// ===================================================================
// EXTRA HOURS AUTOMATION ROUTES
// ===================================================================
// API endpoints to control and monitor the extra hours automation
// ===================================================================

const express = require('express');
const router = express.Router();
const dayjs = require('dayjs');
const {
    processAttendance,
    getAutomationState,
    startCronJob,
    stopCronJob,
    getCronStatus,
    CONFIG,
} = require('../services/attendance-automation');


router.get('/automation/trigger', async (req, res) => {
    try {
        const { startTime, endTime } = req.body;

        // Parse custom time range if provided
        const customStartTime = startTime ? new Date(startTime) : null;
        const customEndTime = endTime ? new Date(endTime) : null;

        // console.log('[API] Manual trigger requested by:', req.user.email);

        const result =  processAttendance(customStartTime, customEndTime);

        return res.json({
            success: true,
            message: 'Automation triggered in the background successfully',
            data: result,
        });
    } catch (error) {
        console.error('[API] Error triggering automation:', error);
        return res.status(500).json({
            success: false,
            message: 'Error triggering automation',
            error: error.message,
        });
    }
});

router.get('/automation/status', async (req, res) => {
    try {
        const state = getAutomationState();
        const cronStatus = getCronStatus();

        return res.json({
            success: true,
            data: {
                ...state,
                cron: cronStatus,
                config: {
                    cronSchedule: CONFIG.CRON.SCHEDULE,
                    autoStart: CONFIG.CRON.AUTO_START,
                },
            },
        });
    } catch (error) {
        console.error('[API] Error getting status:', error);
        return res.status(500).json({
            success: false,
            message: 'Error getting automation status',
            error: error.message,
        });
    }
});

router.post('/automation/cron/start', async (req, res) => {
    try {
        startCronJob();

        return res.json({
            success: true,
            message: 'Cron job started',
            schedule: CONFIG.CRON.SCHEDULE,
        });
    } catch (error) {
        console.error('[API] Error starting cron:', error);
        return res.status(500).json({
            success: false,
            message: 'Error starting cron job',
            error: error.message,
        });
    }
});

router.post('/automation/cron/stop', async (req, res) => {
    try {
        stopCronJob();

        return res.json({
            success: true,
            message: 'Cron job stopped',
        });
    } catch (error) {
        console.error('[API] Error stopping cron:', error);
        return res.status(500).json({
            success: false,
            message: 'Error stopping cron job',
            error: error.message,
        });
    }
});

router.post('/automation/process-date-range', async (req, res) => {
    try {
        const { startDate, endDate } = req.body;

        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'startDate and endDate are required',
            });
        }

        const start = dayjs(startDate).startOf('day').toDate();
        const end = dayjs(endDate).endOf('day').toDate();

        console.log(`[API] Processing date range: ${startDate} to ${endDate}`);

        const result = await processAttendance(start, end);

        return res.json(result);
    } catch (error) {
        console.error('[API] Error processing date range:', error);
        return res.status(500).json({
            success: false,
            message: 'Error processing date range',
            error: error.message,
        });
    }
});

module.exports = router;