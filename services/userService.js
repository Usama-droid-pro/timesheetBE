const bcrypt = require('bcryptjs');
const User = require('../models/User');
const TaskLog = require('../models/TaskLog');

const createUser = async (userData) => {
  try {
    const { name, email, password, role, memberOfHW, bioMetricId } = userData;
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
      isDeleted: false,
      memberOfHW: memberOfHW,
      bioMetricId: bioMetricId
    });

    await user.save();

    // Return user without password
    return {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      bioMetricId: user.bioMetricId
    };
  } catch (error) {
    throw error;
  }
};

const getUserById = async (id) => {
  try {
    const user = await User.findById(id).select('-password');
    if (!user || user.isDeleted) {
      throw new Error('User not found');
    }
    return user;
  } catch (error) {
    throw error;
  }
};

const getAllUsers = async (filters) => {
  try {
    const users = await User.find({ isDeleted: false, ...filters })
      .select('-password')
      .sort({ createdAt: -1 });

    return users.map(user => ({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt,
      dob: user.dob,
      gender: user.gender,
      profilePic: user.profilePic,
      active: user?.active,
      memberOfHW: user?.memberOfHW,
      bioMetricId: user?.bioMetricId,
      updatedAt: user.updatedAt
    }));
  } catch (error) {
    throw error;
  }
};

const getAllUsesForData = async (startDate, endDate) => {
  try {
    const allUsers = await User.find({ isDeleted: false, memberOfHW: true })
      .select('-password')
      .sort({ createdAt: -1 });

    const activeUsers = allUsers.filter((u) => u.active !== false);
    const inactiveUsers = allUsers.filter((u) => u.active === false);

    let allowedInactiveIds = [];
    if (inactiveUsers.length > 0) {
      const dateFilter = {};
      if (startDate) dateFilter.$gte = new Date(startDate);
      if (endDate) dateFilter.$lte = new Date(endDate);

      const query = {
        userId: { $in: inactiveUsers.map((u) => u._id) },
        ...(startDate || endDate ? { date: dateFilter } : {}),
      };

      const distinctIds = await TaskLog.distinct('userId', query);
      allowedInactiveIds = distinctIds.map((id) => id.toString());
    }

    const visible = [...activeUsers, ...inactiveUsers.filter((u) => allowedInactiveIds.includes(u._id.toString()))];

    return visible.map((user) => ({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      dob: user.dob,
      gender: user.gender,
      profilePic: user.profilePic,
      active: user?.active,
      memberOfHW: user?.memberOfHW,
      updatedAt: user.updatedAt,
    }));
  } catch (error) {
    throw error;
  }
};

const updateUserPassword = async (userId, newPassword) => {
  try {
    const user = await User.findById(userId);
    if (!user || user.isDeleted) {
      throw new Error('User not found');
    }
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

const deleteUser = async (userId) => {
  try {
    const user = await User.findById(userId);

    if (!user || user.isDeleted) {
      throw new Error('User not found');
    }

    // Soft delete
    await user.deleteOne({ _id: userId });

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
      .select('name role active')
      .sort({ name: 1 })
      .limit(50); // Limit results for performance

    return users
      .filter(user => user.role !== 'Admin' && user.active === true)
      .map(user => ({
        id: user._id,
        name: user.name,
        role: user.role
      }));

  } catch (error) {
    throw error;
  }
};

const updateUser = async (userId, updates) => {
  try {
    const user = await User.findById(userId);
    if (!user || user.isDeleted) {
      throw new Error('User not found');
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'profilePic')) {
      const profilePic = updates.profilePic;
      if (typeof profilePic === 'string') {
        user.profilePic = profilePic.trim();
      }
    }


    if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
      const name = updates.name;
      if (typeof name === 'string') {
        const trimmed = name.trim();
        if (trimmed.length < 2) {
          throw new Error('Name must be at least 2 characters long');
        }
        user.name = trimmed;
      }
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'phone')) {
      const phone = updates.phone;
      user.phone = typeof phone === 'string' ? phone.trim() : null;
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'dob')) {
      const dob = updates.dob;
      if (dob === null || dob === '') {
        user.dob = null;
      } else {
        const dateVal = new Date(dob);
        if (isNaN(dateVal.getTime())) {
          throw new Error('Invalid date of birth');
        }
        user.dob = dateVal;
      }
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'gender')) {
      const gender = updates.gender;
      if (gender !== null && gender !== undefined) {
        const allowed = ['Male', 'Female'];
        if (!allowed.includes(gender)) {
          throw new Error('Invalid gender');
        }
        user.gender = gender;
      } else {
        user.gender = null;
      }
    }

    const { currentPassword, newPassword, confirmPassword } = updates;
    if (currentPassword || newPassword || confirmPassword) {
      if (!currentPassword || !newPassword || !confirmPassword) {
        throw new Error('Current, new, and confirm password are required');
      }
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        throw new Error('Current password is incorrect');
      }
      if (newPassword.length < 8) {
        throw new Error('Password must be at least 8 characters long');
      }
      if (newPassword !== confirmPassword) {
        throw new Error('New password and confirm password do not match');
      }
      const hashed = await bcrypt.hash(newPassword, 10);
      user.password = hashed;
    }

    await user.save();


    return {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      dob: user.dob,
      gender: user.gender,
      profilePic: user.profilePic,
      updatedAt: user.updatedAt
    };
  } catch (error) {
    throw error;
  }
};

