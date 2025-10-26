const express = require('express');
const { query } = require('express-validator');
const { generateGrandReport } = require('../controllers/reportController');
const { authMiddleware, adminMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

/**
 * GET /api/reports/grand
 * Generate comprehensive grand report (Admin only)
 */
router.get('/grand', [
  // Temporarily removed auth for testing - TODO: Add back for production
  // authMiddleware,
  // adminMiddleware,
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid startDate format. Use YYYY-MM-DD'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid endDate format. Use YYYY-MM-DD')
], generateGrandReport);

module.exports = router;
