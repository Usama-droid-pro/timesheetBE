const TaskLog = require('../models/TaskLog');
const User = require('../models/User');
const { sendSuccess, sendError, sendServerError } = require('../utils/responseHandler');

/**
 * Report Service
 * Handles report-related business logic
 */

/**
 * Generate grand report with role-based hour tracking
 * Groups by project_name, calculates hours per role (QA, DESIGN, DEV, PM)
 */
const generateGrandReport = async (startDate, endDate) => {
  try {
    // Build date filter
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    // MongoDB aggregation pipeline
    const pipeline = [
      // Match task logs within date range and not deleted
      {
        $match: {
          isDeleted: false,
          ...(Object.keys(dateFilter).length > 0 && { date: dateFilter })
        }
      },
      // Lookup user information
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      // Unwind user array (should be single user)
      {
        $unwind: '$user'
      },
      // Filter out soft deleted users
      {
        $match: {
          'user.isDeleted': false
        }
      },
      // Unwind tasks array to process each task individually
      {
        $unwind: '$tasks'
      },
      // Group by project name and user role
      {
        $group: {
          _id: {
            project: '$tasks.project_name',
            role: '$user.role'
          },
          totalHours: { $sum: '$tasks.hours' }
        }
      },
      // Group by project to aggregate all roles
      {
        $group: {
          _id: '$_id.project',
          roles: {
            $push: {
              role: '$_id.role',
              hours: '$totalHours'
            }
          },
          totalHours: { $sum: '$totalHours' }
        }
      },
      // Sort by project name
      {
        $sort: { '_id': 1 }
      }
    ];

    const projectData = await TaskLog.aggregate(pipeline);

    // Transform data to the required format
    const projects = projectData.map(project => {
      const projectObj = {
        project: project._id,
        totalHours: project.totalHours,
        QA: 0,
        DESIGN: 0,
        DEV: 0,
        PM: 0
      };

      // Fill in role-specific hours
      project.roles.forEach(roleData => {
        if (roleData.role in projectObj) {
          projectObj[roleData.role] = roleData.hours;
        }
      });

      return projectObj;
    });

    // Calculate totals
    const totals = projects.reduce((acc, project) => {
      acc.totalHours += project.totalHours;
      acc.QA += project.QA;
      acc.DESIGN += project.DESIGN;
      acc.DEV += project.DEV;
      acc.PM += project.PM;
      return acc;
    }, {
      totalHours: 0,
      QA: 0,
      DESIGN: 0,
      DEV: 0,
      PM: 0
    });

    return {
      projects,
      totals,
      dateRange: {
        startDate: startDate || 'All time',
        endDate: endDate || 'All time'
      },
      totalProjects: projects.length
    };
  } catch (error) {
    throw error;
  }
};

module.exports = {
  generateGrandReport
};
