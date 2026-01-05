const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema({
  bufferTimeMinutes: {
    type: Number,
    required: true,
    default: 30,
    min: 0,
    max: 60
  },
  safeZoneMinutes: {
    type: Number,
    required: true,
    default: 10,
    min: 0,
    max: 30
  },
  bufferUseLimit: {
    type: Number,
    required: true,
    default: 5,
    min: 1,
    max: 20
  },
  reducedBufferMinutes: {
    type: Number,
    required: true,
    default: 10,
    min: 0,
    max: 30
  },
  defaultOfficeStartTime: {
    type: String,
    required: true,
    default: '10:00',
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
  },
  defaultOfficeEndTime: {
    type: String,
    required: true,
    default: '19:00',
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
  },
  version: {
    type: Number,
    required: true,
    default: 1
  },
  isActive: {
    type: Boolean,
    required: true,
    default: true
  },
  effectiveFrom: {
    type: Date,
    required: true,
    default: Date.now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastAttendanceFetchedDate: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Index for finding active settings quickly
systemSettingsSchema.index({ isActive: 1 });

// Index for version history
systemSettingsSchema.index({ version: -1 });

// Pre-save hook to deactivate previous active settings
systemSettingsSchema.pre('save', async function(next) {
  if (this.isNew && this.isActive) {
    // Deactivate all other active settings
    await mongoose.model('SystemSettings').updateMany(
      { isActive: true, _id: { $ne: this._id } },
      { $set: { isActive: false } }
    );
  }
  next();
});

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
