const mongoose = require('mongoose');

const attendanceSystemSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  teamId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  
  // Check-in/out times
  checkInTime: {
    type: String,
    required: false
  },
  checkOutTime: {
    type: String,
    required: false
  },
  
  // User's office hours (snapshot at calculation time)
  officeStartTime: {
    type: String,
    required: true
  },
  officeEndTime: {
    type: String,
    required: true
  },
  
  // Calculation results
  totalWorkMinutes: {
    type: Number,
    required: true,
    min: 0
  },
  deductionMinutes: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  extraHoursMinutes: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  
  // Rule flags (what happened this day)
  ruleApplied: {
    isLate: {
      type: Boolean,
      default: false
    },
    hasDeduction: {
      type: Boolean,
      default: false
    },
    hasExtraHours: {
      type: Boolean,
      default: false
    },
    isBufferUsed: {
      type: Boolean,
      default: false
    },
    isBufferAbused: {
      type: Boolean,
      default: false
    },
    isSafeZone: {
      type: Boolean,
      default: false
    },
    isEarlyCheckout: {
      type: Boolean,
      default: false
    },
    isWorkedFromHome: {
      type: Boolean,
      default: false
    },
    noCalculationRulesApplied: {
      type: Boolean,
      default: false
    }
  },
  
  // Buffer tracking
  bufferCountAtCalculation: {
    type: Number,
    required: true,
    default: 0
  },
  bufferIncrementedThisDay: {
    type: Boolean,
    required: true,
    default: false
  },
  
  // System settings snapshot
  systemSettingsSnapshot: {
    bufferTimeMinutes: Number,
    safeZoneMinutes: Number,
    bufferUseLimit: Number,
    reducedBufferMinutes: Number,
    settingsVersion: Number,
    effectiveFrom: Date
  },
  
  // Approval & payout
  approvalStatus: {
    type: String,
    default: 'Pending',
    enum: ['Pending', 'NA', 'Approved', 'SinglePay', 'Rejected']
  },
  payoutMultiplier: {
    type: Number,
    required: true,
    default: 1
  },
  calculatedPayout: {
    type: Number,
    default: 0
  },
  
  // Metadata
  note: {
    type: String,
    required: false
  },
  description: {
    type: String,
    required: false
  },
  ignoreDeduction: {
    type: Boolean,
    default: false
  },
  
  // Half day flag
  isHalfDay: {
    type: Boolean,
    default: false
  },
  
  // Adjustment history for tooltip display
  adjustmentHistory: [{
    reason: String,
    fromDeduction: Number,
    toDeduction: Number,
    fromExtra: Number,
    toExtra: Number,
    adjustedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    adjustedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Leave/Absent flags (no calculations applied)
  isAbsent: {
    type: Boolean,
    default: false
  },
  isPaidLeave: {
    type: Boolean,
    default: false
  },
  
  // Second/Third Entry Tracking
  isAnotherEntry: {
    type: Boolean,
    default: false
  },
  anotherEntryDetails: {
    entryNo: {
      type: Number,
      enum: [2, 3]
    },
    entryType: {
      type: String,
      enum: ['manual', 'automatic']
    }
  },
  
  calculatedAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  isWeekendWork : {
    type : Boolean,
    default : false
  }
}, {
  timestamps: true
});

// Compound index to ensure one record per user per date
// attendanceSystemSchema.index({ userId: 1, date: 1 }, { unique: true });

// Index for team-based queries
attendanceSystemSchema.index({ teamId: 1, date: -1 });

// Index for approval status filtering
attendanceSystemSchema.index({ approvalStatus: 1 });

// Index for date range queries
attendanceSystemSchema.index({ date: -1 });

module.exports = mongoose.model('AttendanceSystem', attendanceSystemSchema);
