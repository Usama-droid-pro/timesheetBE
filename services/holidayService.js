const SystemSettings = require('../models/SystemSettings');
const AttendanceSystem = require('../models/AttendanceSystem');
const moment = require('moment');

/**
 * Parse a date string as UTC midnight to avoid timezone shifts
 * @param {string|Date} dateInput - Date string (YYYY-MM-DD) or Date object
 * @returns {Date} Date object set to UTC midnight
 */
function parseAsUTCMidnight(dateInput) {
  if (!dateInput) return null;
  
  // If it's already a Date object, extract the date parts
  if (dateInput instanceof Date) {
    // Use UTC methods to avoid timezone shift
    const year = dateInput.getUTCFullYear();
    const month = dateInput.getUTCMonth();
    const day = dateInput.getUTCDate();
    return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  }
  
  // If it's a string, parse it manually to avoid timezone interpretation
  const dateStr = String(dateInput).split('T')[0]; // Get just YYYY-MM-DD part
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

/**
 * Compare two dates by their UTC date parts only (ignoring time)
 * @param {Date} date1 
 * @param {Date} date2 
 * @returns {boolean}
 */
function isSameUTCDate(date1, date2) {
  if (!date1 || !date2) return false;
  return date1.getUTCFullYear() === date2.getUTCFullYear() &&
         date1.getUTCMonth() === date2.getUTCMonth() &&
         date1.getUTCDate() === date2.getUTCDate();
}

/**
 * Calculate holiday bonus based on actual core working hours
 * Core working hours = time from check-in to office end (excluding extra hours after office end)
 * @param {string} workDate - Date in YYYY-MM-DD format
 * @param {string} officeEndTime - Office end time (HH:mm format)
 * @param {string} checkInTime - Check-in time (HH:mm format)  
 * @param {string} checkOutTime - Check-out time (HH:mm format)
 * @returns {number} Holiday bonus in minutes
 */
function calculateHolidayBonus(workDate, officeEndTime, checkInTime, checkOutTime) {
  const checkIn = moment(`${workDate} ${checkInTime}:00`, 'YYYY-MM-DD HH:mm:ss');
  let checkOut = moment(`${workDate} ${checkOutTime}:00`, 'YYYY-MM-DD HH:mm:ss');
  const officeEnd = moment(`${workDate} ${officeEndTime}:00`, 'YYYY-MM-DD HH:mm:ss');
  
  // Handle overnight checkout
  if (checkOut.isBefore(checkIn)) {
    checkOut.add(1, 'day');
  }
  
  // Calculate end of core work: whichever is earlier (checkout or office end)
  const coreEnd = checkOut.isBefore(officeEnd) ? checkOut : officeEnd;
  
  // Core working minutes = from check-in to core end
  let coreWorkingMinutes = coreEnd.diff(checkIn, 'minutes');
  
  // Ensure non-negative
  coreWorkingMinutes = Math.max(0, coreWorkingMinutes);
  
  // Holiday bonus = core working hours + 9 hours (540 minutes)
  const holidayBonusMinutes = coreWorkingMinutes + (9 * 60);
  
  return holidayBonusMinutes;
}

/**
 * Check if a date is a configured holiday
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {Promise<boolean>}
 */
async function isHoliday(dateStr) {
  const settings = await SystemSettings.findOne({ isActive: true }).sort({ version: -1 });
  if (!settings || !settings.holidays || settings.holidays.length === 0) {
    return false;
  }
  
  const checkDate = parseAsUTCMidnight(dateStr);
  
  return settings.holidays.some(holiday => {
    const holidayDate = parseAsUTCMidnight(holiday.date);
    return isSameUTCDate(holidayDate, checkDate);
  });
}

/**
 * Get all configured holidays
 */
async function getAllHolidays() {
  const settings = await SystemSettings.findOne({ isActive: true }).sort({ version: -1 });
  return settings?.holidays || [];
}

/**
 * Add a new holiday and trigger recalculation
 */
async function addHoliday(holidayData, adminUserId) {
  const settings = await SystemSettings.findOne({ isActive: true }).sort({ version: -1 });
  
  if (!settings) {
    throw new Error('System settings not found');
  }
  
  // Normalize the date using UTC to avoid timezone shifts
  const newDate = parseAsUTCMidnight(holidayData.date);
  
  // Check if holiday already exists
  const existingHoliday = settings.holidays.find(h => {
    const hDate = parseAsUTCMidnight(h.date);
    return isSameUTCDate(hDate, newDate);
  });
  
  if (existingHoliday) {
    throw new Error('Holiday already exists for this date');
  }
  
  settings.holidays.push({
    date: newDate,
    name: holidayData.name,
    description: holidayData.description || '',
    addedBy: adminUserId,
    addedAt: new Date(),
    recalculationTriggered: false
  });
  
  await settings.save();
  
  // Trigger retroactive recalculation - use moment UTC to format
  const dateStr = moment.utc(newDate).format('YYYY-MM-DD');
  const result = await recalculateHolidayBonusForDate(dateStr);
  
  // Mark recalculation as complete
  const holiday = settings.holidays.find(h => {
    const hDate = parseAsUTCMidnight(h.date);
    return isSameUTCDate(hDate, newDate);
  });
  
  if (holiday) {
    holiday.recalculationTriggered = true;
    await settings.save();
  }
  
  return { holiday: settings.holidays[settings.holidays.length - 1], ...result };
}

/**
 * Remove a holiday and remove holiday bonus from records
 */
async function removeHoliday(holidayDate) {
  const settings = await SystemSettings.findOne({ isActive: true }).sort({ version: -1 });
  if (!settings) {
    throw new Error('System settings not found');
  }
  
  // Use UTC parsing to avoid timezone shifts
  const dateToRemove = parseAsUTCMidnight(holidayDate);
  console.log('[HOLIDAY] Removing holiday for date:', dateToRemove.toISOString());
  
  const index = settings.holidays.findIndex(h => {
    const hDate = parseAsUTCMidnight(h.date);
    return isSameUTCDate(hDate, dateToRemove);
  });
  
  if (index === -1) {
    console.log('[HOLIDAY] Holiday not found. Available holidays:', settings.holidays.map(h => h.date));
    throw new Error('Holiday not found');
  }
  
  settings.holidays.splice(index, 1);
  await settings.save();
  
  // Remove holiday bonus from attendance records - use moment UTC
  const dateStr = moment.utc(dateToRemove).format('YYYY-MM-DD');
  const result = await removeHolidayBonusForDate(dateStr);
  
  return result;
}

/**
 * Update a holiday's name/description
 */
async function updateHoliday(holidayDate, updateData) {
  const settings = await SystemSettings.findOne({ isActive: true }).sort({ version: -1 });
  
  if (!settings) {
    throw new Error('System settings not found');
  }
  
  // Use UTC parsing to avoid timezone shifts
  const dateToUpdate = parseAsUTCMidnight(holidayDate);
  
  const holiday = settings.holidays.find(h => {
    const hDate = parseAsUTCMidnight(h.date);
    return isSameUTCDate(hDate, dateToUpdate);
  });
  
  if (!holiday) {
    throw new Error('Holiday not found');
  }
  
  if (updateData.name) holiday.name = updateData.name;
  if (updateData.description !== undefined) holiday.description = updateData.description;
  
  await settings.save();
  
  return holiday;
}

/**
 * Recalculate holiday bonus for all attendance records on a specific date
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 */
async function recalculateHolidayBonusForDate(dateStr) {
  try {
    // Use UTC parsing for consistent date handling
    const startOfDay = parseAsUTCMidnight(dateStr);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1); // Same day 23:59:59.999 UTC
    
    console.log(`[HOLIDAY] Query range: ${startOfDay.toISOString()} to ${endOfDay.toISOString()}`);
    
    // Find all attendance records for this date (exclude weekend work)
    const records = await AttendanceSystem.find({
      date: { $gte: startOfDay, $lte: endOfDay },
      isWeekendWork: { $ne: true } // Weekend logic takes precedence
    });
    
    console.log(`[HOLIDAY] Recalculating ${records.length} records for date: ${dateStr}`);
    
    let updatedCount = 0;
    for (const record of records) {
      if (!record.checkInTime || !record.checkOutTime || !record.officeEndTime) continue;
      
      const holidayBonusMinutes = calculateHolidayBonus(
        dateStr,
        record.officeEndTime,
        record.checkInTime,
        record.checkOutTime
      );
      
      record.isHolidayWork = true;
      record.holidayBonusMinutes = holidayBonusMinutes;
      record.holidayBonusApplied = true;
      
      await record.save();
      updatedCount++;
      console.log(`[HOLIDAY] Updated record ${record._id}: ${holidayBonusMinutes} minutes (${(holidayBonusMinutes/60).toFixed(2)} hours)`);
    }
    
    return { success: true, recordsUpdated: updatedCount };
  } catch (error) {
    console.error('Error recalculating holiday bonus:', error);
    throw error;
  }
}

