const AttendanceSystem = require('../models/AttendanceSystem');
const User = require('../models/User');
const Team = require("../models/Team")
const moment = require('moment');
const { incrementBufferCounter, decrementBufferCounter, getCurrentMonthCounter } = require('./bufferCounterService');
const { getActiveSettings } = require('./systemSettingsService');
const {createNaiveMoment} = require('./attendance-automation');
const { getTeamByIdForUser } = require('./teamService');
const { createSettingsSnapshot } = require('./systemSettingsService');

async function markManualAttendanceService(userId, date, checkInTime, checkOutTime, attendanceId = null, options = {}) {
  try {   
    const applyRules = options.applyRules !== false; // default true
    const isWorkedFromHome = options.isWorkedFromHome === true; // default false
    let record;
    let workDate = date;
    if (attendanceId) {
      record = await AttendanceSystem.findById(attendanceId);
      if (!record) {
        throw new Error('Attendance record not found for update');
      }
      userId = record.userId;
      workDate = moment(record.date).format('YYYY-MM-DD');
    } else {
      const exists = await AttendanceSystem.findOne({
        userId,
        date: moment(date).format('YYYY-MM-DD')
      });

      if (exists) {
        throw new Error('Attendance record already exists for this date');
      }
    }
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const team = await Team.findOne({ members: user._id });
    if (!team) {
       throw new Error(`Team not found for user: ${user.name}`);
    }

    const settings = await getActiveSettings();
    // Pass workDate to get correct month's buffer counter (critical for retro entries)
    const bufferCounter = await getCurrentMonthCounter(user._id, workDate);

    // 3. Time parsing & Setup
    const officeStart = user.officeStartTime || settings.defaultOfficeStartTime;
    const officeEnd = user.officeEndTime || settings.defaultOfficeEndTime;

    // Create moments
    const start = createNaiveMoment(`${workDate} ${officeStart}:00`);
    const end = createNaiveMoment(`${workDate} ${officeEnd}:00`);
    const checkIn = createNaiveMoment(`${workDate} ${checkInTime}:00`); // manual input HH:mm
    let checkOut = createNaiveMoment(`${workDate} ${checkOutTime}:00`); // manual input HH:mm

    // Handle overnight: if checkOut < checkIn, assume next day
    if (checkOut.isBefore(checkIn)) {
      checkOut.add(1, 'day');
    }

    // 4. Calculations (Mirroring automation logic)
    const safeZoneEnd = start.clone().add(settings.safeZoneMinutes, 'minutes');
    const bufferAbused = bufferCounter.bufferAbusedReached;
    const effectiveBufferEnd = bufferAbused
        ? start.clone().add(settings.reducedBufferMinutes, 'minutes')
        : start.clone().add(settings.bufferTimeMinutes, 'minutes');

    let deductionMinutes = 0;
    let extraHoursMinutes = 0;
    let totalWorkMinutes = 0;
    const ruleApplied = {
        isLate: false,
        hasDeduction: false,
        hasExtraHours: false,
        isBufferUsed: false,
        isBufferAbused: bufferAbused,
        isSafeZone: false,
        isEarlyCheckout: false,
        isWorkedFromHome: isWorkedFromHome,
        noCalculationRulesApplied: !applyRules
    };
    let incrementBuffer = false;

    // Only apply calculation rules if applyRules is true
    if (applyRules) {
    if (checkIn.isAfter(effectiveBufferEnd)) {
        ruleApplied.isLate = true;
        ruleApplied.hasDeduction = true;
        deductionMinutes = checkIn.diff(start, 'minutes');
    } else if (checkIn.isAfter(safeZoneEnd)) {
        ruleApplied.isBufferUsed = true;
    } else {
      ruleApplied.isSafeZone = true;
    }

    if (checkOut.isBefore(end)) {
        ruleApplied.isEarlyCheckout = true;
        const earlyMinutes = end.diff(checkOut, 'minutes');
        deductionMinutes += earlyMinutes;
        ruleApplied.hasDeduction = true;

        if (ruleApplied.isBufferUsed) {
            const lateArrivalMinutes = checkIn.diff(start, 'minutes');
            deductionMinutes += lateArrivalMinutes;
        }
    }

    // === RULE 3: Calculate extra hours ===
    const totalWorkMinutes = checkOut.diff(checkIn, 'minutes');
    const requiredMinutes = end.diff(start, 'minutes');

    if (ruleApplied.isLate) {
        if (checkOut.isAfter(end)) {
            extraHoursMinutes = checkOut.diff(end, 'minutes');
            ruleApplied.hasExtraHours = true;
        }
    } else if (ruleApplied.isBufferUsed) {
        if (totalWorkMinutes > requiredMinutes) {
            extraHoursMinutes = totalWorkMinutes - requiredMinutes;
            ruleApplied.hasExtraHours = true;
        } else {
             if(ruleApplied.isEarlyCheckout){
                incrementBuffer = false;
            } else {
                incrementBuffer = true;
            }
        }
    } else {
        if (checkOut.isAfter(end)) {
            extraHoursMinutes = checkOut.diff(end, 'minutes');
            ruleApplied.hasExtraHours = true;
        }
    }

    } else {
        // No rules applied: all work time is extra hours
        totalWorkMinutes = checkOut.diff(checkIn, 'minutes');
        extraHoursMinutes = totalWorkMinutes;
        if (extraHoursMinutes > 0) {
            ruleApplied.hasExtraHours = true;
        }
    }

    // === RULE 5: Snapshot ===
    const snapshot = createSettingsSnapshot(settings);

    // Capture previous state for update scenario (before modifying record)
    const previouslyIncremented = attendanceId ? record.bufferIncrementedThisDay : false;

    // Save or Update
    if (attendanceId) {
      record.checkInTime = checkIn.format('HH:mm');
      record.checkOutTime = checkOut.format('HH:mm');
      record.totalWorkMinutes = totalWorkMinutes;
      record.deductionMinutes = deductionMinutes;
      record.extraHoursMinutes = extraHoursMinutes;
      record.ruleApplied = ruleApplied;
      record.bufferIncrementedThisDay = incrementBuffer;
      record.systemSettingsSnapshot = snapshot;
      record.calculatedAt = new Date();
    } else {
      record = new AttendanceSystem({
          userId,
          teamId: team._id,
          date: moment(workDate).toDate(),
          checkInTime: checkIn.format('HH:mm'),
          checkOutTime: checkOut.format('HH:mm'),
          officeStartTime: officeStart,
          officeEndTime: officeEnd,
          totalWorkMinutes,
          deductionMinutes,
          extraHoursMinutes,
          ruleApplied,
          bufferCountAtCalculation: bufferCounter.bufferUseCount,
          bufferIncrementedThisDay: incrementBuffer,
          systemSettingsSnapshot: snapshot,
          payoutMultiplier: user.payoutMultiplier,
          approvalStatus: 'Pending',
          calculatedAt: new Date(),
          isManualEntry: true
      });
    }

    await record.save();

    if (applyRules) {
      if (attendanceId) {
        if (incrementBuffer && !previouslyIncremented) {
          const counter = await incrementBufferCounter(user._id, workDate);
          
          if (counter.bufferAbusedReached) {
            await applyRetroactiveBufferDeductions(user._id, workDate);
          }
        } else if (!incrementBuffer && previouslyIncremented) {
          // Pass workDate to get correct month's counter
          const counterBefore = await getCurrentMonthCounter(user._id, workDate);
          const wasAbused = counterBefore.bufferAbusedReached;
          
          const counter = await decrementBufferCounter(user._id, workDate);
          
          if (wasAbused && !counter.bufferAbusedReached) {
            await undoRetroactiveBufferDeductions(user._id, workDate);
          }
        }
      } else {
        if (incrementBuffer) {
          const counter = await incrementBufferCounter(user._id, workDate);
          if (counter.bufferAbusedReached) {
            await applyRetroactiveBufferDeductions(user._id, workDate);
          }
        }
      }
    }

    return record;

  } catch (error) {
    console.error('Error marking manual attendance:', error);
    throw error;
  }
}

