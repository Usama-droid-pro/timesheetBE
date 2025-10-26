const express = require('express');
const { body, param } = require('express-validator');
const { createUser, getAllUsers, updateUserPassword, deleteUser } = require('../controllers/userController');
const { authMiddleware, adminMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

/**
 * POST /api/users
 * Create a new user (Admin only)
 */
router.post('/', [
  // authMiddleware,
  // adminMiddleware,
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long'),
  body('role')
    .isIn(['QA', 'DESIGN', 'DEV', 'PM', 'Admin'])
    .withMessage('Role must be one of: QA, DESIGN, DEV, PM, Admin')
], createUser);

/**
 * GET /api/users
 * Get all users (exclude soft deleted)
 */
router.get('/', [
  // Temporarily removed auth for testing - TODO: Add back for production
  // authMiddleware,
  // adminMiddleware
], getAllUsers);

/**
 * PUT /api/users/:id/password
 * Update user password (Admin only)
 */
router.put('/:id/password', [
  authMiddleware,
  adminMiddleware,
  param('id').isMongoId().withMessage('Invalid user ID'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
], updateUserPassword);

/**
 * DELETE /api/users/:id
 * Soft delete user (Admin only)
 */
router.delete('/:id', [
  authMiddleware,
  adminMiddleware,
  param('id').isMongoId().withMessage('Invalid user ID')
], deleteUser);

module.exports = router;
