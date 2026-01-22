const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const { authMiddleware } = require("./middlewares/authMiddleware");
const mongoSanitize = require('express-mongo-sanitize');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const projectRoutes = require('./routes/projectRoutes');
const tasklogRoutes = require('./routes/tasklogRoutes');
const reportRoutes = require('./routes/reportRoutes');
const teamRoutes = require('./routes/teamRoutes');

// NEW: Attendance system routes
const systemSettingsRoutes = require('./routes/systemSettingsRoutes');
const bufferCounterRoutes = require('./routes/bufferCounterRoutes');
const attendanceSystemRoutes = require('./routes/attendanceSystemRoutes');
const attendanceAutomationRoute = require('./routes/attendanceAutomationRoute');
const holidayRoutes = require('./routes/holidayRoutes');

// Import cron job function
const { startCronJob } = require('./services/attendance-automation');

// Import middleware
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');



const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors("*"));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(mongoSanitize());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Connect to MongoDB on each request (for serverless environments)
app.use(async (req, res, next) => {
  if (mongoose.connection.readyState === 0) {
    await connectDB();
  }
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'OBS Task Manager Backend is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API Routes
app.use('/auth', authRoutes);
app.use("/attendance-automation", attendanceAutomationRoute)
app.use(authMiddleware);
app.use('/users', userRoutes);
app.use('/projects', projectRoutes);
app.use('/tasklogs', tasklogRoutes);
app.use('/reports', reportRoutes);
app.use('/teams', teamRoutes);

// NEW: Attendance system routes
app.use('/system-settings', systemSettingsRoutes);
app.use('/buffer-counter', bufferCounterRoutes);
app.use('/attendance-system', attendanceSystemRoutes);
app.use('/holidays', holidayRoutes);


// 404 handler for undefined routes
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// MongoDB connection
const connectDB = async () => {
  try {
    // Check if already connected (for serverless environments like Vercel)
    if (mongoose.connection.readyState === 1) {
      console.log('✅ Using existing MongoDB connection');
      return;
    }

    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    
    // Start the attendance automation cron job
    startCronJob();

  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Start server
const startServer = async () => {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 API Base URL: http://localhost:${PORT}/api`);
      console.log(`🔍 Health Check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.error('❌ Unhandled Promise Rejection:', err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received. Shutting down gracefully...');
  mongoose.connection.close(() => {
    console.log('📦 MongoDB connection closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received. Shutting down gracefully...');
  mongoose.connection.close(() => {
    console.log('📦 MongoDB connection closed.');
    process.exit(0);
  });
});

// Only start the server if not in Vercel environment
// Vercel handles serverless invocation automatically
if (process.env.VERCEL !== '1') {
  startServer();
}

module.exports = app;
