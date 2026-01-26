const mongoose = require('mongoose');

const manualAttendanceRequestSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  teamId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    required: true
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  checkInTime: {
    type: String,
    required: true,
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
  },
  checkOutTime: {
    type: String,
    required: true,
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
  },
  reason: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  applyRules: {
    type: Boolean,
    default: true
  },
  isWorkedFromHome: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending',
    index: true
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: {
    type: Date
  },
  reviewNote: {
    type: String,
    trim: true,
    maxlength: 500
  }
}, {
  timestamps: true
});

// Compound index for efficient filtering
manualAttendanceRequestSchema.index({ userId: 1, status: 1, date: -1 });

module.exports = mongoose.model('ManualAttendanceRequest', manualAttendanceRequestSchema);
