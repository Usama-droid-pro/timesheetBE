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
    const { name, description, status, members } = projectData;

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
      status: status ? status : 'backlog',
      isDeleted: false,
      members: Array.isArray(members) ? members : []
    });

    await project.save();

    return {
      id: project._id,
      name: project.name,
      description: project.description,
      status: project.status,
      members: project.members,
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
    const projects = await Project.find({isDeleted: false}).populate('members', 'name email role isAdmin');

    return projects.map(project => ({
      id: project._id,
      name: project.name,
      description: project.description,
      status: project.status,
      isDeleted: project.isDeleted,
      isDeletedAt: project.isDeletedAt,
      members: Array.isArray(project.members)
        ? project.members.map(m => ({
            id: m._id,
            name: m.name,
            email: m.email,
            role: m.role,
            isAdmin: m.isAdmin
          }))
        : [],
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    }));
  } catch (error) {
    throw error;
  }
};

const getProjects = async () => {
  try {
    const projects = await Project.find().populate('members', 'name email role isAdmin');

    return projects.map(project => ({
      id: project._id,
      name: project.name,
      description: project.description,
      status: project.status,
      isDeleted: project.isDeleted,
      isDeletedAt: project.isDeletedAt,
      members: Array.isArray(project.members)
        ? project.members.map(m => ({
            id: m._id,
            name: m.name,
            email: m.email,
            role: m.role,
            isAdmin: m.isAdmin
          }))
        : [],
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
    console.log("IN delete project ")
    console.log(projectId)
    const project = await Project.findById(projectId);

    
    if (!project) {
      throw new Error('Project not found');
    }

    project.isDeleted = true;
    project.isDeletedAt = new Date();
    await project.save();
  

    return ({
      message : "Project deleted successfully",
      success : true,
      status : 200
    })
  } catch (error) {
    throw error;
  }
};

/**
 * Update a project by ID
 */
const updateProject = async (projectId, updateData) => {
  try {
    const { name, description, status, members } = updateData;

    const project = await Project.findById(projectId);

    if (!project) {
      throw new Error('Project not found');
    }

    if (name !== undefined) {
      const trimmedName = name.trim();
      if (trimmedName.length < 2 || trimmedName.length > 200) {
        throw new Error('Project name must be between 2 and 200 characters');
      }
      // Ensure name uniqueness when changing name
      const existing = await Project.findOne({ name: trimmedName, _id: { $ne: projectId } });
      if (existing) {
        throw new Error('Project with this name already exists');
      }
      project.name = trimmedName;
    }

    if (description !== undefined) {
      const trimmedDesc = description ? description.trim() : '';
      if (trimmedDesc.length > 1000) {
        throw new Error('Description cannot exceed 1000 characters');
      }
      project.description = trimmedDesc;
    }

    if (status !== undefined) {
      const allowed = ['done', 'inprogress', 'paused', 'backlog'];
      if (!allowed.includes(status)) {
        throw new Error('Status must be one of: done, inprogress, paused, backlog');
      }
      project.status = status;
    }

    if (members !== undefined) {
      if (!Array.isArray(members)) {
        throw new Error('Members must be an array of user IDs');
      }
      project.members = members;
    }

    await project.save();

    await project.populate('members', 'name email role isAdmin');

    return {
      id: project._id,
      name: project.name,
      description: project.description,
      status: project.status,
      members: Array.isArray(project.members)
        ? project.members.map(m => ({
            id: m._id,
            name: m.name,
            email: m.email,
            role: m.role,
            isAdmin: m.isAdmin
          }))
        : [],
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    };
  } catch (error) {
    throw error;
  }
};

module.exports = {
  createProject,
  getAllProjects,
  deleteProject,
  updateProject,
  getProjects
};