/**
 * Get attendance records with optional filters
 */
async function getAttendanceRecords(filters = {}) {
  try {
    const query = {};

    if (filters.userId) query.userId = filters.userId;
    if (filters.teamId) query.teamId = filters.teamId;
    if (filters.approvalStatus) query.approvalStatus = filters.approvalStatus;
    
    if (filters.startDate || filters.endDate) {
      query.date = {};
      if (filters.startDate) query.date.$gte = new Date(filters.startDate);
      if (filters.endDate) query.date.$lte = new Date(filters.endDate);
    }

    const records = await AttendanceSystem.find(query)
      .populate('userId', 'name email role')
      .populate('teamId', 'name')
      .sort({ date: -1 });

    return records;
  } catch (error) {
    console.error('Error fetching attendance records:', error);
    throw error;
  }
}

/**
 * Get attendance records for a specific user
 */
async function getAttendanceByUser(userId, startDate, endDate) {
  try {
    const query = { userId };
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const records = await AttendanceSystem.find(query).sort({ date: -1 });
    return records;
  } catch (error) {
    console.error('Error fetching user attendance:', error);
    throw error;
  }
}

/**
 * Get all attendance records for a specific date
 */
async function getAttendanceByDate(date) {
  try {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const records = await AttendanceSystem.find({
      date: { $gte: startOfDay, $lte: endOfDay }
    })
      .populate('userId', 'name email role')
      .populate('teamId', 'name');

    return records;
  } catch (error) {
    console.error('Error fetching attendance by date:', error);
    throw error;
  }
}

