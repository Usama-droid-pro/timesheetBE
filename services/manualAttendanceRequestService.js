const ManualAttendanceRequest = require('../models/ManualAttendanceRequest');
const User = require('../models/User');
const Team = require('../models/Team');
const { markManualAttendanceService } = require('./attendanceSystemService');
const moment = require('moment');
const ObjectId = require('mongoose').Types.ObjectId;
/**
 * Create a new manual attendance request
 */
async function createRequest(userId, date, checkInTime, checkOutTime, reason, options = {} , requestedBy) {
  try {
    // Validate user exists
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

        console.log("requesetdby" , requestedBy)



    // Get user's team
    const team = await Team.findOne({ members: userId });
    if (!team) {
      throw new Error('User is not assigned to any team');
    }


    // Check if request already exists for this date
    const existingRequest = await ManualAttendanceRequest.findOne({
      userId,
      date: new Date(date),
      status: { $in: ['Pending', 'Approved'] }
    });

    if (existingRequest) {
      throw new Error('A request already exists for this date');
    }

    // Create request
    const request = new ManualAttendanceRequest({
      userId,
      teamId: team._id,
      date: new Date(date),
      checkInTime,
      checkOutTime,
      reason,
      applyRules: options.applyRules !== false,
      isWorkedFromHome: options.isWorkedFromHome === true,
      status: 'Pending',
      requestedBy,
      requestedAt: new Date()
    });

    await request.save();

    // Populate user info before returning
    await request.populate('userId', 'name email');
    await request.populate('requestedBy', 'name email');

    return request;
  } catch (error) {
    console.error('Error creating manual attendance request:', error);
    throw error;
  }
}

/**
 * Get all requests with optional filters
 */
async function getAllRequests(filters = {}) {
  try {
    const query = {};

    // Filter by status
    if (filters.status) {
      query.status = filters.status;
    }

    // Filter by userId
    if (filters.userId) {
      query.userId = filters.userId;
    }

    // Filter by date range
    if (filters.startDate || filters.endDate) {
      query.date = {};
      if (filters.startDate) {
        query.date.$gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        query.date.$lte = new Date(filters.endDate);
      }
    }

    const requests = await ManualAttendanceRequest.find(query)
      .populate('userId', 'name email profilePic role')
      .populate('requestedBy', 'name email')
      .populate('reviewedBy', 'name email')
      .sort({ requestedAt: -1 });

    return requests;
  } catch (error) {
    console.error('Error getting manual attendance requests:', error);
    throw error;
  }
}

/**
 * Get requests for a specific user
 */
async function getMyRequests(userId) {
  try {
    const requests = await ManualAttendanceRequest.find({ requestedBy: userId })
      .populate('requestedBy', 'name email')
      .populate('reviewedBy', 'name email')
      .sort({ requestedAt: -1 });

    return requests;
  } catch (error) {
    console.error('Error getting user requests:', error);
    throw error;
  }
}

/**
 * Approve a manual attendance request
 */
async function approveRequest(requestId, reviewerId, reviewNote = '') {
  try {
    // Find the request
    const request = await ManualAttendanceRequest.findById(requestId);
    if (!request) {
      throw new Error('Request not found');
    }

    // Check if already processed
    if (request.status !== 'Pending') {
      throw new Error(`Request has already been ${request.status.toLowerCase()}`);
    }

    // Verify reviewer exists
    const reviewer = await User.findById(reviewerId);
    if (!reviewer) {
      throw new Error('Reviewer not found');
    }

    // Call the existing markManualAttendanceService to create attendance record
    await markManualAttendanceService(
      request.userId.toString(),
      moment(request.date).format('YYYY-MM-DD'),
      request.checkInTime,
      request.checkOutTime,
      null, // attendanceId (null for create)
      {
        applyRules: request.applyRules,
        isWorkedFromHome: request.isWorkedFromHome
      }
    );

    // Update request status
    request.status = 'Approved';
    request.reviewedBy = reviewerId;
    request.reviewedAt = new Date();
    request.reviewNote = reviewNote;

    await request.save();

    // Populate before returning
    await request.populate('userId', 'name email');
    await request.populate('reviewedBy', 'name email');

    return request;
  } catch (error) {
    console.error('Error approving request:', error);
    throw error;
  }
}

/**
 * Reject a manual attendance request
 */
async function rejectRequest(requestId, reviewerId, reviewNote = '') {
  try {
    // Find the request
    const request = await ManualAttendanceRequest.findById(requestId);
    if (!request) {
      throw new Error('Request not found');
    }

    // Check if already processed
    if (request.status !== 'Pending') {
      throw new Error(`Request has already been ${request.status.toLowerCase()}`);
    }

    // Verify reviewer exists
    const reviewer = await User.findById(reviewerId);
    if (!reviewer) {
      throw new Error('Reviewer not found');
    }

    // Update request status
    request.status = 'Rejected';
    request.reviewedBy = reviewerId;
    request.reviewedAt = new Date();
    request.reviewNote = reviewNote;

    await request.save();

    // Populate before returning
    await request.populate('userId', 'name email');
    await request.populate('reviewedBy', 'name email');

    return request;
  } catch (error) {
    console.error('Error rejecting request:', error);
    throw error;
  }
}

module.exports = {
  createRequest,
  getAllRequests,
  getMyRequests,
  approveRequest,
  rejectRequest
};
