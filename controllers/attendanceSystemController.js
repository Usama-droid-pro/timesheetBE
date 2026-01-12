const {
  getAttendanceRecords,
  getAttendanceByUser,
  getAttendanceByDate,
  updateApprovalStatus,
  bulkUpdateStatus,
  getGrandAttendanceReport,
  getMonthlyStats,
  getAttendanceById,
  toggleIgnoreDeduction,
  markManualAttendanceService,
  addSecondEntryService,
  deleteAttendanceEntry,
  adjustAttendanceHours,
  markDayAsLeaveOrAbsent
} = require('../services/attendanceSystemService');

/**
 * @route   GET /api/attendance-system
 * @desc    Get all attendance records with filters
 * @access  Private
 */


async function markManualAttendance(req, res) {
  try {
    const { userId, date, checkInTime, checkOutTime, id, applyRules, isWorkedFromHome } = req.body;

    const options = {
      applyRules: applyRules !== false,
      isWorkedFromHome: isWorkedFromHome === true
    };

    const record = await markManualAttendanceService(userId, date, checkInTime, checkOutTime, id, options);

    res.json({ success: true, data: record });
  }
  catch(err){
    console.error('Error marking manual attendance:', err);
    res.status(500).json({ success: false, message: 'Failed to mark attendance', error: err.message });
  }
}

/**
 * @route   POST /api/attendance-system/second-entry
 * @desc    Add a second/third entry for the same day
 * @access  Private/Admin
 */
async function addSecondEntry(req, res) {
  try {
    const { userId, date, checkInTime, checkOutTime } = req.body;

    if (!userId || !date || !checkInTime || !checkOutTime) {
      return res.status(400).json({ 
        success: false, 
        message: 'userId, date, checkInTime, and checkOutTime are required' 
      });
    }

    const records = await addSecondEntryService(userId, date, checkInTime, checkOutTime);

    res.json({ 
      success: true, 
      message: records.length > 1 ? 'Cross-midnight entry created as two records' : 'Second entry added successfully',
      data: records,
      count: records.length
    });
  } catch (err) {
    console.error('Error adding second entry:', err);
    res.status(500).json({ success: false, message: 'Failed to add second entry', error: err.message });
  }
}
async function getRecords(req, res) {
  try {
    const filters = {
      userId: req.query.userId,
      teamId: req.query.teamId,
      approvalStatus: req.query.approvalStatus,
      startDate: req.query.startDate,
      endDate: req.query.endDate
    };

    const records = await getAttendanceRecords(filters);
    res.json({ success: true, data: records, count: records.length });
  } catch (error) {
    console.error('Error fetching attendance records:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch records', error: error.message });
  }
}

/**
 * @route   GET /api/attendance-system/user/:userId
 * @desc    Get user-specific attendance records
 * @access  Private
 */
async function getUserRecords(req, res) {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    const records = await getAttendanceByUser(userId, startDate, endDate);
    res.json({ success: true, data: records, count: records.length });
  } catch (error) {
    console.error('Error fetching user records:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch records', error: error.message });
  }
}

/**
 * @route   GET /api/attendance-system/date/:date
 * @desc    Get all records for a specific date
 * @access  Private
 */
async function getByDate(req, res) {
  try {
    const { date } = req.params;
    const records = await getAttendanceByDate(date);
    res.json({ success: true, data: records, count: records.length });
  } catch (error) {
    console.error('Error fetching records by date:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch records', error: error.message });
  }
}

/**
 * @route   GET /api/attendance-system/:id
 * @desc    Get single attendance record details
 * @access  Private
 */
async function getById(req, res) {
  try {
    const { id } = req.params;
    const record = await getAttendanceById(id);
    res.json({ success: true, data: record });
  } catch (error) {
    console.error('Error fetching record:', error);
    res.status(404).json({ success: false, message: 'Record not found', error: error.message });
  }
}

/**
 * @route   PUT /api/attendance-system/:id/approval
 * @desc    Update approval status (Admin/PM only)
 * @access  Private/Admin
 */
async function updateApproval(req, res) {
  try {
    const { id } = req.params;
    const { status, note } = req.body;

    if (!['Pending', 'NA', 'Approved', 'SinglePay', 'Rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid approval status' });
    }

    const record = await updateApprovalStatus(id, status, note);
    res.json({ 
      success: true, 
      message: 'Approval status updated successfully', 
      data: record 
    });
  } catch (error) {
    console.error('Error updating approval:', error);
    res.status(500).json({ success: false, message: 'Failed to update approval', error: error.message });
  }
}

/**
 * @route   GET /api/attendance-system/stats/:userId/:month/:year
 * @desc    Get monthly statistics for user
 * @access  Private
 */
async function getStats(req, res) {
  try {
    const { userId, month, year } = req.params;
    const stats = await getMonthlyStats(userId, parseInt(month), parseInt(year));
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stats', error: error.message });
  }
}

/**
 * @route   PATCH /api/attendance-system/:id/ignore-deduction
 * @desc    Toggle ignoreDeduction flag
 * @access  Private/Admin
 */
