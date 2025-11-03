const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendSuccess, sendError, sendServerError } = require('../utils/responseHandler');

/**
 * Authentication Service
 * Handles user login and authentication logic
 */

/**
 * Login user with email and password
 */
const login = async (email, password) => {
  try {
    // Find user by email (exclude soft deleted)
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      throw new Error('Invalid email or password');
    }
    console.log(user)
    console.log(password)
    console.log(user.password)

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      throw new Error('Invalid email or password');
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user._id,
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Return user data without password
    const userData = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    return {
      user: userData,
      token
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Get current user data by ID
 */
const getCurrentUser = async (userId) => {
  try {
    const user = await User.findById(userId).select('-password');
    
    if (!user || user.isDeleted) {
      throw new Error('User not found');
    }

    return {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  } catch (error) {
    throw error;
  }
};

module.exports = {
  login,
  getCurrentUser
};