/**
 * Update approval status of an attendance record
 */
async function updateApprovalStatus(id, status, note = null) {
  try {
    const record = await AttendanceSystem.findById(id);
    
    if (!record) {
      throw new Error('Attendance record not found');
    }

    const previousStatus = record.approvalStatus;
    record.approvalStatus = status;
    if (note) record.note = note;

    // Buffer logic on rejection
    if (status === 'Rejected' && record.ruleApplied.isBufferUsed && !record.bufferIncrementedThisDay) {
      const counter = await incrementBufferCounter(record.userId, record.date);
      record.bufferIncrementedThisDay = true;
      record.bufferCountAtCalculation = counter.bufferUseCount;
      await record.save()

      // If buffer limit reached, apply retroactive deductions for the current month
      if (counter.bufferAbusedReached) {
        await applyRetroactiveBufferDeductions(record.userId, record.date);
      }
    } 
    // Buffer logic on status reversion (Rejected -> anything else)
    else if (status !== 'Rejected' && record.ruleApplied.isBufferUsed && record.bufferIncrementedThisDay) {
        // Find if user was in abuse mode before decrementing
        console.log("inside")
        // Pass record.date to get correct month's counter
        const counterBefore = await getCurrentMonthCounter(record.userId, record.date);
        const wasAbused = counterBefore.bufferAbusedReached;
        
        const counter = await decrementBufferCounter(record.userId, record.date);
        record.bufferIncrementedThisDay = false;
        record.bufferCountAtCalculation = counter.bufferUseCount;
        await record.save()

        // If they WERE in abuse mode but now ARE NOT
        if (wasAbused && !counter.bufferAbusedReached) {
            await undoRetroactiveBufferDeductions(record.userId, record.date);
        }
    }

        await record.save();

    return record;
  } catch (error) {
    console.error('Error updating approval status:', error);
    throw error;
  }
}

/**
 * Apply deductions to pending records when buffer limit is reached
 */
