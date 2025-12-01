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
    const { name, description, status, members } = req.body;

    const project = await ProjectService.createProject({ name, description, status, members });
    
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
    
    return sendSuccess(res, 'Projects retrieved successfully', {items : projects }, 200);
  } catch (error) {
    console.error('Get projects error:', error);
    return sendServerError(res, 'Failed to retrieve projects', error.message);
  }
};

const getProjects = async (req, res) => {
  try {
    const projects = await ProjectService.getProjects();
    
    return sendSuccess(res, 'Projects retrieved successfully', {items : projects }, 200);
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

/**
 * PUT /api/projects/:id
 * Update a project by ID
 */
const updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, status, members } = req.body;

    // Ensure at least one field provided
    if (name === undefined && description === undefined) {
      return sendError(res, 'Provide at least one field to update (name or description)');
    }

    const project = await ProjectService.updateProject(id, { name, description, status, members });
    return sendSuccess(res, 'Project updated successfully', { project }, 200);
  } catch (error) {
    console.error('Update project error:', error);
    return sendError(res, error.message, null, 400);
  }
};

module.exports = {
  createProject,
  getAllProjects,
  getProjects,
  deleteProject,
  updateProject
};
