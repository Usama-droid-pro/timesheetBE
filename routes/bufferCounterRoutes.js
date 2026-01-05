const express = require('express');
const router = express.Router();
const {
  getUserCounter,
  getUserHistory,
  getReport,
  manualReset
} = require('../controllers/bufferCounterController');
// const auth = require('../middlewares/authMiddleware');
// const adminAuth = require('../middlewares/adminAuth');

// User routes
router.get('/user/:userId', getUserCounter);
router.get('/user/:userId/history', getUserHistory);

// Admin-only routes
router.get('/monthly-report/:month/:year', getReport);
router.post('/reset', manualReset);

module.exports = router;