/**
 * Remove holiday bonus from all attendance records on a specific date
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 */
async function removeHolidayBonusForDate(dateStr) {
  try {
    // Use UTC parsing for consistent date handling
    const startOfDay = parseAsUTCMidnight(dateStr);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1); // Same day 23:59:59.999 UTC
    
    const records = await AttendanceSystem.find({
      date: { $gte: startOfDay, $lte: endOfDay },
      isHolidayWork: true
    });
    
    console.log(`[HOLIDAY] Removing holiday bonus from ${records.length} records`);
    
    let updatedCount = 0;
    for (const record of records) {
      record.isHolidayWork = false;
      record.holidayBonusMinutes = 0;
      record.holidayBonusApplied = false;
      await record.save();
      updatedCount++;
    }
    
    return { success: true, recordsUpdated: updatedCount };
  } catch (error) {
    console.error('Error removing holiday bonus:', error);
    throw error;
  }
}

/**
 * Recalculate holiday bonus for a single record (used when entry is updated)
 * @param {Object} record - Attendance record
 */
async function recalculateHolidayBonusForRecord(record) {
  const workDate = moment(record.date).format('YYYY-MM-DD');
  
  // Check if this date is a holiday
  const isHolidayDate = await isHoliday(workDate);
  
  // If weekend, skip holiday logic (weekend takes precedence)
  if (record.isWeekendWork) {
    return record;
  }
  
  if (isHolidayDate && record.checkInTime && record.checkOutTime && record.officeEndTime) {
    const holidayBonusMinutes = calculateHolidayBonus(
      workDate,
      record.officeEndTime,
      record.checkInTime,
      record.checkOutTime
    );
    
    record.isHolidayWork = true;
    record.holidayBonusMinutes = holidayBonusMinutes;
    record.holidayBonusApplied = true;
  } else {
    record.isHolidayWork = false;
    record.holidayBonusMinutes = 0;
    record.holidayBonusApplied = false;
  }
  
  return record;
}

module.exports = {
  calculateHolidayBonus,
  isHoliday,
  getAllHolidays,
  addHoliday,
  removeHoliday,
  updateHoliday,
  recalculateHolidayBonusForDate,
  removeHolidayBonusForDate,
  recalculateHolidayBonusForRecord
};
