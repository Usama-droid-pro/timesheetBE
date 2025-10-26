const TaskLog = require('../models/TaskLog');
const User = require('../models/User');
const { sendSuccess, sendError, sendServerError } = require('../utils/responseHandler');

/**
 * Task Log Service
 * Handles task log-related business logic
 */

/**
 * Create or update task log
 * If tasklog exists for userId + date → update (replace) existing record
 * Otherwise → create new record
 */
const createOrUpdateTaskLog = async (taskLogData) => {
  try {
    const { userId, date, totalHours, tasks } = taskLogData;

    // // Validate totalHours matches sum of task hours
    // const calculatedTotalHours = tasks.reduce((sum, task) => sum + task.hours, 0);
    // if (Math.abs(totalHours - calculatedTotalHours) > 0.01) {
    //   throw new Error('Total hours must equal the sum of individual task hours');
    // }

    // Check if task log already exists for this user and date
    const existingTaskLog = await TaskLog.findOne({ 
      userId, 
      date: new Date(date),
      isDeleted: false 
    });

    if (existingTaskLog) {
      // Update existing record
      existingTaskLog.totalHours = totalHours;
      existingTaskLog.tasks = tasks;
      await existingTaskLog.save();

      return {
        id: existingTaskLog._id,
        userId: existingTaskLog.userId,
        date: existingTaskLog.date,
        totalHours: existingTaskLog.totalHours,
        tasks: existingTaskLog.tasks,
        createdAt: existingTaskLog.createdAt,
        updatedAt: existingTaskLog.updatedAt,
        isUpdate: true
      };
    } else {
      // Create new record
      const taskLog = new TaskLog({
        userId,
        date: new Date(date),
        totalHours,
        tasks,
        isDeleted: false
      });

      await taskLog.save();

      return {
        id: taskLog._id,
        userId: taskLog.userId,
        date: taskLog.date,
        totalHours: taskLog.totalHours,
        tasks: taskLog.tasks,
        createdAt: taskLog.createdAt,
        updatedAt: taskLog.updatedAt,
        isUpdate: false
      };
    }
  } catch (error) {
    throw error;
  }
};

/**
 * Get task logs with filters
 * Query params: userId, startDate, endDate, project_name
 */
const getTaskLogs = async (filters) => {
  try {
    const { userId, startDate, endDate, project_name } = filters;
    
    // Build query
    const query = { isDeleted: false };
    
    if (userId) {
      query.userId = userId;
    }
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }
    
    if (project_name) {
      query['tasks.project_name'] = { $regex: project_name, $options: 'i' };
    }

    const taskLogs = await TaskLog.find(query)
      .populate('userId', 'name email role')
      .sort({ date: -1, createdAt: -1 });

    return taskLogs.map(taskLog => ({
      id: taskLog._id,
      userId: taskLog.userId,
      date: taskLog.date,
      totalHours: taskLog.totalHours,
      tasks: taskLog.tasks,
      createdAt: taskLog.createdAt,
      updatedAt: taskLog.updatedAt
    }));
  } catch (error) {
    throw error;
  }
};

/**
 * Get single task log by userId and date
 */
const getSingleTaskLog = async (userId, date) => {
  try {
    const taskLog = await TaskLog.findOne({ 
      userId, 
      date: new Date(date),
      isDeleted: false 
    }).populate('userId', 'name email role');

    if (!taskLog) {
      return null;
    }

    return {
      id: taskLog._id,
      userId: taskLog.userId,
      date: taskLog.date,
      totalHours: taskLog.totalHours,
      tasks: taskLog.tasks,
      createdAt: taskLog.createdAt,
      updatedAt: taskLog.updatedAt
    };
  } catch (error) {
    throw error;
  }
};

module.exports = {
  createOrUpdateTaskLog,
  getTaskLogs,
  getSingleTaskLog
};
