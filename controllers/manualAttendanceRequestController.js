const manualAttendanceRequestService = require('../services/manualAttendanceRequestService');
const { sendSuccess, sendError, sendServerError } = require('../utils/responseHandler');

/**
 * Create a new manual attendance request
 */
const createRequest = async (req, res) => {
  try {
    const requestedBy = req.user.id;
    const { userId, date, checkInTime, checkOutTime, reason, applyRules, isWorkedFromHome } = req.body;

    // Validation
    if (!date || !checkInTime || !checkOutTime || !reason) {
      return sendError(res, 'Date, check-in time, check-out time, and reason are required', null, 400);
    }

    if (reason.trim().length === 0) {
      return sendError(res, 'Reason cannot be empty', null, 400);
    }

    const request = await manualAttendanceRequestService.createRequest(
      userId,
      date,
      checkInTime,
      checkOutTime,
      reason,
      {
        applyRules: applyRules !== false,
        isWorkedFromHome: isWorkedFromHome === true
      },
      requestedBy
    );

    return sendSuccess(res, 'Manual attendance request submitted successfully', { request }, 201);
  } catch (error) {
    console.error('Create manual attendance request error:', error);
    return sendError(res, error.message, error.message, 400);
  }
};

/**
 * Get all manual attendance requests (requires permission)
 */
const getRequests = async (req, res) => {
  try {
    const { status, userId, startDate, endDate } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (userId) filters.userId = userId;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    const requests = await manualAttendanceRequestService.getAllRequests(filters);

    return sendSuccess(res, 'Requests retrieved successfully', { requests }, 200);
  } catch (error) {
    console.error('Get manual attendance requests error:', error);
    return sendServerError(res, 'Failed to retrieve requests', error.message);
  }
};

/**
 * Get current user's manual attendance requests
 */
const getMyRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    const requests = await manualAttendanceRequestService.getMyRequests(userId);

    return sendSuccess(res, 'Your requests retrieved successfully', { requests }, 200);
  } catch (error) {
    console.error('Get my requests error:', error);
    return sendServerError(res, 'Failed to retrieve your requests', error.message);
  }
};

/**
 * Approve a manual attendance request (requires permission)
 */
const approveRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { reviewNote } = req.body;
    const reviewerId = req.user.id;

    if (!id) {
      return sendError(res, 'Request ID is required', null, 400);
    }

    const request = await manualAttendanceRequestService.approveRequest(
      id,
      reviewerId,
      reviewNote || ''
    );

    return sendSuccess(res, 'Request approved and attendance created successfully', { request }, 200);
  } catch (error) {
    console.error('Approve request error:', error);
    return sendError(res, error.message, null, 400);
  }
};

/**
 * Reject a manual attendance request (requires permission)
 */
const rejectRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { reviewNote } = req.body;
    const reviewerId = req.user.id;

    if (!id) {
      return sendError(res, 'Request ID is required', null, 400);
    }

    const request = await manualAttendanceRequestService.rejectRequest(
      id,
      reviewerId,
      reviewNote || ''
    );

    return sendSuccess(res, 'Request rejected successfully', { request }, 200);
  } catch (error) {
    console.error('Reject request error:', error);
    return sendError(res, error.message, null, 400);
  }
};

/**
 * Delete a manual attendance request (pending only)
 */
const deleteRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return sendError(res, 'User ID is required', null, 400);
    }

    if (!id) {
      return sendError(res, 'Request ID is required', null, 400);
    }

    const result = await manualAttendanceRequestService.deleteRequest(id, userId);

    return sendSuccess(res, result.message, null, 200);
  } catch (error) {
    console.error('Delete request error:', error);
    
    if (error.message.includes('not found')) {
      return sendError(res, error.message, null, 404);
    }
    if (error.message.includes('only delete') || error.message.includes('Only pending')) {
      return sendError(res, error.message, null, 403);
    }
    
    return sendError(res, 'Failed to delete request', error.message, 500);
  }
};

module.exports = {
  createRequest,
  getRequests,
  getMyRequests,
  approveRequest,
  rejectRequest,
  deleteRequest
};
