const mongoose = require('mongoose');
const TaskLog = require('../models/TaskLog');
const User = require('../models/User');
const Project = require('../models/Project');
const { sendSuccess, sendError, sendServerError } = require('../utils/responseHandler');

/**
 * Task Log Service
 * Handles task log-related business logic
 */

/**
 * Resolve project information for tasks
 * If task has project_id, populate project name
 * If task has project_name, try to find project_id
 */
const resolveProjectInfo = async (tasks) => {
  const resolvedTasks = [];

  for (const task of tasks) {
    const resolvedTask = { ...task };

    if (task.project_id && !task.project_name) {
      // Has project_id but no project_name - populate project_name
      const project = await Project.findById(task.project_id);
      if (project) {
        resolvedTask.project_name = project.name;
      }
    } else if (task.project_name && !task.project_id) {
      // Has project_name but no project_id - try to find project_id
      const project = await Project.findOne({ name: task.project_name });
      if (project) {
        resolvedTask.project_id = project._id;
      }
    }

    resolvedTasks.push(resolvedTask);
  }

  return resolvedTasks;
};

/**
 * Create or update task log
 * If tasklog exists for userId + date → update (replace) existing record
 * Otherwise → create new record
 */
const createOrUpdateTaskLog = async (taskLogData) => {
  try {
    const { userId, date, totalHours, tasks } = taskLogData;

    console.log('createOrUpdateTaskLog - userId:', userId, 'date:', date);

    // Convert userId to ObjectId if it's a string
    let queryUserId;
    try {
      queryUserId = new mongoose.Types.ObjectId(userId);
    } catch (error) {
      console.error('Invalid userId format in createOrUpdateTaskLog:', userId, error.message);
      queryUserId = userId;
    }

    // Resolve project information for all tasks
    const resolvedTasks = await resolveProjectInfo(tasks);

    // Check if task log already exists for this user and date
    const existingTaskLog = await TaskLog.findOne({
      userId: queryUserId,
      date: new Date(date),
    });

    if (existingTaskLog) {
      // Update existing record
      existingTaskLog.totalHours = totalHours;
      existingTaskLog.tasks = resolvedTasks;
      await existingTaskLog.save();

      // Populate project information for response
      const populatedTaskLog = await populateTaskLogProjects(existingTaskLog);

      return {
        ...populatedTaskLog,
        isUpdate: true
      };
    } else {
      // Create new record
      const taskLog = new TaskLog({
        userId: queryUserId,
        date: new Date(date),
        totalHours,
        tasks: resolvedTasks,
      });

      await taskLog.save();

      // Populate project information for response
      const populatedTaskLog = await populateTaskLogProjects(taskLog);

      return {
        ...populatedTaskLog,
        isUpdate: false
      };
    }
  } catch (error) {
    throw error;
  }
};

/**
 * Find project by fuzzy name matching
 * Handles cases where project names have been updated
 */
const findProjectByFuzzyName = async (oldProjectName) => {
  try {
    const allProjects = await Project.find({});

    // Define mapping rules for known project name changes
    const nameMapping = {
      'Picklr': 'Picklr test',
      'CopperField': 'CopperTestField',
      // Add more mappings as needed
    };

    // Check direct mapping first
    if (nameMapping[oldProjectName]) {
      const project = allProjects.find(p => p.name === nameMapping[oldProjectName]);
      if (project) {
        console.log(`Mapped "${oldProjectName}" to "${project.name}"`);
        return project;
      }
    }

    // Try case-insensitive partial matching
    const lowerOldName = oldProjectName.toLowerCase();
    const partialMatch = allProjects.find(project => {
      const lowerCurrentName = project.name.toLowerCase();
      return lowerCurrentName.includes(lowerOldName) || lowerOldName.includes(lowerCurrentName);
    });

    if (partialMatch) {
      console.log(`Fuzzy matched "${oldProjectName}" to "${partialMatch.name}"`);
      return partialMatch;
    }

    return null;
  } catch (error) {
    console.error('Error in fuzzy project matching:', error.message);
    return null;
  }
};


