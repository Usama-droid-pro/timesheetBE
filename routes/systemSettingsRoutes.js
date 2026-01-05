const express = require('express');
const router = express.Router();
const {
  getActive,
  create,
  update,
  getHistory
} = require('../controllers/systemSettingsController');
// const auth = require('../middlewares/authMiddleware');
// const adminAuth = require('../middlewares/authMiddleware');

// Public/User routes
router.get('/active', getActive);

// Admin-only routes
router.post('/', create);
router.put('/:id', update);
router.get('/history', getHistory);

module.exports = router;
