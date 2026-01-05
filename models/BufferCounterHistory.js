const mongoose = require('mongoose');

const bufferCounterHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  month: {
    type: Number,
    required: true,
    min: 1,
    max: 12
  },
  year: {
    type: Number,
    required: true,
    min: 2020,
    max: 2100
  },
  bufferUseCount: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  bufferAbusedReached: {
    type: Boolean,
    required: true,
    default: false
  },
  usageDates: [{
    type: Date
  }]
}, {
  timestamps: true
});

// Compound unique index to ensure one record per user per month/year
bufferCounterHistorySchema.index({ userId: 1, year: 1, month: 1 }, { unique: true });

// Index for finding current month records
bufferCounterHistorySchema.index({ year: 1, month: 1 });

// Index for user-specific queries
bufferCounterHistorySchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('BufferCounterHistory', bufferCounterHistorySchema);
