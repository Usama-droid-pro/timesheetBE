const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendUnauthorized, sendServerError, sendForbidden } = require('../utils/responseHandler');

/**
 * JWT Authentication Middleware
 * Verifies JWT token and adds user info to request object
 */
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendUnauthorized(res, 'Access denied. No token provided.');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      return sendUnauthorized(res, 'Access denied. No token provided.');
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return sendUnauthorized(res, 'Invalid token. User not found.');
    }

    // Add user info to request object
    req.user = {
      id: user._id,
      userId: user._id, // Alias for convenience
      email: user.email,
      name: user.name,
      role: user.role,
      isAdmin: user.isAdmin
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return sendUnauthorized(res, 'Invalid token.');
    } else if (error.name === 'TokenExpiredError') {
      return sendUnauthorized(res, 'Token expired.');
    } else {
      console.error('Auth middleware error:', error);
      return sendServerError(res, 'Authentication error', error.message);
    }
  }
};

/**
 * Admin Role Middleware
 * Ensures user has Admin role
 */
const adminMiddleware = (req, res, next) => {
  if (!req.user) {
    return sendUnauthorized(res, 'Authentication required.');
  }

  console.log(req.user)

  const isAdmin  = req.user.role === 'Admin' || req.user.isAdmin == true;
  if (!isAdmin) {
    return sendForbidden(res, 'Admin access required.');
  }

  next();
};

module.exports = {
  authMiddleware,
  adminMiddleware
};