async function applyRetroactiveBufferDeductions(userId, referenceDate) {
  try {
    const settings = await getActiveSettings();
    const date = new Date(referenceDate);
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

    const pendingRecords = await AttendanceSystem.find({
      userId,
      approvalStatus: 'Pending',
      bufferIncrementedThisDay: false,
      date: { $gte: startOfMonth, $lte: endOfMonth },
      'ruleApplied.isBufferUsed': true
    });

    const createNaiveMoment = (timeStr) => {
        return moment(timeStr, 'YYYY-MM-DD HH:mm:ss');
    };

    for (const record of pendingRecords) {
      const workDate = moment(record.date).format('YYYY-MM-DD');
      const start = createNaiveMoment(`${workDate} ${record.officeStartTime}:00`);
      const checkIn = createNaiveMoment(`${workDate} ${record.checkInTime}:00`);
      
      const safeZoneEnd = start.clone().add(settings.safeZoneMinutes, 'minutes');
      const reducedBufferEnd = start.clone().add(settings.reducedBufferMinutes, 'minutes');

      // If check-in is after the reduced buffer (safe zone essentially), it's now late
      if (checkIn.isAfter(reducedBufferEnd)) {
        record.ruleApplied.isLate = true;
        record.ruleApplied.hasDeduction = true;
        record.ruleApplied.isBufferUsed = true;
        record.ruleApplied.isBufferAbused = true;
        
        // Calculate total deduction (Late arrival + any existing early checkout)
        let deductionMinutes = checkIn.diff(start, 'minutes');
        
        if (record.ruleApplied.isEarlyCheckout) {
          const end = createNaiveMoment(`${workDate} ${record.officeEndTime}:00`);
          const checkOut = createNaiveMoment(`${workDate} ${record.checkOutTime}:00`);
          const earlyMinutes = end.diff(checkOut, 'minutes');
          deductionMinutes += earlyMinutes;
        }

        record.deductionMinutes = deductionMinutes;
        
        // Extra hours in late scenario count after office end time
        if (record.extraHoursMinutes > 0) {
            const end = createNaiveMoment(`${workDate} ${record.officeEndTime}:00`);
            const checkOut = createNaiveMoment(`${workDate} ${record.checkOutTime}:00`);
            if (checkOut.isAfter(end)) {
                record.extraHoursMinutes = checkOut.diff(end, 'minutes');
            } else {
                record.extraHoursMinutes = 0;
                record.ruleApplied.hasExtraHours = false;
            }
        }

        await record.save();
      }
    }
  } catch (error) {
    console.error('Error applying retroactive deductions:', error);
  }
}

/**
 * Restore records when buffer limit is no longer reached
 */
async function undoRetroactiveBufferDeductions(userId, referenceDate) {
  try {
    const settings = await getActiveSettings();
    const date = new Date(referenceDate);
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

    // Find all records that were marked as abused in this month
    const affectedRecords = await AttendanceSystem.find({
      userId,
      date: { $gte: startOfMonth, $lte: endOfMonth },
      'ruleApplied.isBufferAbused': true
    });

    const createNaiveMoment = (timeStr) => {
        return moment(timeStr, 'YYYY-MM-DD HH:mm:ss');
    };

    for (const record of affectedRecords) {
      const workDate = moment(record.date).format('YYYY-MM-DD');
      const start = createNaiveMoment(`${workDate} ${record.officeStartTime}:00`);
      const checkIn = createNaiveMoment(`${workDate} ${record.checkInTime}:00`);
      const end = createNaiveMoment(`${workDate} ${record.officeEndTime}:00`);
      const checkOut = createNaiveMoment(`${workDate} ${record.checkOutTime}:00`);

      const bufferEnd = start.clone().add(settings.bufferTimeMinutes, 'minutes');

      // Check if it should be forgiven now (it should be within the full buffer)
      if (checkIn.isSameOrBefore(bufferEnd)) {
          record.ruleApplied.isLate = false;
          record.ruleApplied.hasDeduction = false;
          record.ruleApplied.isBufferUsed = true;
          record.ruleApplied.isBufferAbused = false;
          record.deductionMinutes = 0;

          // Recalculate based on early checkout if applicable
          if (record.ruleApplied.isEarlyCheckout) {
              const earlyMinutes = end.diff(checkOut, 'minutes');
              record.deductionMinutes = earlyMinutes;
              record.ruleApplied.hasDeduction = true;
          }

          // Recalculate extra hours (they are now counted after office end or 9 hours)
          if (record.ruleApplied.isEarlyCheckout) {
              record.extraHoursMinutes = 0;
              record.ruleApplied.hasExtraHours = false;
          } else {
              const workMins = record.totalWorkMinutes;
              const requiredMins = end.diff(start, 'minutes');
              if (workMins > requiredMins) {
                  record.extraHoursMinutes = workMins - requiredMins;
                  record.ruleApplied.hasExtraHours = true;
              }
          }
      } else {
          // Still late even with full buffer, just unset the abuse flag
          record.ruleApplied.isBufferAbused = false;
      }
      
      await record.save();
    }
  } catch (error) {
    console.error('Error undoing retroactive deductions:', error);
  }
}

