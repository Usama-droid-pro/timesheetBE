const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { sendSuccess, sendError, sendServerError } = require('../utils/responseHandler');

const createUser = async (userData) => {
  try {
    const { name, email, password, role } = userData;

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser && !existingUser.isDeleted) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = new User({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role,
      isDeleted: false
    });

    await user.save();

    // Return user without password
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

/**
 * Get all users (exclude soft deleted)
 */
const getAllUsers = async () => {
  try {
    const users = await User.find({ isDeleted: false })
      .select('-password')
      .sort({ createdAt: -1 });

    return users.map(user => ({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }));
  } catch (error) {
    throw error;
  }
};

/**
 * Update user password (Admin only)
 */
const updateUserPassword = async (userId, newPassword) => {
  try {
    const user = await User.findById(userId);
    
    if (!user || user.isDeleted) {
      throw new Error('User not found');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    user.password = hashedPassword;
    await user.save();

    return {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      updatedAt: user.updatedAt
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Soft delete user (Admin only)
 */
const deleteUser = async (userId) => {
  try {
    const user = await User.findById(userId);
    
    if (!user || user.isDeleted) {
      throw new Error('User not found');
    }

    // Soft delete
    await user.deleteOne({_id: userId});

    return {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      deletedAt: new Date()
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Search users by name (returns only id, name, and role)
 */
const searchUsersByName = async (searchQuery) => {
  try {
    if (!searchQuery || searchQuery.trim().length === 0) {
      return [];
    }

    // Use regex for case-insensitive partial matching on name
    const searchRegex = new RegExp(searchQuery.trim(), 'i');

    const users = await User.find({
      name: { $regex: searchRegex }
    })
      .select('name role')
      .sort({ name: 1 })
      .limit(50); // Limit results for performance

    return users.filter(user => user.role !== 'Admin').map(user => ({
      id: user._id,
      name: user.name,
      role: user.role
    }));
  } catch (error) {
    throw error;
  }
};

module.exports = {
  createUser,
  getAllUsers,
  updateUserPassword,
  deleteUser,
  searchUsersByName
};
