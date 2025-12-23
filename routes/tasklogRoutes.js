const express = require('express');
const { body, query, param } = require('express-validator');
const { createOrUpdateTaskLog, getTaskLogs, getSingleTaskLog, updateTaskLogById, deleteTaskLogById, getTaskLogByUserAndDate } = require('../controllers/tasklogController');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

/**
 * POST /api/tasklogs
 * Create or update task log
 */
router.post('/', [
  body('userId')
    .isMongoId()
    .withMessage('Valid user ID is required'),
  body('date')
    .isISO8601()
    .withMessage('Valid date is required'),
  body('totalHours')
    .isNumeric()
    .withMessage('Total hours must be a number')
    .isFloat({ min: 0 })
    .withMessage('Total hours cannot be negative'),
  body('tasks')
    .isArray({ min: 1 })
    .withMessage('At least one task is required'),
  body('tasks.*.project_name')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Project name is required and must be between 1 and 200 characters'),
  body('tasks.*.description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Task description cannot exceed 1000 characters'),
  body('tasks.*.hours')
    .isNumeric()
    .withMessage('Hours must be a number')
    .isFloat({ min: 0, max: 24 })
    .withMessage('Hours must be between 0 and 24')
], createOrUpdateTaskLog);

/**
 * GET /api/tasklogs
 * Get task logs with filters
 */
router.get('/', [
  // Temporarily removed auth for testing - TODO: Add back for production
  // authMiddleware,
  query('userId')
    .optional()
    .isMongoId()
    .withMessage('Invalid user ID format'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid start date format'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date format'),
  query('project_name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Project name must be between 1 and 200 characters')
], getTaskLogs);

/**
 * GET /api/tasklogs/single
 * Get single task log by userId and date
 */
router.get('/single', [
  // Temporarily removed auth for testing - TODO: Add back for production
  // authMiddleware,
  query('userId')
    .isMongoId()
    .withMessage('Valid user ID is required'),
  query('date')
    .isISO8601()
    .withMessage('Valid date is required')
], getSingleTaskLog);

/**
 * GET /api/tasklogs/by-user/:userId/date/:date
 * Get single task log by userId and date (via URL params)
 */
router.get('/by-user/:userId/date/:date', [
  // No authMiddleware - open to all users
  param('userId')
    .isMongoId()
    .withMessage('Valid user ID is required'),
  param('date')
    .isISO8601()
    .withMessage('Valid date is required')
], getTaskLogByUserAndDate);

/**
 * PUT /api/tasklogs/:id
 * Update task log by ID (Not Protected - Any user can update)
 */
router.put('/:id', [
  // No authMiddleware - open to all users
  param('id')
    .isMongoId()
    .withMessage('Valid task log ID is required'),
  body('totalHours')
    .optional()
    .isNumeric()
    .withMessage('Total hours must be a number')
    .isFloat({ min: 0 })
    .withMessage('Total hours cannot be negative'),
  body('tasks')
    .optional()
    .isArray({ min: 1 })
    .withMessage('At least one task is required'),
  body('tasks.*.project_name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Project name is required and must be between 1 and 200 characters'),
  body('tasks.*.description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Task description cannot exceed 1000 characters'),
  body('tasks.*.hours')
    .optional()
    .isNumeric()
    .withMessage('Hours must be a number')
    .isFloat({ min: 0, max: 24 })
    .withMessage('Hours must be between 0 and 24')
], updateTaskLogById);


router.delete('/:id', [
  param('id')
    .isMongoId()
    .withMessage('Valid task log ID is required')
], deleteTaskLogById);

module.exports = router;
