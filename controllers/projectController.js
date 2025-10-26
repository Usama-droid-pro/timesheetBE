const ProjectService = require('../services/projectService');
const { sendSuccess, sendError, sendServerError } = require('../utils/responseHandler');

/**
 * Project Controller
 * Handles project-related HTTP requests
 */

/**
 * POST /api/projects
 * Create a new project
 */
const createProject = async (req, res) => {
  try {
    const { name, description } = req.body;

    const project = await ProjectService.createProject({ name, description });
    
    return sendSuccess(res, 'Project created successfully', { project }, 201);
  } catch (error) {
    console.error('Create project error:', error);
    return sendError(res, error.message, null, 400);
  }
};

/**
 * GET /api/projects
 * Get all projects (exclude soft deleted)
 */
const getAllProjects = async (req, res) => {
  try {
    const projects = await ProjectService.getAllProjects();
    
    return sendSuccess(res, 'Projects retrieved successfully', { projects }, 200);
  } catch (error) {
    console.error('Get projects error:', error);
    return sendServerError(res, 'Failed to retrieve projects', error.message);
  }
};

/**
 * DELETE /api/projects/:id
 * Soft delete project (Admin only)
 */
const deleteProject = async (req, res) => {
  try {
    const { id } = req.params;

    const project = await ProjectService.deleteProject(id);
    
    return sendSuccess(res, 'Project deleted successfully', { project }, 200);
  } catch (error) {
    console.error('Delete project error:', error);
    return sendError(res, error.message, null, 400);
  }
};

module.exports = {
  createProject,
  getAllProjects,
  deleteProject
};
