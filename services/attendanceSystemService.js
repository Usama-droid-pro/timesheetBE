const AttendanceSystem = require('../models/AttendanceSystem');
const User = require('../models/User');
const Team = require("../models/Team")
const moment = require('moment');
const { incrementBufferCounter, decrementBufferCounter, getCurrentMonthCounter } = require('./bufferCounterService');
const { getActiveSettings } = require('./systemSettingsService');
const { createNaiveMoment } = require('./attendance-automation');
const { getTeamByIdForUser } = require('./teamService');
const { createSettingsSnapshot } = require('./systemSettingsService');
const { isHoliday, calculateHolidayBonus, recalculateHolidayBonusForRecord } = require('./holidayService');
/**
 * Check if a date is a weekend (Saturday or Sunday)
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {boolean} - True if weekend, false otherwise
 */
function isWeekend(dateStr) {
  const date = new Date(dateStr);
  const day = date.getDay();
  return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}
function toUTCDateFromYMD(ymd) {
    const [y, m, d] = String(ymd).split('-').map(v => Number(v));
    if (!y || !m || !d) return new Date(ymd);
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
}


async function markManualAttendanceService(userId, date, checkInTime, checkOutTime, attendanceId = null, options = {}) {
  try {
    // Check if this is a weekend - weekends have special handling
    let workDate = date;
    const isWeekendWork = workDate ? isWeekend(workDate) : false;
    
    // For weekends: force no rules, all time is double-paid extra hours
    let applyRules = options.applyRules !== false; // default true
    const isWorkedFromHome = options.isWorkedFromHome === true; // default false
    
    if (isWeekendWork) {
      applyRules = false; // Never apply rules on weekends
      console.log(`[WEEKEND] Detected weekend work for date: ${workDate}. Rules bypassed, 2x multiplier applied.`);
    }
    
    let record;
    let isUpdate = false;
    
    if (attendanceId) {
      record = await AttendanceSystem.findById(attendanceId);
      if (!record) {
        throw new Error('Attendance record not found for update');
      }
      userId = record.userId;
      workDate = moment(record.date).format('YYYY-MM-DD');
      isUpdate = true;
    } else {
      const exists = await AttendanceSystem.findOne({
        userId,
        date: toUTCDateFromYMD(date)
      });

      console.log("exists",exists)

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
    const bufferCounter = await getCurrentMonthCounter(user._id, workDate);

    // 3. Time parsing & Setup
    const officeStart = settings.forceDefaultOfficeHours 
      ? settings.defaultOfficeStartTime 
      : (user.officeStartTime || settings.defaultOfficeStartTime);
    const officeEnd = settings.forceDefaultOfficeHours 
      ? settings.defaultOfficeEndTime 
      : (user.officeEndTime || settings.defaultOfficeEndTime);

    // Create moments - IMPORTANT: Use workDate from frontend, don't let system change timezone
    const start = createNaiveMoment(`${workDate} ${officeStart}:00`);
    const end = createNaiveMoment(`${workDate} ${officeEnd}:00`);
    const checkIn = createNaiveMoment(`${workDate} ${checkInTime}:00`); // manual input HH:mm
    let checkOut = createNaiveMoment(`${workDate} ${checkOutTime}:00`); // manual input HH:mm

    // Handle overnight: if checkOut < checkIn, assume next day
    if (checkOut.isBefore(checkIn)) {
      checkOut.add(1, 'day');
    }

    // === DETECT OVERNIGHT/MIDNIGHT CHECKOUT ===
    const isOvernight = checkOut.format('YYYY-MM-DD') !== workDate;
    
    if (isOvernight) {
      console.log(`[OVERNIGHT] Midnight checkout detected for ${user.name}. Check-in: ${workDate} ${checkInTime}, Check-out: ${checkOut.format('YYYY-MM-DD HH:mm')}`);
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

      // For overnight, don't check early checkout against original end time
      // We'll handle this in the split logic
      if (!isOvernight && checkOut.isBefore(end)) {
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
      totalWorkMinutes = checkOut.diff(checkIn, 'minutes');
      const requiredMinutes = end.diff(start, 'minutes');

      console.log("Checking")
      console.log(totalWorkMinutes, requiredMinutes)

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
          if (ruleApplied.isEarlyCheckout) {
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

      // === OPERATIONS TEAM EARLY ARRIVAL BONUS ===
      // If user is in Operations team and arrived BEFORE office start time,
      // add those early minutes as extra hours
      if (team.name === 'Operations' && checkIn.isBefore(start)) {
        const earlyArrivalMinutes = start.diff(checkIn, 'minutes');
        if (earlyArrivalMinutes > 0) {
          extraHoursMinutes += earlyArrivalMinutes;
          ruleApplied.hasExtraHours = extraHoursMinutes > 0;
          console.log(`[OPERATIONS] Early arrival bonus: +${earlyArrivalMinutes}min for ${user.name}`);
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

    console.log("Total work minutes" , totalWorkMinutes)

    // === RULE 5: Snapshot ===
    const snapshot = createSettingsSnapshot(settings);

    // Capture previous state for update scenario (before modifying record)
    const previouslyIncremented = attendanceId ? record.bufferIncrementedThisDay : false;

    // === HANDLE OVERNIGHT SPLIT OR REGULAR SAVE ===
    if (isUpdate && !isOvernight) {
      // UPDATE SCENARIO (NO OVERNIGHT): Just update the existing record
      record.checkInTime = checkIn.format('HH:mm');
      record.checkOutTime = checkOut.format('HH:mm');
      record.totalWorkMinutes = totalWorkMinutes;
      record.deductionMinutes = deductionMinutes;
      record.extraHoursMinutes = extraHoursMinutes;
      record.ruleApplied = ruleApplied;
      record.bufferIncrementedThisDay = incrementBuffer;
      record.systemSettingsSnapshot = snapshot;
      record.calculatedAt = new Date();
      
      // Recalculate holiday bonus if this is a holiday (only if not weekend)
      if (!record.isWeekendWork) {
        const isHolidayDate = await isHoliday(workDate);
        if (isHolidayDate) {
          const holidayBonusMinutes = calculateHolidayBonus(
            workDate,
            officeEnd,
            checkIn.format('HH:mm'),
            checkOut.format('HH:mm')
          );
          record.isHolidayWork = true;
          record.holidayBonusMinutes = holidayBonusMinutes;
          record.holidayBonusApplied = true;
          console.log(`[HOLIDAY] Updated holiday bonus for ${user.name}: ${holidayBonusMinutes} minutes (${(holidayBonusMinutes/60).toFixed(2)} hours)`);
        } else {
          record.isHolidayWork = false;
          record.holidayBonusMinutes = 0;
          record.holidayBonusApplied = false;
        }
      }
      
      await record.save();
      
    } else if (isUpdate && isOvernight) {
      // UPDATE SCENARIO (OVERNIGHT DETECTED): Delete original and create split records
      console.log(`[OVERNIGHT UPDATE] Deleting original record and creating split records for ${user.name}`);
      
      // Delete the original record
      await AttendanceSystem.findByIdAndDelete(attendanceId);
      console.log(`[OVERNIGHT UPDATE] Original record deleted: ${attendanceId}`);
      
      const day1End = createNaiveMoment(`${workDate} 23:59:00`);
      const day2Date = checkOut.format('YYYY-MM-DD');
      const day2Start = createNaiveMoment(`${day2Date} 00:00:00`);

      // === RECORD 1: Day 1 (check-in to 23:59) ===
      const day1WorkMinutes = day1End.diff(checkIn, 'minutes');
      
      // Recalculate for day 1 only
      let day1ExtraMinutes = 0;
      if (applyRules) {
        // Extra hours for day 1: time after office end
        if (day1End.isAfter(end)) {
          day1ExtraMinutes = day1End.diff(end, 'minutes');
        }
        
        // Add Operations early arrival bonus if applicable
        if (team.name === 'Operations' && checkIn.isBefore(start)) {
          const earlyArrivalMinutes = start.diff(checkIn, 'minutes');
          if (earlyArrivalMinutes > 0) {
            day1ExtraMinutes += earlyArrivalMinutes;
          }
        }
      } else {
        // No rules: all time is extra
        day1ExtraMinutes = day1WorkMinutes;
      }
      
      // Check for holiday work on day 1 (only if not weekend)
      const day1IsWeekend = isWeekend(workDate);
      let day1IsHoliday = false;
      let day1HolidayBonus = 0;
      
      if (!day1IsWeekend) {
        day1IsHoliday = await isHoliday(workDate);
        if (day1IsHoliday) {
          day1HolidayBonus = calculateHolidayBonus(
            workDate,
            officeEnd,
            checkInTime,
            '23:59'
          );
          console.log(`[HOLIDAY] Day 1 holiday work detected for ${user.name}. Bonus: ${day1HolidayBonus} minutes`);
        }
      }
      
      const day1Multiplier = day1IsWeekend ? 2 : user.payoutMultiplier;
      
      record = new AttendanceSystem({
        userId,
        teamId: team._id,
        date: toUTCDateFromYMD(workDate),
        checkInTime: checkIn.format('HH:mm'),
        checkOutTime: '23:59',
        officeStartTime: officeStart,
        officeEndTime: officeEnd,
        totalWorkMinutes: day1WorkMinutes,
        deductionMinutes, // All deduction on day 1
        extraHoursMinutes: day1ExtraMinutes,
        ruleApplied,
        bufferCountAtCalculation: bufferCounter.bufferUseCount,
        bufferIncrementedThisDay: incrementBuffer,
        systemSettingsSnapshot: snapshot,
        payoutMultiplier: day1Multiplier,
        approvalStatus: 'Pending',
        calculatedAt: new Date(),
        isManualEntered: true,
        isWeekendWork: day1IsWeekend,
        isHolidayWork: day1IsHoliday,
        holidayBonusMinutes: day1HolidayBonus,
        holidayBonusApplied: day1IsHoliday
      });
      
      await record.save();
      console.log(`[OVERNIGHT UPDATE] Day 1 record saved: ${workDate} ${checkIn.format('HH:mm')} - 23:59`);

      // === RECORD 2: Day 2 (00:00 to checkout) ===
      const day2WorkMinutes = checkOut.diff(day2Start, 'minutes');
      
      // Check for weekend/holiday on day 2
      const day2IsWeekend = isWeekend(day2Date);
      let day2IsHoliday = false;
      let day2HolidayBonus = 0;
      
      if (!day2IsWeekend) {
        day2IsHoliday = await isHoliday(day2Date);
        if (day2IsHoliday) {
          day2HolidayBonus = calculateHolidayBonus(
            day2Date,
            officeEnd,
            '00:00',
            checkOut.format('HH:mm')
          );
          console.log(`[HOLIDAY] Day 2 holiday work detected for ${user.name}. Bonus: ${day2HolidayBonus} minutes`);
        }
      }
      
      const day2Multiplier = day2IsWeekend ? 2 : user.payoutMultiplier;
      
      const secondRecord = new AttendanceSystem({
        userId,
        teamId: team._id,
        date: toUTCDateFromYMD(day2Date),
        checkInTime: '00:00',
        checkOutTime: checkOut.format('HH:mm'),
        officeStartTime: officeStart,
        officeEndTime: officeEnd,
        totalWorkMinutes: day2WorkMinutes,
        deductionMinutes: 0, // No deduction on day 2
        extraHoursMinutes: day2WorkMinutes, // All day 2 time is extra
        ruleApplied: {
          isLate: false,
          hasDeduction: false,
          hasExtraHours: day2WorkMinutes > 0,
          isBufferUsed: false,
          isBufferAbused: false,
          isSafeZone: false,
          isEarlyCheckout: false,
          isWorkedFromHome: isWorkedFromHome,
          noCalculationRulesApplied: !applyRules
        },
        bufferCountAtCalculation: bufferCounter.bufferUseCount,
        bufferIncrementedThisDay: false, // Only day 1 affects buffer
        systemSettingsSnapshot: snapshot,
        payoutMultiplier: day2Multiplier,
        approvalStatus: 'Pending',
        calculatedAt: new Date(),
        isManualEntered: true,
        isAnotherEntry: true,
        anotherEntryDetails: {
          entryNo: 2,
          entryType: 'manual'
        },
        isWeekendWork: day2IsWeekend,
        isHolidayWork: day2IsHoliday,
        holidayBonusMinutes: day2HolidayBonus,
        holidayBonusApplied: day2IsHoliday
      });
      
      await secondRecord.save();
      console.log(`[OVERNIGHT UPDATE] Day 2 record saved: ${day2Date} 00:00 - ${checkOut.format('HH:mm')}`);
      
    } else if (!isOvernight) {
      // CREATE SCENARIO - SINGLE DAY RECORD
      const finalMultiplier = isWeekendWork ? 2 : user.payoutMultiplier;
      
      // Check for holiday work (only if not weekend - weekend takes precedence)
      let isHolidayWork = false;
      let holidayBonusMinutes = 0;
      
      if (!isWeekendWork) {
        isHolidayWork = await isHoliday(workDate);
        if (isHolidayWork) {
          holidayBonusMinutes = calculateHolidayBonus(
            workDate,
            officeEnd,
            checkInTime,
            checkOutTime
          );
          console.log(`[HOLIDAY] Holiday work detected for ${user.name}. Bonus: ${holidayBonusMinutes} minutes (${(holidayBonusMinutes/60).toFixed(2)} hours)`);
        }
      }
      
      record = new AttendanceSystem({
        userId,
        teamId: team._id,
        date: toUTCDateFromYMD(workDate),
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
        payoutMultiplier: finalMultiplier,
        approvalStatus: 'Pending',
        calculatedAt: new Date(),
        isManualEntered: true,
        isWeekendWork: isWeekendWork,
        isHolidayWork: isHolidayWork,
        holidayBonusMinutes: holidayBonusMinutes,
        holidayBonusApplied: isHolidayWork
      });
      
      await record.save();
      
    } else {
      // CREATE SCENARIO - OVERNIGHT: SPLIT INTO TWO RECORDS
      console.log(`[OVERNIGHT] Splitting record into two entries for ${user.name}`);
      
      const day1End = createNaiveMoment(`${workDate} 23:59:00`);
      const day2Date = checkOut.format('YYYY-MM-DD');
      const day2Start = createNaiveMoment(`${day2Date} 00:00:00`);

      // === RECORD 1: Day 1 (check-in to 23:59) ===
      const day1WorkMinutes = day1End.diff(checkIn, 'minutes');
      
      // Recalculate for day 1 only
      let day1ExtraMinutes = 0;
      if (applyRules) {
        // Extra hours for day 1: time after office end
        if (day1End.isAfter(end)) {
          day1ExtraMinutes = day1End.diff(end, 'minutes');
        }
        
        // Add Operations early arrival bonus if applicable
        if (team.name === 'Operations' && checkIn.isBefore(start)) {
          const earlyArrivalMinutes = start.diff(checkIn, 'minutes');
          if (earlyArrivalMinutes > 0) {
            day1ExtraMinutes += earlyArrivalMinutes;
          }
        }
      } else {
        // No rules: all time is extra
        day1ExtraMinutes = day1WorkMinutes;
      }
      
      // Check for holiday work on day 1 (only if not weekend)
      const day1IsWeekend = isWeekend(workDate);
      let day1IsHoliday = false;
      let day1HolidayBonus = 0;
      
      if (!day1IsWeekend) {
        day1IsHoliday = await isHoliday(workDate);
        if (day1IsHoliday) {
          day1HolidayBonus = calculateHolidayBonus(
            workDate,
            officeEnd,
            checkInTime,
            '23:59'
          );
          console.log(`[HOLIDAY] Day 1 holiday work detected for ${user.name}. Bonus: ${day1HolidayBonus} minutes`);
        }
      }
      
      const day1Multiplier = day1IsWeekend ? 2 : user.payoutMultiplier;
      
      record = new AttendanceSystem({
        userId,
        teamId: team._id,
        date: toUTCDateFromYMD(workDate),
        checkInTime: checkIn.format('HH:mm'),
        checkOutTime: '23:59',
        officeStartTime: officeStart,
        officeEndTime: officeEnd,
        totalWorkMinutes: day1WorkMinutes,
        deductionMinutes, // All deduction on day 1
        extraHoursMinutes: day1ExtraMinutes,
        ruleApplied,
        bufferCountAtCalculation: bufferCounter.bufferUseCount,
        bufferIncrementedThisDay: incrementBuffer,
        systemSettingsSnapshot: snapshot,
        payoutMultiplier: day1Multiplier,
        approvalStatus: 'Pending',
        calculatedAt: new Date(),
        isManualEntered: true,
        isWeekendWork: day1IsWeekend,
        isHolidayWork: day1IsHoliday,
        holidayBonusMinutes: day1HolidayBonus,
        holidayBonusApplied: day1IsHoliday
      });
      
      await record.save();
      console.log(`[OVERNIGHT] Day 1 record saved: ${workDate} ${checkIn.format('HH:mm')} - 23:59`);

      // === RECORD 2: Day 2 (00:00 to checkout) ===
      const day2WorkMinutes = checkOut.diff(day2Start, 'minutes');
      
      // Check for weekend/holiday on day 2
      const day2IsWeekend = isWeekend(day2Date);
      let day2IsHoliday = false;
      let day2HolidayBonus = 0;
      
      if (!day2IsWeekend) {
        day2IsHoliday = await isHoliday(day2Date);
        if (day2IsHoliday) {
          day2HolidayBonus = calculateHolidayBonus(
            day2Date,
            officeEnd,
            '00:00',
            checkOut.format('HH:mm')
          );
          console.log(`[HOLIDAY] Day 2 holiday work detected for ${user.name}. Bonus: ${day2HolidayBonus} minutes`);
        }
      }
      
      const day2Multiplier = day2IsWeekend ? 2 : user.payoutMultiplier;
      
      const secondRecord = new AttendanceSystem({
        userId,
        teamId: team._id,
        date: toUTCDateFromYMD(day2Date),
        checkInTime: '00:00',
        checkOutTime: checkOut.format('HH:mm'),
        officeStartTime: officeStart,
        officeEndTime: officeEnd,
        totalWorkMinutes: day2WorkMinutes,
        deductionMinutes: 0, // No deduction on day 2
        extraHoursMinutes: day2WorkMinutes, // All day 2 time is extra
        ruleApplied: {
          isLate: false,
          hasDeduction: false,
          hasExtraHours: day2WorkMinutes > 0,
          isBufferUsed: false,
          isBufferAbused: false,
          isSafeZone: false,
          isEarlyCheckout: false,
          isWorkedFromHome: isWorkedFromHome,
          noCalculationRulesApplied: !applyRules
        },
        bufferCountAtCalculation: bufferCounter.bufferUseCount,
        bufferIncrementedThisDay: false, // Only day 1 affects buffer
        systemSettingsSnapshot: snapshot,
        payoutMultiplier: day2Multiplier,
        approvalStatus: 'Pending',
        calculatedAt: new Date(),
        isManualEntered: true,
        isAnotherEntry: true,
        anotherEntryDetails: {
          entryNo: 2,
          entryType: 'manual'
        },
        isWeekendWork: day2IsWeekend,
        isHolidayWork: day2IsHoliday,
        holidayBonusMinutes: day2HolidayBonus,
        holidayBonusApplied: day2IsHoliday
      });
      
      await secondRecord.save();
      console.log(`[OVERNIGHT] Day 2 record saved: ${day2Date} 00:00 - ${checkOut.format('HH:mm')}`);
    }

    // Buffer counter updates (only for non-update scenarios and when rules apply)
    if (applyRules && !isUpdate) {
      if (incrementBuffer) {
        const counter = await incrementBufferCounter(user._id, workDate);
        if (counter.bufferAbusedReached) {
          await applyRetroactiveBufferDeductions(user._id, workDate);
        }
      }
    } else if (applyRules && isUpdate) {
      if (incrementBuffer && !previouslyIncremented) {
        const counter = await incrementBufferCounter(user._id, workDate);
        if (counter.bufferAbusedReached) {
          await applyRetroactiveBufferDeductions(user._id, workDate);
        }
      } else if (!incrementBuffer && previouslyIncremented) {
        const counterBefore = await getCurrentMonthCounter(user._id, workDate);
        const wasAbused = counterBefore.bufferAbusedReached;
        const counter = await decrementBufferCounter(user._id, workDate);
        if (wasAbused && !counter.bufferAbusedReached) {
          await undoRetroactiveBufferDeductions(user._id, workDate);
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
    const userBufferCount = await getCurrentMonthCounter(record.userId, record.date);
    console.log("userBufferCount" , userBufferCount)

    // Skip buffer logic entirely for weekend work
    // Weekends don't use buffer rules, so approval/rejection shouldn't affect buffer counter
    if (!record.isWeekendWork) {
      // Buffer logic on rejection
      if (status === 'Rejected' && record.ruleApplied.isBufferUsed && !record.bufferIncrementedThisDay) {
        console.log("record" , record)
        if(!userBufferCount.bufferAbusedReached){
           const counter = await incrementBufferCounter(record.userId, record.date);
        record.bufferIncrementedThisDay = true;
        record.bufferCountAtCalculation = counter.bufferUseCount;
        await record.save()

        // If buffer limit reached, apply retroactive deductions for the current month
        if (counter.bufferAbusedReached) {
          await applyRetroactiveBufferDeductions(record.userId, record.date);
        }
        }
       
      }
      // Buffer logic on status reversion (Rejected -> anything else)
      else if (status !== 'Rejected' && record.ruleApplied.isBufferUsed && record.bufferIncrementedThisDay) {
        // Find if user was in abuse mode before decrementing
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
    } else {
      console.log(`[WEEKEND] Skipping buffer logic for weekend work on ${record.date}`);
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
        const bufferCounter = await getCurrentMonthCounter(user._id, workDate);


    // Get user's office hours (or defaults)
    const officeStart = settings.forceDefaultOfficeHours 
      ? settings.defaultOfficeStartTime 
      : (user.officeStartTime || settings.defaultOfficeStartTime);
    const officeEnd = settings.forceDefaultOfficeHours 
      ? settings.defaultOfficeEndTime 
      : (user.officeEndTime || settings.defaultOfficeEndTime);

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
    const baseEntryNo = existingEntries ? existingEntries + 1 : 2;

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
      officeStartTime: user?.officeStartTime,
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

/**
 * Bulk update approval status for multiple records
 * CRITICAL: Only processes records from the same month (buffer counters are per-month)
 */
async function bulkUpdateStatus(recordIds, status, note = null) {
  try {
    // 1. Fetch all records with user info, sorted by date (chronological processing is critical)
    const records = await AttendanceSystem.find({ _id: { $in: recordIds } })
      .populate('userId', 'name')
      .sort({ date: 1 }); // Ascending order - MUST process oldest first

    if (records.length === 0) {
      throw new Error('No records found with the provided IDs');
    }


    // 1.5 VALIDATE: All records must be from the same month
    const months = new Set(records.map(r => {
      const date = new Date(r.date);
      return `${date.getFullYear()}-${date.getMonth()}`;
    }));

    if (months.size > 1) {
      throw new Error('Bulk update cannot span multiple months. Buffer counters are tracked per month.');
    }

    // 2. Group records by userId (each user has separate buffer counter)
    const groupedByUser = {};
    records.forEach(record => {
      const userId = record.userId._id.toString();
      if (!groupedByUser[userId]) {
        groupedByUser[userId] = [];
      }
      groupedByUser[userId].push(record);
    });

    // 3. Process each user's records
    const results = [];
    let totalProcessed = 0;
    let weekendSkipped = 0;

    for (const [userId, userRecords] of Object.entries(groupedByUser)) {
      // Already sorted by date from initial query
      const userName = userRecords[0].userId.name;
      
      // Get the month's buffer counter (use first record's date as reference)
      const referenceDate = userRecords[0].date;
      const initialCounter = await getCurrentMonthCounter(userId, referenceDate);
      let bufferChanges = 0;

      // Track if we need to apply/undo retroactive deductions
      let needsRetroactive = false;
      let needsUndoRetroactive = false;
      const wasAbusedInitially = initialCounter.bufferAbusedReached;

      // Process each record chronologically
      for (const record of userRecords) {
        const previousStatus = record.approvalStatus;
        record.approvalStatus = status;
        if (note) record.note = note;

        // Skip buffer logic for weekend work
        if (record.isWeekendWork) {
          weekendSkipped++;
          await record.save();
          totalProcessed++;
          continue;
        }

        const userBufferCount = await getCurrentMonthCounter(userId, record.date);

        // Buffer logic (same as single update but tracking changes)
        if (status === 'Rejected' && record.ruleApplied.isBufferUsed && !record.bufferIncrementedThisDay) {
          // Only increment if buffer limit hasn't been reached yet
          if (!userBufferCount.bufferAbusedReached) {
            const counter = await incrementBufferCounter(userId, record.date);
            record.bufferIncrementedThisDay = true;
            record.bufferCountAtCalculation = counter.bufferUseCount;
            bufferChanges++;
            
            // Check if this push triggered buffer abuse
            if (counter.bufferAbusedReached && !wasAbusedInitially) {
              needsRetroactive = true;
            }
          }
        }
        else if (status !== 'Rejected' && record.ruleApplied.isBufferUsed && record.bufferIncrementedThisDay) {
          // Get counter state before decrementing
          const counterBefore = await getCurrentMonthCounter(userId, record.date);
          const wasAbused = counterBefore.bufferAbusedReached;

          const counter = await decrementBufferCounter(userId, record.date);
          record.bufferIncrementedThisDay = false;
          record.bufferCountAtCalculation = counter.bufferUseCount;
          bufferChanges--;

          // Check if decrement removed abuse status
          if (wasAbused && !counter.bufferAbusedReached) {
            needsUndoRetroactive = true;
          }
        }

        await record.save();
        totalProcessed++;
      }

      // Apply retroactive actions once at the end
      if (needsRetroactive) {
        await applyRetroactiveBufferDeductions(userId, referenceDate);
      } else if (needsUndoRetroactive) {
        await undoRetroactiveBufferDeductions(userId, referenceDate);
      }

      results.push({
        userId,
        userName,
        recordsProcessed: userRecords.length,
        bufferImpact: bufferChanges
      });
    }

    return {
      success: true,
      totalProcessed,
      weekendSkipped,
      userBreakdown: results,
      message: `Successfully updated ${totalProcessed} records`
    };

  } catch (error) {
    console.error('Error in bulk update:', error);
    throw error;
  }
}

/**
 * Get grand attendance report for all employees
 * @param {number} month - Month (1-12)
 * @param {number} year - Year
 * @param {string} teamId - Optional team filter
 * @param {string} userId - Optional user filter (for specific user report)
 */
async function getGrandAttendanceReport(month, year, teamId = null, userId = null) {
  try {
    // 1. Get all users (filtered by team if provided or specific user)
    let dataFound = false;
    let users;
    
    if (userId) {
      // Specific user requested
      const user = await User.findById(userId);
      users = user ? [user] : [];
    } else if (teamId) {
      const team = await Team.findById(teamId).populate('members');
      users = team ? team.members : [];
    } else {
      users = await User.find({active : true , isDeleted : false , role : {$ne : 'Admin'}});
    }


    // 2. Calculate date range for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    // 3. For each user, aggregate their attendance
    const employeeReports = await Promise.all(
      users.map(async (user) => {
        const records = await AttendanceSystem.find({
          userId: user._id,
          date: { $gte: startDate, $lte: endDate },
        
        }).populate('teamId', 'name');
        if(records.length > 0){
          dataFound = true;
        }

        // Calculate totals
        let totalExtraHours = 0;
        let approvedExtraHours = 0;
        let singlePaidHours = 0;
        let doublePaidHours = 0;
        let rejectedHours = 0;
        let pendingHours = 0;
        let finalDeductions = 0;
        let absentDays = 0;
        let leaveDays = 0;
        let holidayBonusHours = 0;
        let manualEntriesCount = 0;
        let lateDaysCount = 0;

        // Track which days have records
        const recordedDays = new Set();

        records.forEach(record => {
          // Track day
          const dayOfMonth = new Date(record.date).getDate();
          recordedDays.add(dayOfMonth);

          // Aggregate extra hours
          totalExtraHours += record.extraHoursMinutes || 0;
          
          // Track holiday bonus separately
          holidayBonusHours += record.holidayBonusMinutes || 0;
          
          // Aggregate deductions
          finalDeductions += record.deductionMinutes || 0;

          // Count absences and leaves
          if (record.isAbsent) {
            absentDays++;
          }
          if (record.isPaidLeave) {
            leaveDays++;
          }

          // Categorize by approval status
          if (record.approvalStatus === 'Approved') {
            const multiplier = record.payoutMultiplier || 2;
            approvedExtraHours += record.extraHoursMinutes || 0;
            
            if (multiplier === 2) {
              doublePaidHours += record.extraHoursMinutes || 0;
            } else {
              singlePaidHours += record.extraHoursMinutes || 0;
            }
          } else if (record.approvalStatus === 'SinglePay') {
            approvedExtraHours += record.extraHoursMinutes || 0;
            singlePaidHours += record.extraHoursMinutes || 0;
          } else if (record.approvalStatus === 'Rejected') {
            rejectedHours += record.extraHoursMinutes || 0;
          } else if (record.approvalStatus === 'Pending' || record.approvalStatus === 'NA') {
            pendingHours += record.extraHoursMinutes || 0;
          }
          
          // Count manual entries
          if (record.isManualEntered) {
            manualEntriesCount++;
          }
          
          // Count late arrivals
          if (record.ruleApplied && record.ruleApplied.isLate) {
            lateDaysCount++;
          }
        });

        // Calculate missing days (absent days not explicitly marked)
        // Only count weekdays, exclude weekends and exclude today if month is ongoing
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Reset to start of day for comparison
        
        // Determine last day to check:
        // - If month has passed: use end of month
        // - If month is current/future: use yesterday (exclude today since it's not complete)
        let lastDayToCheck;
        if (endDate < today) {
          // Month has already passed, check until end of month
          lastDayToCheck = new Date(endDate);
        } else {
          // Month is ongoing, exclude today (use yesterday)
          lastDayToCheck = new Date(today);
          lastDayToCheck.setDate(lastDayToCheck.getDate() - 1);
        }
        
        // Ensure we don't go before the start of the month
        if (lastDayToCheck < startDate) {
          lastDayToCheck = new Date(startDate);
        }
        
        // Count expected weekdays (Mon-Fri only)
        let expectedWeekdays = 0;
        const currentDate = new Date(startDate);
        while (currentDate <= lastDayToCheck) {
          const dayOfWeek = currentDate.getDay();
          // 0 = Sunday, 6 = Saturday - only count Mon-Fri
          if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            expectedWeekdays++;
          }
          currentDate.setDate(currentDate.getDate() + 1);
        }
        
        // Count recorded weekdays
        let recordedWeekdays = 0;
        recordedDays.forEach(day => {
          const date = new Date(year, month - 1, day);
          const dayOfWeek = date.getDay();
          // Only count if it's a weekday and within our check range
          if (dayOfWeek !== 0 && dayOfWeek !== 6 && date <= lastDayToCheck) {
            recordedWeekdays++;
          }
        });
        
        const missingWeekdays = expectedWeekdays - recordedWeekdays;
        absentDays += missingWeekdays;

        // Final extra hours to pay = (double paid × 2) + single paid + holiday bonus (1x)
        const finalExtraHoursToPay = (doublePaidHours * 2) + singlePaidHours + holidayBonusHours;

        


        return {
          userId: user._id,
          name: user.name,
          email: user.email,
          totalExtraHours,
          approvedExtraHours,
          singlePaidHours,
          finalExtraHoursToPay,
          finalDeductions,
          absentDays,
          leaveDays,
          holidayBonusHours, // Separate holiday bonus
          manualEntriesCount, // New metric
          lateDaysCount, // New metric
          breakdown: {
            doublePaidHours,
            singlePaidHours,
            rejectedHours,
            pendingHours
          }
        };
      })
    );

    

    return {
      success: true,
      month,
      year,
      employees: dataFound ? employeeReports : []
    };
  } catch (error) {
    console.error('Error generating grand attendance report:', error);
    throw error;
  }
}

/**
 * Update description for an attendance entry
 * Only the owner can update, and only for entries with extra hours
 */
async function updateAttendanceDescription(attendanceId, userId, description) {
  try {
    // Find the attendance record
    const attendance = await AttendanceSystem.findById(attendanceId);
    
    if (!attendance) {
      throw new Error('Attendance record not found');
    }
    
    // Verify ownership - user can only update their own entries
    if (attendance?.userId?.toString() !== userId?.toString()) {
      throw new Error('You can only update descriptions for your own attendance entries');
    }
    
    // Verify entry has extra hours
    if (!attendance.extraHoursMinutes || attendance.extraHoursMinutes <= 0) {
      throw new Error('Descriptions can only be added to entries with extra hours');
    }
    
    // Update description
    attendance.description = description.trim();
    await attendance.save();
    
    return {
      success: true,
      message: 'Description updated successfully',
      attendance
    };
  } catch (error) {
    console.error('Error updating attendance description:', error);
    throw error;
  }
}

module.exports = {
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
  markDayAsLeaveOrAbsent,
  updateAttendanceDescription
};