const populateTaskLogProjects = async (taskLog) => {
  try {
    const tasksWithProjects = [];

    for (const task of taskLog.tasks) {
      // Handle both Mongoose documents and plain objects safely
      let taskWithProject;
      try {
        taskWithProject = task.toObject ? { ...task.toObject() } : { ...task };
      } catch (e) {
        // If toObject fails, just copy the task as-is
        taskWithProject = JSON.parse(JSON.stringify(task));
      }

      // If task has project_id, try to get the current project name
      if (taskWithProject.project_id) {
        try {
          const project = await Project.findById(taskWithProject.project_id);
          if (project) {
            taskWithProject.project_name = project.name;
          } else {
            console.warn(`Project not found for ID: ${taskWithProject.project_id}`);
          }
        } catch (error) {
          console.error(`Error finding project ${taskWithProject.project_id}:`, error.message);
          // Keep the existing project_name if lookup fails
        }
      } else if (taskWithProject.project_name && !taskWithProject.project_id) {
        // If task only has project_name, try to find the project and get current name
        try {
          let project = await Project.findOne({ name: taskWithProject.project_name });

          if (!project) {
            // Project name might have changed, try fuzzy matching
            project = await findProjectByFuzzyName(taskWithProject.project_name);
          }

          if (project) {
            // Update both project_id and project_name to current values
            taskWithProject.project_id = project._id;
            taskWithProject.project_name = project.name;
          } else {
            console.warn(`Project not found for name: "${taskWithProject.project_name}"`);
          }
        } catch (error) {
          console.error(`Error finding project by name ${taskWithProject.project_name}:`, error.message);
        }
      }

      tasksWithProjects.push(taskWithProject);
    }

    return {
      id: taskLog._id,
      userId: taskLog.userId,
      date: taskLog.date,
      totalHours: taskLog.totalHours,
      tasks: tasksWithProjects,
      createdAt: taskLog.createdAt,
      updatedAt: taskLog.updatedAt
    };
  } catch (error) {
    console.error('Error in populateTaskLogProjects:', error.message);
    // Return the original task log if population completely fails
    return {
      id: taskLog._id,
      userId: taskLog.userId,
      date: taskLog.date,
      totalHours: taskLog.totalHours,
      tasks: taskLog.tasks,
      createdAt: taskLog.createdAt,
      updatedAt: taskLog.updatedAt
    };
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
    const query = {};

    if (userId) {
      console.log('TaskLog Service - Filtering by userId:', userId, 'Type:', typeof userId);
      try {
        // Convert string userId to ObjectId for proper MongoDB querying
        query.userId = new mongoose.Types.ObjectId(userId);
      } catch (error) {
        console.error('Invalid userId format:', userId, error.message);
        // If conversion fails, use the original string (fallback)
        query.userId = userId;
      }
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    if (project_name) {
      // Search by project name in both project_name field and populated project names
      query['tasks.project_name'] = { $regex: project_name, $options: 'i' };
    }

    const taskLogs = await TaskLog.find(query)
      .populate('userId', 'name email role')
      .sort({ date: -1, createdAt: -1 });

    console.log('TaskLog Service - Found task logs:', taskLogs.length, 'for query:', JSON.stringify(query));

    // OPTIMIZATION: Batch fetch all unique project IDs first
    const allProjectIds = new Set();
    taskLogs.forEach(taskLog => {
      taskLog.tasks.forEach(task => {
        if (task.project_id) {
          allProjectIds.add(task.project_id.toString());
        }
      });
    });

    // Fetch all projects in one query
    const projectsMap = {};
    if (allProjectIds.size > 0) {
      const projects = await Project.find({ _id: { $in: Array.from(allProjectIds) } });
      projects.forEach(project => {
        projectsMap[project._id.toString()] = project.name;
      });
    }

    // Populate project information for each task log using the cached map
    const populatedTaskLogs = [];
    for (const taskLog of taskLogs) {
      try {
        const tasksWithProjects = taskLog.tasks.map(task => {
          const taskObj = task.toObject ? task.toObject() : { ...task };
          if (taskObj.project_id) {
            const projectId = taskObj.project_id.toString();
            taskObj.project_name = projectsMap[projectId] || taskObj.project_name;
          }
          return taskObj;
        });

        populatedTaskLogs.push({
          id: taskLog._id,
          userId: taskLog.userId,
          date: taskLog.date,
          totalHours: taskLog.totalHours,
          tasks: tasksWithProjects,
          createdAt: taskLog.createdAt,
          updatedAt: taskLog.updatedAt
        });
      } catch (error) {
        console.error(`Error populating task log ${taskLog._id}:`, error.message);
        // Return the task log without population if there's an error
        populatedTaskLogs.push({
          id: taskLog._id,
          userId: taskLog.userId,
          date: taskLog.date,
          totalHours: taskLog.totalHours,
          tasks: taskLog.tasks,
          createdAt: taskLog.createdAt,
          updatedAt: taskLog.updatedAt
        });
      }
    }

    return populatedTaskLogs;
  } catch (error) {
    console.error('Error in getTaskLogs:', error.message);
    throw error;
  }
};

/**
 * Get single task log by userId and date
 */
const getSingleTaskLog = async (userId, date) => {
  try {
    console.log('getSingleTaskLog - userId:', userId, 'date:', date);

    let queryUserId;
    try {
      // Convert string userId to ObjectId for proper MongoDB querying
      queryUserId = new mongoose.Types.ObjectId(userId);
    } catch (error) {
      console.error('Invalid userId format in getSingleTaskLog:', userId, error.message);
      queryUserId = userId;
    }

    const taskLog = await TaskLog.findOne({
      userId: queryUserId,
      date: new Date(date),
    }).populate('userId', 'name email role');

    if (!taskLog) {
      return null;
    }

    // Populate project information
    return await populateTaskLogProjects(taskLog);
  } catch (error) {
    throw error;
  }
};

/**
 * Update task log by ID
 */
const updateTaskLogById = async (taskLogId, updateData) => {
  try {
    const { totalHours, tasks } = updateData;

    // Validate each task if tasks array is provided
    if (tasks) {
      if (!Array.isArray(tasks) || tasks.length === 0) {
        throw new Error('Tasks must be a non-empty array');
      }

      for (const task of tasks) {
        if (!task.project_id && !task.project_name) {
          throw new Error('Each task must have either project_id or project_name');
        }
        if (task.hours === undefined) {
          throw new Error('Each task must have hours');
        }
        if (task.hours < 0 || task.hours > 24) {
          throw new Error('Task hours must be between 0 and 24');
        }
      }
    }

    // Find and update the task log
    const taskLog = await TaskLog.findById(taskLogId);

    if (!taskLog) {
      throw new Error('Task log not found');
    }


    // Update fields if provided
    if (totalHours !== undefined) {
      taskLog.totalHours = totalHours;
    }

    if (tasks) {
      // Resolve project information for updated tasks
      const resolvedTasks = await resolveProjectInfo(tasks);
      taskLog.tasks = resolvedTasks;
    }

    await taskLog.save();

    // Populate project information for response
    return await populateTaskLogProjects(taskLog);
  } catch (error) {
    throw error;
  }
};

/**
 * Soft delete task log by ID
 */
const deleteTaskLogById = async (taskLogId) => {
  try {
    const taskLog = await TaskLog.findById(taskLogId);

    if (!taskLog) {
      throw new Error('Task log not found');
    }


    const deleteTask = await TaskLog.findByIdAndDelete(taskLogId);


    return ({
      message: "Task log deleted successfully",
      data: deleteTask,
      success: true,
      status: 200,
    })
  } catch (error) {
    throw error;
  }
};

module.exports = {
  createOrUpdateTaskLog,
  getTaskLogs,
  getSingleTaskLog,
  updateTaskLogById,
  deleteTaskLogById
};
