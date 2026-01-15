const express = require('express');
const router = express.Router();
const holidayController = require('../controllers/holidayController');
const { authMiddleware } = require('../middlewares/authMiddleware');

// Apply authentication to all routes
router.use(authMiddleware);

// GET /api/holidays - Get all holidays
router.get('/', holidayController.getHolidays);

// POST /api/holidays - Add a new holiday (admin only)
router.post('/', holidayController.addHoliday);

// PUT /api/holidays/:date - Update a holiday (admin only)
router.put('/:date', holidayController.updateHoliday);

// DELETE /api/holidays/:date - Remove a holiday (admin only)
router.delete('/:date', holidayController.removeHoliday);

module.exports = router;