/**
 * Get monthly statistics for a user
 */
async function getMonthlyStats(userId, month, year) {
  try {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const records = await AttendanceSystem.find({
      userId,
      date: { $gte: startDate, $lte: endDate }
    });

    const stats = {
      totalDays: records.length,
      totalExtraHoursMinutes: 0,
      totalDeductionMinutes: 0,
      totalWorkMinutes: 0,
      lateDays: 0,
      earlyCheckouts: 0,
      bufferUsedDays: 0,
      approvedRecords: 0,
      pendingRecords: 0,
      rejectedRecords: 0
    };

    records.forEach(record => {
      stats.totalExtraHoursMinutes += record.extraHoursMinutes;
      stats.totalDeductionMinutes += record.deductionMinutes;
      stats.totalWorkMinutes += record.totalWorkMinutes;
      
      if (record.ruleApplied.isLate) stats.lateDays++;
      if (record.ruleApplied.isEarlyCheckout) stats.earlyCheckouts++;
      if (record.ruleApplied.isBufferUsed) stats.bufferUsedDays++;
      
      if (record.approvalStatus === 'Approved') stats.approvedRecords++;
      else if (record.approvalStatus === 'Pending') stats.pendingRecords++;
      else if (record.approvalStatus === 'Rejected') stats.rejectedRecords++;
    });

    // Convert to hours for display
    stats.totalExtraHours = (stats.totalExtraHoursMinutes / 60).toFixed(2);
    stats.totalDeductionHours = (stats.totalDeductionMinutes / 60).toFixed(2);
    stats.totalWorkHours = (stats.totalWorkMinutes / 60).toFixed(2);

    return stats;
  } catch (error) {
    console.error('Error calculating monthly stats:', error);
    throw error;
  }
}

/**
 * Get single attendance record by ID
 */
async function getAttendanceById(id) {
  try {
    const record = await AttendanceSystem.findById(id)
      .populate('userId', 'name email role')
      .populate('teamId', 'name');
    
    if (!record) {
      throw new Error('Attendance record not found');
    }

    return record;
  } catch (error) {
    console.error('Error fetching attendance record:', error);
    throw error;
  }
}

/**
 * Toggle the ignoreDeduction flag
 */
async function toggleIgnoreDeduction(id, ignore) {
  try {
    const record = await AttendanceSystem.findById(id);
    if (!record) {
      throw new Error('Attendance record not found');
    }

    record.ignoreDeduction = ignore;
    await record.save();
    return record;
  } catch (error) {
    console.error('Error toggling ignoreDeduction:', error);
    throw error;
  }
}

/**
 * Add a second/third entry for a user on a specific date
 * This is for additional work sessions (e.g., work from home after office hours)
 * No attendance rules are applied - only work time and extra hours are tracked
 */
