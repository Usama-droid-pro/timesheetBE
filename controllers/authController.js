const AuthService = require('../services/authService');
const { sendSuccess, sendError, sendServerError } = require('../utils/responseHandler');


const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return sendError(res, 'Email and password are required');
    }

    const result = await AuthService.login(email, password);

    return sendSuccess(res, 'Login successful', result, 200);
  } catch (error) {
    console.error('Login error:', error);
    return sendError(res, error.message, null, 401);
  }
};

const getMe = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await AuthService.getCurrentUser(userId);

    return sendSuccess(res, 'User data retrieved successfully', { user }, 200);
  } catch (error) {
    console.error('Get me error:', error);
    return sendError(res, error.message, null, 404);
  }
};

module.exports = {
  login,
  getMe
};
