const express = require('express');
const { query } = require('express-validator');
const { generateGrandReport, generateProjectUsersReport } = require('../controllers/reportController');
const { authMiddleware, adminMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/grand', [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid startDate format. Use YYYY-MM-DD'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid endDate format. Use YYYY-MM-DD')
], generateGrandReport);


router.get('/project-users', [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid startDate format. Use YYYY-MM-DD'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid endDate format. Use YYYY-MM-DD')
], generateProjectUsersReport);

module.exports = router;