async function addSecondEntryService(userId, date, checkInTime, checkOutTime) {
  try {
    // 1. Fetch required data
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const team = await Team.findOne({ members: user._id });
    if (!team) {
      throw new Error(`Team not found for user: ${user.name}`);
    }

    const settings = await getActiveSettings();
    const workDate = date + "T00:00:00.000Z";

    // 2. Get user's office hours
    const officeStart = user.officeStartTime || settings.defaultOfficeStartTime;
    const officeEnd = user.officeEndTime || settings.defaultOfficeEndTime;

    // 3. Parse times
    const checkIn = createNaiveMoment(`${workDate} ${checkInTime}:00`);
    let checkOut = createNaiveMoment(`${workDate} ${checkOutTime}:00`);

    // Handle cross-midnight: if checkOut < checkIn, it's next day
    const isCrossMidnight = checkOut.isBefore(checkIn);
    if (isCrossMidnight) {
      checkOut.add(1, 'day');
    }

    // 4. Count existing entries to determine entry number
    const existingEntries = await AttendanceSystem.countDocuments({
      userId,
      date: workDate
    });
    
    // Entry number: if 1 exists = 2nd entry, if 2 exist = 3rd entry
    const baseEntryNo =  existingEntries ? existingEntries + 1 : 2;

    // 5. Create snapshot
    const snapshot = createSettingsSnapshot(settings);
    const endTime = createNaiveMoment(`${workDate} ${officeEnd}:00`);

    const records = [];

    // 6. Handle cross-midnight split
    if (!isCrossMidnight) {
      // Single day entry
      const totalWorkMinutes = checkOut.diff(checkIn, 'minutes');
      const extraHoursMinutes = totalWorkMinutes;

      const record = new AttendanceSystem({
        userId,
        teamId: team._id,
        date: workDate,
        checkInTime: checkIn.format('HH:mm'),
        checkOutTime: checkOut.format('HH:mm'),
        officeStartTime: officeStart,
        officeEndTime: officeEnd,
        totalWorkMinutes,
        deductionMinutes: 0,
        extraHoursMinutes,
        ruleApplied: {
          isLate: false,
          hasDeduction: false,
          hasExtraHours: extraHoursMinutes > 0,
          isBufferUsed: false,
          isBufferAbused: false,
          isSafeZone: false,
          isEarlyCheckout: false
        },
        bufferCountAtCalculation: 0,
        bufferIncrementedThisDay: false,
        systemSettingsSnapshot: snapshot,
        payoutMultiplier: user.payoutMultiplier,
        approvalStatus: 'Pending',
        calculatedAt: new Date(),
        isAnotherEntry: true,
        anotherEntryDetails: {
          entryNo: Math.min(baseEntryNo, 3),
          entryType: 'manual'
        }
      });

      await record.save();
      records.push(record);
    } else {
      // Cross-midnight: split into two records
      const day1End = createNaiveMoment(`${workDate} 23:59:00`);
      const day2Date = checkOut.format('YYYY-MM-DD');
      const day2Start = createNaiveMoment(`${day2Date} 00:00:00`);

      // Record 1: Day 1 (checkIn to 23:59)
      const day1WorkMinutes = day1End.diff(checkIn, 'minutes');
      const day1ExtraMinutes = day1WorkMinutes; // All is extra since it's after hours


      const record1 = new AttendanceSystem({
        userId,
        teamId: team._id,
        date: workDate,
        checkInTime: checkIn.format('HH:mm'),
        checkOutTime: '23:59',
        officeStartTime: officeStart,
        officeEndTime: officeEnd,
        totalWorkMinutes: day1WorkMinutes,
        deductionMinutes: 0,
        extraHoursMinutes: day1ExtraMinutes,
        ruleApplied: {
          isLate: false,
          hasDeduction: false,
          hasExtraHours: day1ExtraMinutes > 0,
          isBufferUsed: false,
          isBufferAbused: false,
          isSafeZone: false,
          isEarlyCheckout: false
        },
        bufferCountAtCalculation: 0,
        bufferIncrementedThisDay: false,
        systemSettingsSnapshot: snapshot,
        payoutMultiplier: user.payoutMultiplier,
        approvalStatus: 'Pending',
        calculatedAt: new Date(),
        isAnotherEntry: true,
        anotherEntryDetails: {
          entryNo: Math.min(baseEntryNo, 3),
          entryType: 'manual'
        }
      });

      await record1.save();
      records.push(record1);


      const existingDay2Entries = await AttendanceSystem.countDocuments({
        userId,
        date: day2Date
      });
      console.log("existingDay2Entries", existingDay2Entries)
      const day2EntryNo = existingDay2Entries ? existingDay2Entries + 1 : 2;

      const day2WorkMinutes = checkOut.diff(day2Start, 'minutes');

      const record2 = new AttendanceSystem({
        userId,
        teamId: team._id,
        date: day2Date,
        checkInTime: '00:00',
        checkOutTime: checkOut.format('HH:mm'),
        officeStartTime: officeStart,
        officeEndTime: officeEnd,
        totalWorkMinutes: day2WorkMinutes,
        deductionMinutes: 0,
        extraHoursMinutes: day2WorkMinutes, // All is extra
        ruleApplied: {
          isLate: false,
          hasDeduction: false,
          hasExtraHours: day2WorkMinutes > 0,
          isBufferUsed: false,
          isBufferAbused: false,
          isSafeZone: false,
          isEarlyCheckout: false
        },
        bufferCountAtCalculation: 0,
        bufferIncrementedThisDay: false,
        systemSettingsSnapshot: snapshot,
        payoutMultiplier: user.payoutMultiplier,
        approvalStatus: 'Pending',
        calculatedAt: new Date(),
        isAnotherEntry: true,
        anotherEntryDetails: {
          entryNo: Math.min(day2EntryNo, 3),
          entryType: 'manual'
        }
      });

      await record2.save();
      records.push(record2);
    }

    return records;
  } catch (error) {
    console.error('Error adding second entry:', error);
    throw error;
  }
}