const updateUserByAdmin = async (userId, updates) => {
  try {
    const user = await User.findById(userId);
    if (!user || user.isDeleted) {
      throw new Error('User not found');
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'bioMetricId')) {
      const bioMetricId = updates.bioMetricId;
      if (typeof bioMetricId === 'string' && bioMetricId.trim() !== '') {
        user.bioMetricId = bioMetricId.trim();
      }
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'email')) {
      const email = updates.email;
      if (typeof email === 'string' && email.trim() !== '') {
        const lower = email.trim().toLowerCase();
        const exists = await User.findOne({ email: lower, _id: { $ne: userId } });
        if (exists) {
          throw new Error('User with this email already exists');
        }
        user.email = lower;
      }
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'isAdmin')) {
      user.isAdmin = Boolean(updates.isAdmin);
      user.tokenVersion += 1;
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'memberOfHW')) {
      user.memberOfHW = Boolean(updates.memberOfHW);
      user.tokenVersion += 1;

    }

    if (Object.prototype.hasOwnProperty.call(updates, 'role')) {
      const role = updates.role;
      const allowed = ['QA', 'DESIGN', 'DEV', 'PM', 'Admin'];
      if (!allowed.includes(role)) {
        throw new Error('Role must be one of: QA, DESIGN, DEV, PM, Admin');
      }
      user.role = role;
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'password')) {
      const password = updates.password;
      if (typeof password !== 'string' || password.length < 8) {
        throw new Error('Password must be at least 8 characters long');
      }
      const hashed = await bcrypt.hash(password, 10);
      user.password = hashed;
    }

    await user.save();

    return {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isAdmin: user.isAdmin,
      active: user.active,
      updatedAt: user.updatedAt
    };
  } catch (error) {
    throw error;
  }
};

const updateUserProfilePic = async (userId, imageUrl) => {
  try {
    const user = await User.findById(userId);
    if (!user || user.isDeleted) {
      throw new Error('User not found');
    }
    user.profilePic = imageUrl || null;
    await user.save();
    return {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      dob: user.dob,
      gender: user.gender,
      profilePic: user.profilePic,
      updatedAt: user.updatedAt
    };
  } catch (error) {
    throw error;
  }
};

const active_deactivateUser = async (userId, activeStatus) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    user.active = activeStatus;
    await user.save();
    return {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      updatedAt: user.updatedAt
    };
  } catch (error) {
    throw error;
  }
};

module.exports = {
  createUser,
  getUserById,
  getAllUsers,
  getAllUsesForData,
  updateUserPassword,
  deleteUser,
  searchUsersByName,
  updateUser,
  updateUserProfilePic,
  active_deactivateUser,
  updateUserByAdmin
};
