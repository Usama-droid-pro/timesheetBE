const ReportService = require('../services/reportService');
const { sendSuccess, sendError, sendServerError } = require('../utils/responseHandler');

/**
 * Report Controller
 * Handles report-related HTTP requests
 */

/**
 * GET /api/reports/grand
 * Generate comprehensive grand report
 */
const generateGrandReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Validate date format if provided
    if (startDate && isNaN(Date.parse(startDate))) {
      return sendError(res, 'Invalid startDate format. Use YYYY-MM-DD');
    }
    
    if (endDate && isNaN(Date.parse(endDate))) {
      return sendError(res, 'Invalid endDate format. Use YYYY-MM-DD');
    }

    // Validate date range
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      return sendError(res, 'startDate cannot be after endDate');
    }

    const report = await ReportService.generateGrandReport(startDate, endDate);
    
    return sendSuccess(res, 'Grand report generated successfully', report, 200);
  } catch (error) {
    console.error('Generate grand report error:', error);
    return sendServerError(res, 'Failed to generate grand report', error.message);
  }
};

/**
 * GET /api/reports/project-users
 * Generate project + users + tasklogs report for date range
 */
const generateProjectUsersReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (startDate && isNaN(Date.parse(startDate))) {
      return sendError(res, 'Invalid startDate format. Use YYYY-MM-DD');
    }
    if (endDate && isNaN(Date.parse(endDate))) {
      return sendError(res, 'Invalid endDate format. Use YYYY-MM-DD');
    }
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      return sendError(res, 'startDate cannot be after endDate');
    }

    const report = await ReportService.generateProjectUsersReport(startDate, endDate);

    return sendSuccess(res, 'Project-users report generated successfully', report, 200);
  } catch (error) {
    console.error('Generate project-users report error:', error);
    return sendServerError(res, 'Failed to generate project-users report', error.message);
  }
};

module.exports = {
  generateGrandReport,
  generateProjectUsersReport
};