/**
 * Delete an attendance entry
 * Handles buffer counter cleanup and retroactive deduction undo if needed
 */
async function deleteAttendanceEntry(id) {
  try {
    const record = await AttendanceSystem.findById(id);
    
    if (!record) {
      throw new Error('Attendance record not found');
    }

    // Check if this record had incremented the buffer
    const hadIncrementedBuffer = record.bufferIncrementedThisDay;
    const userId = record.userId;
    const date = record.date;

    // Delete the record first
    await AttendanceSystem.findByIdAndDelete(id);

    // If it had incremented buffer, we need to decrement and potentially undo retroactive
    if (hadIncrementedBuffer) {
      // Pass date to get correct month's counter
      const counterBefore = await getCurrentMonthCounter(userId, date);
      const wasAbused = counterBefore.bufferAbusedReached;
      
      const counter = await decrementBufferCounter(userId, date);
      
      // If they WERE in abuse mode but now ARE NOT, undo retroactive deductions
      if (wasAbused && !counter.bufferAbusedReached) {
        await undoRetroactiveBufferDeductions(userId, date);
      }
    }

    return { success: true, message: 'Attendance entry deleted successfully' };
  } catch (error) {
    console.error('Error deleting attendance entry:', error);
    throw error;
  }
}

/**
 * Adjust attendance hours manually (admin only)
 * Edits deductionMinutes/extraHoursMinutes directly and logs history
 */
