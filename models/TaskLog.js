const mongoose = require('mongoose');

const taskLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
  date: {
    type: Date,
    required: [true, 'Date is required']
  },
  totalHours: {
    type: Number,
    required: [true, 'Total hours is required'],
    min: [0, 'Total hours cannot be negative']
  },
  tasks: [{
    project_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: function() {
        // Require project_id for new entries, but allow existing entries with project_name
        return !this.project_name;
      }
    },
    project_name: {
      type: String,
      trim: true,
      maxlength: [200, 'Project name cannot exceed 200 characters'],
      required: function() {
        // Require project_name for legacy entries, but allow new entries with project_id
        return !this.project_id;
      }
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Task description cannot exceed 1000 characters']
    },
    hours: {
      type: Number,
      required: [true, 'Hours is required for each task'],
      min: [0, 'Hours cannot be negative'],
      max: [24, 'Hours cannot exceed 24 per task']
    }
  }],
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Compound index to ensure one task log per user per date
taskLogSchema.index({ userId: 1, date: 1 }, { unique: true });

// Index for soft delete queries
taskLogSchema.index({ isDeleted: 1 });

// Index for date range queries
taskLogSchema.index({ date: 1 });

// Index for user queries
taskLogSchema.index({ userId: 1 });

module.exports = mongoose.model('TaskLog', taskLogSchema);
