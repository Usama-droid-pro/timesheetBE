const BufferCounterHistory = require('../models/BufferCounterHistory');
const User = require('../models/User');
const { getActiveSettings } = require('./systemSettingsService');

/**
 * Get or create buffer counter for a specific month (defaults to current month)
 * @param {string} userId - The user ID
 * @param {Date|string} workDate - Optional date to determine which month's counter to use
 */
async function getCurrentMonthCounter(userId, workDate = null) {
  try {
    if(!workDate){
      throw new Error('workDate is required');
    }
    // Use workDate if provided, otherwise use current date
    const date = new Date(workDate);
    const month = date.getMonth() + 1;
    const year = date.getFullYear();

  

    let counter = await BufferCounterHistory.findOne({
      userId,
      month,
      year
    });

    if (!counter) {
      counter = new BufferCounterHistory({
        userId,
        month,
        year,
        bufferUseCount: 0,
        bufferAbusedReached: false,
        usageDates: []
      });
      await counter.save();
      console.log(`[BUFFER] Created new counter for user ${userId} for ${year}-${String(month).padStart(2, '0')}`);
    }

    return counter;
  } catch (error) {
    console.error('Error getting month counter:', error);
    throw error;
  }
}

/**
 * Increment buffer counter for a user on a specific date
 */
async function incrementBufferCounter(userId, date) {
  try {
    const settings = await getActiveSettings();
    // Pass the date to get the correct month's counter
    const counter = await getCurrentMonthCounter(userId, date);

    // Check if this date already recorded
    const dateExists = counter.usageDates.some(
      d => d.toDateString() === new Date(date).toDateString()
    );

    if (dateExists) {
      return counter; // Already counted for this date
    }

    // Increment counter
    counter.bufferUseCount += 1;
    counter.usageDates.push(new Date(date));

    // Check if abuse threshold reached
    if (counter.bufferUseCount >= settings.bufferUseLimit) {
      counter.bufferAbusedReached = true;
    }

    await counter.save();
    return counter;
  } catch (error) {
    console.error('Error incrementing buffer counter:', error);
    throw error;
  }
}

/**
 * Check if user has reached buffer abuse limit
 */
async function checkBufferAbused(userId , date) {
  try {
    if(!date){
      throw new Error('date is required');
    }
    const counter = await getCurrentMonthCounter(userId , date);
    return counter.bufferAbusedReached;
  } catch (error) {
    console.error('Error checking buffer abuse:', error);
    throw error;
  }
}

/**
 * Reset monthly counters for all users (called on 1st of month)
 */
async function resetMonthlyCounters() {
  try {
    console.log('[BUFFER RESET] Starting monthly buffer counter reset...');

    const activeUsers = await User.find({ active: true, isDeleted: false });
    const now = new Date();
    const newMonth = now.getMonth() + 1;
    const newYear = now.getFullYear();

    let created = 0;
    let skipped = 0;

    for (const user of activeUsers) {
      try {
        const exists = await BufferCounterHistory.findOne({
          userId: user._id,
          month: newMonth,
          year: newYear
        });

        if (exists) {
          skipped++;
          continue;
        }

        const newCounter = new BufferCounterHistory({
          userId: user._id,
          month: newMonth,
          year: newYear,
          bufferUseCount: 0,
          bufferAbusedReached: false,
          usageDates: []
        });

        await newCounter.save();
        created++;
      } catch (error) {
        console.error(`Error creating counter for user ${user.name}:`, error.message);
      }
    }

    console.log(`[BUFFER RESET] ✓ Created ${created} new counters, ${skipped} already existed`);
    return { created, skipped };
  } catch (error) {
    console.error('[BUFFER RESET] Error resetting monthly counters:', error);
    throw error;
  }
}

/**
 * Get user's buffer history
 */
async function getUserBufferHistory(userId, limit = 12) {
  try {
    const history = await BufferCounterHistory.find({ userId })
      .sort({ year: -1, month: -1 })
      .limit(limit);
    
    return history;
  } catch (error) {
    console.error('Error fetching user buffer history:', error);
    throw error;
  }
}

/**
 * Get monthly report of all users' buffer usage (Admin)
 */
async function getMonthlyReport(month, year) {
  try {
    const report = await BufferCounterHistory.find({ month, year })
      .populate('userId', 'name email role')
      .sort({ bufferUseCount: -1 });
    
    return report;
  } catch (error) {
    console.error('Error fetching monthly report:', error);
    throw error;
  }
}

/**
 * Decrement buffer counter for a user on a specific date
 */
async function decrementBufferCounter(userId, date) {
  try {
    const settings = await getActiveSettings();
    // Pass the date to get the correct month's counter
    const counter = await getCurrentMonthCounter(userId, date);

    const dateToFind = new Date(date).toDateString();
    const dateIndex = counter.usageDates.findIndex(
      d => d.toDateString() === dateToFind
    );

    if (dateIndex === -1) {
      return counter; // Not found, nothing to decrement
    }

    // Decrement counter
    counter.bufferUseCount = Math.max(0, counter.bufferUseCount - 1);
    counter.usageDates.splice(dateIndex, 1);

    // Update abuse flag
    counter.bufferAbusedReached = counter.bufferUseCount >= settings.bufferUseLimit;

    await counter.save();
    return counter;
  } catch (error) {
    console.error('Error decrementing buffer counter:', error);
    throw error;
  }
}

module.exports = {
  getCurrentMonthCounter,
  incrementBufferCounter,
  decrementBufferCounter,
  checkBufferAbused,
  resetMonthlyCounters,
  getUserBufferHistory,
  getMonthlyReport
};
