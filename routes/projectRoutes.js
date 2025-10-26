const express = require('express');
const { body, param } = require('express-validator');
const { createProject, getAllProjects, deleteProject } = require('../controllers/projectController');
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
    .withMessage('Description cannot exceed 1000 characters')
], createProject);

/**
 * GET /api/projects
 * Get all projects (exclude soft deleted)
 */
router.get('/', [
  authMiddleware
], getAllProjects);

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
