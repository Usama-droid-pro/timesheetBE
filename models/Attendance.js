const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  punches: [{
    time: String, // String representation from biometric
    rawTime: Date,
    source: {
      type: String,
      default: 'Biometric'
    }
  }],
  status: {
    type: String,
    enum: ['Present', 'Absent', 'Approved Leave', 'Rejected Leave', 'Half Day', 'Holiday'],
    default: 'Present'
  },
  adminStatus: {
    type: String,
    enum: ['Absent', 'Approved Leave', 'Rejected Leave', 'NA'],
    default: 'NA'
  },
  note: {
    type: String,
    required: false
  },
  isManual: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Compound index to ensure one record per user per date
attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
