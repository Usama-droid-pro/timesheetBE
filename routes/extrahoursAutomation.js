// ===================================================================
// EXTRA HOURS AUTOMATION ROUTES
// ===================================================================
// API endpoints to control and monitor the extra hours automation
// ===================================================================

const express = require('express');
const router = express.Router();
const dayjs = require('dayjs');
const {
    processExtraHours,
    startCronJob,
    stopCronJob,
    getAutomationState,
    CONFIG,
} = require('../services/extrahours-automation');

// ===================================================================
// MIDDLEWARE
// ===================================================================

/**
 * Authentication middleware (customize based on your auth system)
 */
const requireAuth = (req, res, next) => {

    //   const authHeader = req.headers.authorization;
    //    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    //    return res.status(401).json({ error: 'Unauthorized' });
    //    }

    next();
};

// ===================================================================
// ROUTES
// ===================================================================

/**
 * POST /api/extrahours/automation/trigger
 * Manually trigger the automation process
 */
router.get('/automation/trigger', requireAuth, async (req, res) => {
    try {
        const { startTime, endTime } = req.body;

        // Parse custom time range if provided
        const customStartTime = startTime ? new Date(startTime) : null;
        const customEndTime = endTime ? new Date(endTime) : null;

        // console.log('[API] Manual trigger requested by:', req.user.email);

        const result = await processExtraHours(customStartTime, customEndTime);

        return res.json(result);
    } catch (error) {
        console.error('[API] Error triggering automation:', error);
        return res.status(500).json({
            success: false,
            message: 'Error triggering automation',
            error: error.message,
        });
    }
});

/**
 * GET /api/extrahours/automation/status
 * Get current automation status
 */
router.get('/automation/status', requireAuth, async (req, res) => {
    try {
        const state = getAutomationState();

        return res.json({
            success: true,
            data: {
                ...state,
                config: {
                    cronSchedule: CONFIG.CRON.SCHEDULE,
                    officeEndTime: `${CONFIG.OFFICE_HOURS.END_HOUR}:${String(CONFIG.OFFICE_HOURS.END_MINUTE).padStart(2, '0')}`,
                    thresholdMinutes: CONFIG.OFFICE_HOURS.THRESHOLD_MINUTES,
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

/**
 * POST /api/extrahours/automation/cron/start
 * Start the cron job
 */
router.post('/automation/cron/start', requireAuth, async (req, res) => {
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

/**
 * POST /api/extrahours/automation/cron/stop
 * Stop the cron job
 */
router.post('/automation/cron/stop', requireAuth, async (req, res) => {
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

/**
 * POST /api/extrahours/automation/process-date-range
 * Process a specific date range (useful for backfilling data)
 */
router.post('/automation/process-date-range', requireAuth, async (req, res) => {
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

        const result = await processExtraHours(start, end);

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

// ===================================================================
// EXPORT
// ===================================================================

module.exports = router;