async function updateIgnoreDeduction(req, res) {
  try {
    const { id } = req.params;
    const { ignore } = req.body;

    if (typeof ignore !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Invalid ignore value' });
    }

    const record = await toggleIgnoreDeduction(id, ignore);
    res.json({ 
      success: true, 
      message: `Deduction ${ignore ? 'ignored' : 'restored'} successfully`, 
      data: record 
    });
  } catch (error) {
    console.error('Error updating ignoreDeduction:', error);
    res.status(500).json({ success: false, message: 'Failed to update deduction status', error: error.message });
  }
}

/**
 * @route   DELETE /api/attendance-system/:id
 * @desc    Delete an attendance entry
 * @access  Private/Admin
 */
async function deleteEntry(req, res) {
  try {
    const { id } = req.params;

    const result = await deleteAttendanceEntry(id);
    res.json({ 
      success: true, 
      message: result.message
    });
  } catch (error) {
    console.error('Error deleting attendance entry:', error);
    res.status(500).json({ success: false, message: 'Failed to delete entry', error: error.message });
  }
}

/**
 * @route   PATCH /api/attendance-system/:id/adjust-hours
 * @desc    Adjust deduction/extra hours manually
 * @access  Private/Admin
 */
async function adjustHours(req, res) {
  try {
    const { id } = req.params;
    const { newDeductionMinutes, newExtraHoursMinutes, reason, isHalfDay } = req.body;
    const adminUserId = req.user?._id || req.body.adminUserId;

    if (!reason) {
      return res.status(400).json({ success: false, message: 'Reason is required for adjustment' });
    }

    const record = await adjustAttendanceHours(id, {
      newDeductionMinutes,
      newExtraHoursMinutes,
      reason,
      isHalfDay
    }, adminUserId);

    res.json({ 
      success: true, 
      message: 'Hours adjusted successfully',
      data: record
    });
  } catch (error) {
    console.error('Error adjusting hours:', error);
    res.status(500).json({ success: false, message: 'Failed to adjust hours', error: error.message });
  }
}

/**
 * @route   POST /api/attendance-system/mark-leave-absent
 * @desc    Mark a day as leave or absent
 * @access  Private/Admin
 */
async function markLeaveOrAbsent(req, res) {
  try {
    const { userId, date, type } = req.body;
    const adminUserId = req.user?._id || req.body.adminUserId;

    if (!userId || !date || !type) {
      return res.status(400).json({ success: false, message: 'userId, date, and type are required' });
    }

    if (!['leave', 'absent'].includes(type)) {
      return res.status(400).json({ success: false, message: 'type must be "leave" or "absent"' });
    }

    const record = await markDayAsLeaveOrAbsent(userId, date, type, adminUserId);

    res.json({ 
      success: true, 
      message: `Day marked as ${type} successfully`,
      data: record
    });
  } catch (error) {
    console.error('Error marking leave/absent:', error);
    res.status(500).json({ success: false, message: 'Failed to mark day', error: error.message });
  }
}

/**
 * @route   PATCH /api/attendance-system/bulk-approval
 * @desc    Bulk update approval status for multiple records
 * @access  Private/Admin
 */
async function bulkUpdateApproval(req, res) {
  try {
    const { recordIds, status, note } = req.body;

    // Validation
    if (!Array.isArray(recordIds) || recordIds.length === 0) {
      return res.status(400).json({ success: false, message: 'recordIds must be a non-empty array' });
    }

    if (!['Pending', 'NA', 'Approved', 'SinglePay', 'Rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid approval status' });
    }

    // Call service
    const result = await bulkUpdateStatus(recordIds, status, note);

    res.json({ 
      success: true, 
      message: result.message,
      data: result
    });
  } catch (error) {
    console.error('Error in bulk update:', error);
    
    // Check for month validation error
    if (error.message.includes('multiple months')) {
      return res.status(400).json({ 
        success: false, 
        message: error.message 
      });
    }

    res.status(500).json({ 
      success: false, 
      message: 'Failed to bulk update approval status', 
      error: error.message 
    });
  }
}

/**
 * @route   GET /api/attendance-system/grand-report
 * @desc    Get grand attendance report for all employees
 * @access  Private/Admin
 */
async function getGrandReport(req, res) {
  try {
    const { month, year, teamId } = req.query;

    // Validation
    if (!month || !year) {
      return res.status(400).json({ success: false, message: 'Month and year are required' });
    }

    const monthNum = parseInt(month);
    const yearNum = parseInt(year);

    if (monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ success: false, message: 'Invalid month (1-12)' });
    }

    if (yearNum < 2000 || yearNum > 2100) {
      return res.status(400).json({ success: false, message: 'Invalid year' });
    }

    // Call service
    const report = await getGrandAttendanceReport(monthNum, yearNum, teamId);

    res.json(report);
  } catch (error) {
    console.error('Error generating grand report:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to generate report', 
      error: error.message 
    });
  }
}

module.exports = {
  getRecords,
  getUserRecords,
  getByDate,
  getById,
  updateApproval,
  bulkUpdateApproval,
  getGrandReport,
  getStats,
  updateIgnoreDeduction,
  markManualAttendance,
  addSecondEntry,
  deleteEntry,
  adjustHours,
  markLeaveOrAbsent
};
