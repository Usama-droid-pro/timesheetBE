const { sendForbidden } = require('../utils/responseHandler');

/**
 * Middleware to check if user has a specific permission
 * Super admin (role === 'Admin') automatically has all permissions
 */
function checkPermission(requiredPermission) {
  return (req, res, next) => {
    const user = req.user;
    
    if (!user) {
      return sendForbidden(res, 'Authentication required');
    }
    
    // Super admin (role === 'Admin') has all permissions
    if (user.role === 'Admin') {
      return next();
    }
    
    // Check if user has the specific permission
    if (user.permissions && user.permissions.includes(requiredPermission)) {
      return next();
    }
    
    return sendForbidden(res, `Permission denied: ${requiredPermission} required`);
  };
}

module.exports = { checkPermission };
