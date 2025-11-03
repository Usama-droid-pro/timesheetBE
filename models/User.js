const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters long']
  },
  role: {
    type: String,
    required: [true, 'Role is required'],
    enum: {
      values: ['QA', 'DESIGN', 'DEV', 'PM', 'Admin'],
      message: 'Role must be one of: QA, DESIGN, DEV, PM, Admin'
    }
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  isAdmin : {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for email uniqueness
userSchema.index({ email: 1 }, { unique: true });

// Index for soft delete queries
userSchema.index({ isDeleted: 1 });

// Index for name field for fast search queries
userSchema.index({ name: 1 });

module.exports = mongoose.model('User', userSchema);
