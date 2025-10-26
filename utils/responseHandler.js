/**
 * Standardized response handler for consistent API responses
 */

const sendSuccess = (res, message, data = null, statusCode = 200) => {
  const response = {
    success: true,
    message,
    ...(data && { data })
  };
  return res.status(statusCode).json(response);
};

const sendError = (res, message, error = null, statusCode = 400) => {
  const response = {
    success: false,
    message,
    ...(error && process.env.NODE_ENV === 'development' && { error })
  };
  return res.status(statusCode).json(response);
};

const sendServerError = (res, message = 'Internal Server Error', error = null) => {
  const response = {
    success: false,
    message,
    ...(error && process.env.NODE_ENV === 'development' && { error })
  };
  return res.status(500).json(response);
};

const sendNotFound = (res, message = 'Resource not found') => {
  const response = {
    success: false,
    message
  };
  return res.status(404).json(response);
};

const sendUnauthorized = (res, message = 'Unauthorized access') => {
  const response = {
    success: false,
    message
  };
  return res.status(401).json(response);
};

const sendForbidden = (res, message = 'Forbidden access') => {
  const response = {
    success: false,
    message
  };
  return res.status(403).json(response);
};

module.exports = {
  sendSuccess,
  sendError,
  sendServerError,
  sendNotFound,
  sendUnauthorized,
  sendForbidden
};
