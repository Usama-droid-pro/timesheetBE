const express = require('express');
const router = express.Router();
const extraHoursController = require('../controllers/extraHoursController');
const { adminMiddleware } = require('../middlewares/authMiddleware');

router.post('/', extraHoursController.addExtraHours);
router.put('/:id', extraHoursController.updateExtraHours);
router.get('/task-hours', extraHoursController.getTaskHours);
router.post('/task-hours', extraHoursController.addTaskHours);
router.put('/updateApprovalStatus/:id', extraHoursController.updateApprovalStatus);
router.delete('/:id', extraHoursController.deleteExtraHours);

router.get('/team-wise-work-hours', extraHoursController.getTeamWiseWorkHours);

// Excel import flow
router.post('/import/check-availability', adminMiddleware, extraHoursController.checkAvailability);
router.post('/import', adminMiddleware, extraHoursController.importFromExcel);

module.exports = router;