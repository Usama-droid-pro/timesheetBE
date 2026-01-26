const UserService = require('../services/userService');
const { sendSuccess, sendError, sendServerError, sendForbidden } = require('../utils/responseHandler');
const { cloudinary } = require('../utils/cloudinary');
const streamifier = require('streamifier');


const createUser = async (req, res) => {
  try {
    const { name, email, password, role, memberOfHW, bioMetricId } = req.body;
    const user = await UserService.createUser({ name, email, password, role, memberOfHW, bioMetricId });

    return sendSuccess(res, 'User created successfully', { user }, 201);
  } catch (error) {
    console.error('Create user error:', error);
    return sendError(res, error.message, null, 400);
  }
};

const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await UserService.getUserById(id);

    return sendSuccess(res, 'User retrieved successfully', { user }, 200);
  } catch (error) {
    console.error('Get user error:', error);
    return sendError(res, error.message, null, 400);
  }
};

const getAllUsers = async (req, res) => {
  try {
    let filters = { ...req.query }
    console.log(filters)
    const users = await UserService.getAllUsers(filters);

    return sendSuccess(res, 'Users retrieved successfully', { users }, 200);
  } catch (error) {
    console.error('Get users error:', error);
    return sendServerError(res, 'Failed to retrieve users', error.message);
  }
};


const getUsersForData = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const users = await UserService.getAllUsesForData(startDate, endDate);
    return sendSuccess(res, 'Users for data range retrieved successfully', { users }, 200);
  } catch (error) {
    console.error('Get users for data range error:', error);
    return sendServerError(res, 'Failed to retrieve users for data range', error.message);
  }
};

const updateUserPassword = async (req, res) => {
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

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.user || (req.user.id.toString() !== id && !req.user.isAdmin)) {
      return sendForbidden(res, 'You can only update your own profile');
    }

    const { name, phone, dob, gender, currentPassword, newPassword, confirmPassword } = req.body;
    const file = req.file;

    // Handle image upload if provided
    let profilePicUrl = null;
    if (file) {
      console.log(file)
      profilePicUrl = await new Promise((resolve, reject) => {
        const folder = `users/${id}`;
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder, resource_type: 'image', overwrite: true },
          (error, result) => {
            if (error) {
              console.error('Cloudinary upload error:', error);
              reject(new Error('Failed to upload image'));
            } else {
              resolve(result.secure_url);
              console.log("Uploaded")
            }
          }
        );
        streamifier.createReadStream(file.buffer).pipe(uploadStream);
      });
    }

    console.log(profilePicUrl)

    const payload = {
      ...(typeof name !== 'undefined' ? { name } : {}),
      ...(typeof phone !== 'undefined' ? { phone } : {}),
      ...(typeof dob !== 'undefined' ? { dob } : {}),
      ...(typeof gender !== 'undefined' ? { gender } : {}),
      ...(profilePicUrl ? { profilePic: profilePicUrl } : {}),
      ...(currentPassword || newPassword || confirmPassword
        ? { currentPassword, newPassword, confirmPassword }
        : {})
    };

    const user = await UserService.updateUser(id, payload);

    return sendSuccess(res, 'User updated successfully', { user }, 200);
  } catch (error) {
    console.error('Update user error:', error);
    return sendError(res, error.message, null, 400);
  }
};

const updateUserByAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.user || !req.user.isAdmin) {
      return sendForbidden(res, 'Only admins can update user data');
    }

    console.log("req.body", req.body)
    const { email, password, isAdmin, memberOfHW, bioMetricId, officeStartTime, officeEndTime, payoutMultiplier, permissions } = req.body;

    // Only super admin can modify permissions
    if (permissions !== undefined && req.user.role !== 'Admin') {
      return sendForbidden(res, 'Only super admin can manage permissions');
    }

    const payload = {
      ...(typeof email !== 'undefined' ? { email } : {}),
      ...(typeof password !== 'undefined' ? { password } : {}),
      ...(typeof isAdmin !== 'undefined' ? { isAdmin } : {}),
      ...(typeof memberOfHW !== 'undefined' ? { memberOfHW } : {}),
      ...(typeof bioMetricId !== 'undefined' ? { bioMetricId } : {}),
      ...(typeof officeStartTime !== 'undefined' ? { officeStartTime } : {}),
      ...(typeof officeEndTime !== 'undefined' ? { officeEndTime } : {}),
      ...(typeof payoutMultiplier !== 'undefined' ? { payoutMultiplier } : {}),
      ...(typeof permissions !== 'undefined' ? { permissions } : {}),
    };

    const user = await UserService.updateUserByAdmin(id, payload);

    return sendSuccess(res, 'User updated successfully', { user }, 200);
  } catch (error) {
    console.error('Admin update user error:', error);
    return sendError(res, error.message, null, 400);
  }
};



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


const setUserActiveStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { active } = req.body;

    if (!req.user || !req.user.isAdmin) {
      return sendForbidden(res, 'Only admins can change active status');
    }

    if (typeof active === 'undefined') {
      return sendError(res, 'Active status is required', null, 400);
    }

    const user = await UserService.active_deactivateUser(id, Boolean(active));
    return sendSuccess(res, 'User active status updated', { user }, 200);
  } catch (error) {
    console.error('Set active status error:', error);
    return sendError(res, error.message, null, 400);
  }
};



module.exports = {
  createUser,
  getUserById,
  getAllUsers,
  getUsersForData,
  updateUserPassword,
  deleteUser,
  searchUsersByName,
  updateUser,
  setUserActiveStatus,
  updateUserByAdmin
};
