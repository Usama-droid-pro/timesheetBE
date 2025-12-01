const TaskLogService = require('../services/tasklogService');
const { sendSuccess, sendError, sendServerError, sendNotFound } = require('../utils/responseHandler');

/**
 * Task Log Controller
 * Handles task log-related HTTP requests
 */

/**
 * POST /api/tasklogs
 * Create or update task log
 */
const createOrUpdateTaskLog = async (req, res) => {
  try {
    const { userId, date, totalHours, tasks } = req.body;

    // Basic validation
    if (!userId || !date || totalHours === undefined || !tasks || !Array.isArray(tasks)) {
      return sendError(res, 'userId, date, totalHours, and tasks array are required');
    }

    if (tasks.length === 0) {
      return sendError(res, 'At least one task is required');
    }

    // Validate each task
    for (const task of tasks) {
      // Require either project_id or project_name (prefer project_id for new entries)
      if (!task.project_id && !task.project_name) {
        return sendError(res, 'Each task must have either project_id or project_name');
      }
      if (task.hours === undefined) {
        return sendError(res, 'Each task must have hours');
      }
      if (task.hours < 0 || task.hours > 24) {
        return sendError(res, 'Task hours must be between 0 and 24');
      }
    }

    const result = await TaskLogService.createOrUpdateTaskLog({
      userId,
      date,
      totalHours,
      tasks
    });
    
    const message = result.isUpdate ? 'Task log updated successfully' : 'Task log created successfully';
    return sendSuccess(res, message, { taskLog: result }, 200);
  } catch (error) {
    console.error('Create/Update task log error:', error);
    return sendError(res, error.message, null, 400);
  }
};

/**
 * GET /api/tasklogs
 * Get task logs with filters
 */
const getTaskLogs = async (req, res) => {
  try {
    const { userId, startDate, endDate, project_name } = req.query;

    const taskLogs = await TaskLogService.getTaskLogs({
      userId,
      startDate,
      endDate,
      project_name
    });
    
    return sendSuccess(res, 'Task logs retrieved successfully', { taskLogs }, 200);
  } catch (error) {
    console.error('Get task logs error:', error);
    return sendServerError(res, 'Failed to retrieve task logs', error.message);
  }
};

/**
 * GET /api/tasklogs/single
 * Get single task log by userId and date
 */
const getSingleTaskLog = async (req, res) => {
  try {
    const { userId, date } = req.query;

    if (!userId || !date) {
      return sendError(res, 'userId and date query parameters are required');
    }

    const taskLog = await TaskLogService.getSingleTaskLog(userId, date);
    
    if (!taskLog) {
      return sendNotFound(res, 'Task log not found for the specified user and date');
    }
    
    return sendSuccess(res, 'Task log retrieved successfully', { taskLog }, 200);
  } catch (error) {
    console.error('Get single task log error:', error);
    return sendServerError(res, 'Failed to retrieve task log', error.message);
  }
};

/**
 * GET /api/tasklogs/by-user/:userId/date/:date
 * Get single task log by userId and date (via URL params)
 */
const getTaskLogByUserAndDate = async (req, res) => {
  try {
    const { userId, date } = req.params;

    if (!userId || !date) {
      return sendError(res, 'userId and date parameters are required');
    }

    const taskLog = await TaskLogService.getSingleTaskLog(userId, date);
    
    if (!taskLog) {
      return sendNotFound(res, 'Task log not found for the specified user and date');
    }
    
    return sendSuccess(res, 'Task log retrieved successfully', { taskLog }, 200);
  } catch (error) {
    console.error('Get task log by user/date error:', error);
    return sendServerError(res, 'Failed to retrieve task log', error.message);
  }
};

/**
 * PUT /api/tasklogs/:id
 * Update task log by ID
 */
const updateTaskLogById = async (req, res) => {
  try {
    const { id } = req.params;
    const { totalHours, tasks } = req.body;

    // Basic validation
    if (totalHours === undefined && !tasks) {
      return sendError(res, 'At least one field (totalHours or tasks) is required for update');
    }

    if (tasks) {
      if (!Array.isArray(tasks) || tasks.length === 0) {
        return sendError(res, 'Tasks must be a non-empty array');
      }

      // Validate each task
      for (const task of tasks) {
        // Require either project_id or project_name (prefer project_id for new entries)
        if (!task.project_id && !task.project_name) {
          return sendError(res, 'Each task must have either project_id or project_name');
        }
        if (task.hours === undefined) {
          return sendError(res, 'Each task must have hours');
        }
        if (task.hours < 0 || task.hours > 24) {
          return sendError(res, 'Task hours must be between 0 and 24');
        }
      }
    }

    const taskLog = await TaskLogService.updateTaskLogById(id, {
      totalHours,
      tasks
    });
    
    return sendSuccess(res, 'Task log updated successfully', { taskLog }, 200);
  } catch (error) {
    console.error('Update task log error:', error);
    if (error.message === 'Task log not found') {
      return sendNotFound(res, error.message);
    }
    return sendError(res, error.message, null, 400);
  }
};

/**
 * DELETE /api/tasklogs/:id
 * Soft delete task log by ID (open endpoint)
 */
const deleteTaskLogById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await TaskLogService.deleteTaskLogById(id);

    return sendSuccess(res, 'Task log deleted successfully', { taskLog: result }, 200);
  } catch (error) {
    console.error('Delete task log error:', error);
    if (error.message === 'Task log not found') {
      return sendNotFound(res, error.message);
    }
    return sendError(res, error.message, null, 400);
  }
};

module.exports = {
  createOrUpdateTaskLog,
  getTaskLogs,
  getSingleTaskLog,
  updateTaskLogById,
  deleteTaskLogById,
  getTaskLogByUserAndDate
};
