const Project = require('../models/Project');
const { sendSuccess, sendError, sendServerError } = require('../utils/responseHandler');

/**
 * Project Service
 * Handles project-related business logic
 */

/**
 * Create a new project
 */
const createProject = async (projectData) => {
  try {
    const { name, description } = projectData;

    // Check if project already exists
    const existingProject = await Project.findOne({ 
      name: name.trim(), 
      isDeleted: false 
    });
    
    if (existingProject) {
      throw new Error('Project with this name already exists');
    }

    // Create project
    const project = new Project({
      name: name.trim(),
      description: description ? description.trim() : '',
      isDeleted: false
    });

    await project.save();

    return {
      id: project._id,
      name: project.name,
      description: project.description,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Get all projects (exclude soft deleted)
 */
const getAllProjects = async () => {
  try {
    const projects = await Project.find({ isDeleted: false })
      .sort({ createdAt: -1 });

    return projects.map(project => ({
      id: project._id,
      name: project.name,
      description: project.description,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    }));
  } catch (error) {
    throw error;
  }
};

/**
 * Soft delete project (Admin only)
 */
const deleteProject = async (projectId) => {
  try {
    const project = await Project.findById(projectId);
    
    if (!project || project.isDeleted) {
      throw new Error('Project not found');
    }

    // Soft delete
    project.isDeleted = true;
    await project.save();

    return {
      id: project._id,
      name: project.name,
      description: project.description,
      deletedAt: new Date()
    };
  } catch (error) {
    throw error;
  }
};

module.exports = {
  createProject,
  getAllProjects,
  deleteProject
};
