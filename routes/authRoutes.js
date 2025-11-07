const express = require('express');
const { body } = require('express-validator');
const { login, getMe } = require('../controllers/authController');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

/**
 * POST /api/auth/login
 * Login user with email and password
 */
router.post('/login', [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email')
    ,
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
], login);

/**
 * GET /api/auth/me
 * Get current user data (requires authentication)
 */
router.get('/me', authMiddleware, getMe);

module.exports = router;
