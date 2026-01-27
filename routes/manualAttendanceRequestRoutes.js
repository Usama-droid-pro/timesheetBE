const express = require('express');
const router = express.Router();
const manualAttendanceRequestController = require('../controllers/manualAttendanceRequestController');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { checkPermission } = require('../middlewares/permissionMiddleware');


// Create request - any authenticated user
router.post('/', authMiddleware, manualAttendanceRequestController.createRequest);

// Get own requests - any authenticated user
router.get('/my-requests', authMiddleware, manualAttendanceRequestController.getMyRequests);

// Get all requests - requires permission
router.get('/', authMiddleware, checkPermission('canApproveManualEntries'), manualAttendanceRequestController.getRequests);

// Approve request - requires permission
router.put('/:id/approve', authMiddleware, checkPermission('canApproveManualEntries'), manualAttendanceRequestController.approveRequest);

// Reject request - requires permission
router.put('/:id/reject', authMiddleware, checkPermission('canApproveManualEntries'), manualAttendanceRequestController.rejectRequest);

// Delete request - user can delete their own pending requests
router.delete('/:id', authMiddleware, manualAttendanceRequestController.deleteRequest);

module.exports = router;
