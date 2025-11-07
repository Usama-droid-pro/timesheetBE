const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Project name is required'],
    trim: true,
    maxlength: [200, 'Project name cannot exceed 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  status: {
    type: String,
    enum: {
      values: ['done', 'inprogress', 'paused', 'backlog'],
      message: 'Status must be one of: done, inprogress, paused, backlog'
    },
    default: 'inprogress'
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, {
  timestamps: true
});

// Index for soft delete queries
projectSchema.index({ isDeleted: 1 });

// Index for project name search
projectSchema.index({ name: 1 });

module.exports = mongoose.model('Project', projectSchema);
