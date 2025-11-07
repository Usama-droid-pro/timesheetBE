const UserService = require('../services/userService');
const { sendSuccess, sendError, sendServerError } = require('../utils/responseHandler');

/**
 * User Controller
 * Handles user-related HTTP requests
 */

/**
 * POST /api/users
 * Create a new user (Admin only)
 */
const createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const user = await UserService.createUser({ name, email, password, role });
    
    return sendSuccess(res, 'User created successfully', { user }, 201);
  } catch (error) {
    console.error('Create user error:', error);
    return sendError(res, error.message, null, 400);
  }
};

/**
 * GET /api/users
 * Get all users (exclude soft deleted)
 */
const getAllUsers = async (req, res) => {
  try {
    const users = await UserService.getAllUsers();
    
    return sendSuccess(res, 'Users retrieved successfully', { users }, 200);
  } catch (error) {
    console.error('Get users error:', error);
    return sendServerError(res, 'Failed to retrieve users', error.message);
  }
};

/**
 * PUT /api/users/:id/password
 * Update user password (Admin only)
 */
const updateUserPassword = async (req, res) => {

  console.log("IN update password ")
  console.log(req.body)
  console.log(req.params)
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password) {
      return sendError(res, 'New password is required');
    }

    const user = await UserService.updateUserPassword(id, password);
    
    return sendSuccess(res, 'Password updated successfully', { user }, 200);
  } catch (error) {
    console.error('Update password error:', error);
    return sendError(res, error.message, null, 400);
  }
};

/**
 * DELETE /api/users/:id
 * Soft delete user (Admin only)
 */
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await UserService.deleteUser(id);
    
    return sendSuccess(res, 'User deleted successfully', { user }, 200);
  } catch (error) {
    console.error('Delete user error:', error);
    return sendError(res, error.message, null, 400);
  }
};

/**
 * GET /api/users/search
 * Search users by name (returns only id, name, and role)
 */
const searchUsersByName = async (req, res) => {
  try {
    console.log("IN search by name ")
    const { name } = req.query;
    if (!name || name.trim().length === 0) {
      return sendSuccess(res, 'Users retrieved successfully', { users: [] }, 200);
    }

    const users = await UserService.searchUsersByName(name);
    
    return sendSuccess(res, 'Users retrieved successfully', { users }, 200);
  } catch (error) {
    console.error('Search users error:', error);
    return sendServerError(res, 'Failed to search users', error.message);
  }
};

module.exports = {
  createUser,
  getAllUsers,
  updateUserPassword,
  deleteUser,
  searchUsersByName
};
