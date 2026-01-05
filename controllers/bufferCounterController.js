const {
  getCurrentMonthCounter,
  getUserBufferHistory,
  getMonthlyReport,
  resetMonthlyCounters
} = require('../services/bufferCounterService');

/**
 * @route   GET /api/buffer-counter/user/:userId
 * @desc    Get buffer counter for user (optional date param for specific month)
 * @access  Private
 */
async function getUserCounter(req, res) {
  try {
    const { userId } = req.params;
    // Accept optional date query param for getting specific month's counter
    const date = req.query.date || null;
    const counter = await getCurrentMonthCounter(userId, date);
    res.json({ success: true, data: counter });
  } catch (error) {
    console.error('Error fetching user counter:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch counter', error: error.message });
  }
}

/**
 * @route   GET /api/buffer-counter/user/:userId/history
 * @desc    Get user's buffer counter history
 * @access  Private
 */
async function getUserHistory(req, res) {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 12;
    const history = await getUserBufferHistory(userId, limit);
    res.json({ success: true, data: history });
  } catch (error) {
    console.error('Error fetching user history:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch history', error: error.message });
  }
}

/**
 * @route   GET /api/buffer-counter/monthly-report/:month/:year
 * @desc    Get monthly report of all users (Admin only)
 * @access  Private/Admin
 */
async function getReport(req, res) {
  try {
    const { month, year } = req.params;
    const report = await getMonthlyReport(parseInt(month), parseInt(year));
    res.json({ success: true, data: report });
  } catch (error) {
    console.error('Error fetching monthly report:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch report', error: error.message });
  }
}

/**
 * @route   POST /api/buffer-counter/reset
 * @desc    Manually reset all buffer counters (Admin only)
 * @access  Private/Admin
 */
async function manualReset(req, res) {
  try {
    const result = await resetMonthlyCounters();
    res.json({ 
      success: true, 
      message: 'Buffer counters reset successfully', 
      data: result 
    });
  } catch (error) {
    console.error('Error resetting counters:', error);
    res.status(500).json({ success: false, message: 'Failed to reset counters', error: error.message });
  }
}

module.exports = {
  getUserCounter,
  getUserHistory,
  getReport,
  manualReset
};
