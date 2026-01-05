const express = require('express');
const router = express.Router();
const {
  getRecords,
  getUserRecords,
  getByDate,
  getById,
  updateApproval,
  getStats,
  markManualAttendance,
  addSecondEntry,
  deleteEntry,
  adjustHours,
  markLeaveOrAbsent
} = require('../controllers/attendanceSystemController');



// General routes
router.post('/second-entry', addSecondEntry);
router.post("/", markManualAttendance);
router.get('/', getRecords);
router.get('/user/:userId', getUserRecords);
router.get('/date/:date', getByDate);
router.get('/stats/:userId/:month/:year', getStats);
router.get('/:id', getById);

// Admin/PM routes
router.post('/mark-leave-absent', markLeaveOrAbsent);
router.put('/:id/approval', updateApproval);
router.patch('/:id/ignore-deduction', require('../controllers/attendanceSystemController').updateIgnoreDeduction);
router.patch('/:id/adjust-hours', adjustHours);
router.delete('/:id', deleteEntry);


module.exports = router;