async function adjustAttendanceHours(id, adjustmentData, adminUserId) {
  try {
    const record = await AttendanceSystem.findById(id);
    
    if (!record) {
      throw new Error('Attendance record not found');
    }

    const { 
      newDeductionMinutes, 
      newExtraHoursMinutes, 
      reason, 
      isHalfDay 
    } = adjustmentData;

    // Create history entry with current values before modification
    const historyEntry = {
      reason: reason || 'Manual adjustment',
      fromDeduction: record.deductionMinutes,
      toDeduction: newDeductionMinutes ?? record.deductionMinutes,
      fromExtra: record.extraHoursMinutes,
      toExtra: newExtraHoursMinutes ?? record.extraHoursMinutes,
      adjustedBy: adminUserId,
      adjustedAt: new Date()
    };

    // Push to history
    if (!record.adjustmentHistory) {
      record.adjustmentHistory = [];
    }
    record.adjustmentHistory.push(historyEntry);

    // Update values directly
    if (newDeductionMinutes !== undefined && newDeductionMinutes !== null) {
      record.deductionMinutes = newDeductionMinutes;
      record.ruleApplied.hasDeduction = newDeductionMinutes > 0;
    }
    
    if (newExtraHoursMinutes !== undefined && newExtraHoursMinutes !== null) {
      record.extraHoursMinutes = newExtraHoursMinutes;
      record.ruleApplied.hasExtraHours = newExtraHoursMinutes > 0;
    }

    // Set half day flag
    if (isHalfDay !== undefined) {
      record.isHalfDay = isHalfDay;
    }

    await record.save();
    return record;
  } catch (error) {
    console.error('Error adjusting attendance hours:', error);
    throw error;
  }
}

/**
 * Mark a day as leave or absent (creates minimal record with no calculations)
 */
async function markDayAsLeaveOrAbsent(userId, date, type, adminUserId) {
  try {
    // Check if record already exists for this date
    let record = await AttendanceSystem.findOne({ userId, date });
    const user = await User.findOne({ _id: userId });
    //find user team
      const team = await Team.findOne({ members: user._id });
         

    if (record) {
      // Update existing record
      record.isAbsent = type === 'absent';
      record.isPaidLeave = type === 'leave';
      
      // Clear attendance data
      record.checkInTime = null;
      record.checkOutTime = null;
      record.totalWorkMinutes = 0;
      record.deductionMinutes = 0;
      record.extraHoursMinutes = 0;
      record.bufferIncrementedThisDay = false;
      
      // Reset rules
      record.ruleApplied = {
        noCalculationRulesApplied: true
      };

      // Add Admin Action Log
      if (!record.adminActions) record.adminActions = [];
      record.adminActions.push({
        action: 'MARK_LEAVE_ABSENT',
        adminId: adminUserId,
        details: `Marked day as ${type} (Status Updated)`,
        timestamp: new Date()
      });

      await record.save();
      return record;
    }

    // Create minimal record with no calculations
    record = new AttendanceSystem({
      userId,
      teamId: team._id, 
      date,
      isAbsent: type === 'absent',
      isPaidLeave: type === 'leave',
      // Ensure null/0 for others
      checkInTime: null,
      checkOutTime: null,
      officeStartTime: user?.officeStartTime ,
      officeEndTime: user?.officeEndTime,
      totalWorkMinutes: 0,
      deductionMinutes: 0,
      extraHoursMinutes: 0,
      ruleApplied: {
        noCalculationRulesApplied: true
      },
      adminActions: [{
        action: 'MARK_LEAVE_ABSENT',
        adminId: adminUserId,
        details: `Marked day as ${type}`,
        timestamp: new Date()
      }],
      bufferCountAtCalculation: 0,
      bufferIncrementedThisDay: false,
      approvalStatus: 'NA',
      payoutMultiplier: 0,
      calculatedPayout: 0,
      ignoreDeduction: false,
      calculatedAt: new Date()
    });

    await record.save();
    return record;
  } catch (error) {
    console.error('Error marking day as leave/absent:', error);
    throw error;
  }
}

module.exports = {
  getAttendanceRecords,
  getAttendanceByUser,
  getAttendanceByDate,
  updateApprovalStatus,
  getMonthlyStats,
  getAttendanceById,
  toggleIgnoreDeduction,
  markManualAttendanceService,
  addSecondEntryService,
  deleteAttendanceEntry,
  adjustAttendanceHours,
  markDayAsLeaveOrAbsent
};
