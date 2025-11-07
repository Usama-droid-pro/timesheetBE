const TaskLog = require('../models/TaskLog');
const User = require('../models/User');
const Project = require('../models/Project');
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
      // Lookup project information for tasks that have project_id
      {
        $lookup: {
          from: 'projects',
          localField: 'tasks.project_id',
          foreignField: '_id',
          as: 'projectInfo'
        }
      },
      // Add computed field for project name (prioritize project_id lookup over project_name)
      {
        $addFields: {
          'tasks.resolvedProjectName': {
            $cond: {
              if: { $ne: [{ $arrayElemAt: ['$projectInfo.name', 0] }, null] },
              then: { $arrayElemAt: ['$projectInfo.name', 0] },
              else: '$tasks.project_name'
            }
          }
        }
      },
      // Group by resolved project name and user role
      {
        $group: {
          _id: {
            project: '$tasks.resolvedProjectName',
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

/**
 * Generate project-user report for a date range
 * Returns grand report data + users (id, name, role) + task logs in range
 */
const generateProjectUsersReport = async (startDate, endDate) => {
  try {
    // Grand report (projects + totals)
    const grand = await generateGrandReport(startDate, endDate);

    // Date filter
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    // Aggregation to group logs by user in a single query
    const pipeline = [
      {
        $match: {
          isDeleted: false,
          ...(Object.keys(dateFilter).length > 0 && { date: dateFilter })
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $match: {
          'user.isDeleted': false
        }
      },
      {
        $group: {
          _id: {
            userId: '$user._id',
            name: '$user.name',
            role: '$user.role'
          },
          logs: {
            $push: {
              id: '$_id',
              date: '$date',
              totalHours: '$totalHours',
              tasks: '$tasks'
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          userId: '$_id.userId',
          name: '$_id.name',
          role: '$_id.role',
          logs: 1
        }
      },
      { $sort: { name: 1 } }
    ];

  const usersLogs = await TaskLog.aggregate(pipeline);

  // Ensure all users are present even if they have no logs in the range
  const allUsers = await User.find({ isDeleted: false }).select('_id name role').sort({ name: 1 });

  const byUserId = new Map(usersLogs.map(u => [String(u.userId), u]));

  const mergedUsers = allUsers.map(u => {
    const found = byUserId.get(String(u._id));
    if (found) {
      // Compute total hours across logs for this user
      const total = Array.isArray(found.logs)
        ? found.logs.reduce((sum, l) => sum + (Number(l.totalHours) || 0), 0)
        : 0;
      return {
        userId: found.userId,
        name: found.name,
        role: found.role,
        totalHours: parseFloat(total.toFixed(2)),
        logs: found.logs
      };
    }
    return {
      userId: u._id,
      name: u.name,
      role: u.role,
      totalHours: 0.00,
      logs: []
    };
  });

  return {
      GrandReport: {
        projects: grand.projects,
        totals: grand.totals,
        dateRange: grand.dateRange,
        totalProjects: grand.totalProjects
      },
    usersLogs: mergedUsers
    };
  } catch (error) {
    throw error;
  }
};

module.exports = {
  generateGrandReport,
  generateProjectUsersReport
};
