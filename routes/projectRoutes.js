const express = require('express');
const { body, param } = require('express-validator');
const { createProject, getAllProjects, deleteProject, updateProject, getProjects } = require('../controllers/projectController');
const { authMiddleware, adminMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

/**
 * POST /api/projects
 * Create a new project
 */
router.post('/', [
  authMiddleware,
  body('name')
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Project name must be between 2 and 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description cannot exceed 1000 characters'),
  body('status')
    .optional()
    .isIn(['done', 'inprogress', 'paused', 'backlog'])
    .withMessage('Status must be one of: done, inprogress, paused, backlog'),
  body('members')
    .optional()
    .isArray()
    .withMessage('Members must be an array of user IDs'),
  body('members.*')
    .optional()
    .isMongoId()
    .withMessage('Each member must be a valid user ID')
], createProject);

/**
 * GET /api/projects
 * Get all projects (exclude soft deleted)
 */
router.get('/', [
], getAllProjects);

router.get("/allValid" , getProjects)

/**
 * PUT /api/projects/:id
 * Update a project by ID
 */
router.put('/:id', [
  authMiddleware,
  param('id').isMongoId().withMessage('Invalid project ID'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Project name must be between 2 and 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description cannot exceed 1000 characters'),
  body('status')
    .optional()
    .isIn(['done', 'inprogress', 'paused', 'backlog'])
    .withMessage('Status must be one of: done, inprogress, paused, backlog'),
  body('members')
    .optional()
    .isArray()
    .withMessage('Members must be an array of user IDs'),
  body('members.*')
    .optional()
    .isMongoId()
    .withMessage('Each member must be a valid user ID')
], updateProject);

/**
 * DELETE /api/projects/:id
 * Soft delete project (Admin only)
 */
router.delete('/:id', [
  authMiddleware,
  adminMiddleware,
  param('id').isMongoId().withMessage('Invalid project ID')
], deleteProject);

module.exports = router;
