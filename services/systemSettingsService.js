const SystemSettings = require('../models/SystemSettings');

/**
 * Get the currently active system settings
 */
async function getActiveSettings() {
  try {
    const settings = await SystemSettings.findOne({ isActive: true });
    
    if (!settings) {
      throw new Error('No active system settings found');
    }
    
    return settings;
  } catch (error) {
    console.error('Error fetching active settings:', error);
    throw error;
  }
}

/**
 * Create new system settings
 */
async function createSettings(data, adminId) {
  try {
    // Get current version
    const latestSettings = await SystemSettings.findOne().sort({ version: -1 });
    const nextVersion = latestSettings ? latestSettings.version + 1 : 1;

    const settings = new SystemSettings({
      ...data,
      version: nextVersion,
      createdBy: adminId,
      isActive: true,
      effectiveFrom: data.effectiveFrom || new Date()
    });

    await settings.save();
    return settings;
  } catch (error) {
    console.error('Error creating settings:', error);
    throw error;
  }
}

/**
 * Update existing system settings (creates new version)
 */
async function updateSettings(id, data, adminId) {
  try {
    const currentSettings = await SystemSettings.findById(id);
    
    if (!currentSettings) {
      throw new Error('Settings not found');
    }

    // Create new version
    const newSettings = await createSettings({
      bufferTimeMinutes: data.bufferTimeMinutes || currentSettings.bufferTimeMinutes,
      safeZoneMinutes: data.safeZoneMinutes || currentSettings.safeZoneMinutes,
      bufferUseLimit: data.bufferUseLimit || currentSettings.bufferUseLimit,
      reducedBufferMinutes: data.reducedBufferMinutes || currentSettings.reducedBufferMinutes,
      defaultOfficeStartTime: data.defaultOfficeStartTime || currentSettings.defaultOfficeStartTime,
      defaultOfficeEndTime: data.defaultOfficeEndTime || currentSettings.defaultOfficeEndTime,
      forceDefaultOfficeHours: data.forceDefaultOfficeHours !== undefined ? data.forceDefaultOfficeHours : currentSettings.forceDefaultOfficeHours,
      effectiveFrom: data.effectiveFrom || new Date(),
      lastAttendanceFetchedDate: data.lastAttendanceFetchedDate || currentSettings.lastAttendanceFetchedDate
    }, adminId);

    return newSettings;
  } catch (error) {
    console.error('Error updating settings:', error);
    throw error;
  }
}

/**
 * Get all settings history
 */
async function getSettingsHistory() {
  try {
    const history = await SystemSettings.find()
      .sort({ version: -1 })
      .populate('createdBy', 'name email');
    
    return history;
  } catch (error) {
    console.error('Error fetching settings history:', error);
    throw error;
  }
}

/**
 * Get settings snapshot object for storage
 */
function createSettingsSnapshot(settings) {
  return {
    bufferTimeMinutes: settings.bufferTimeMinutes,
    safeZoneMinutes: settings.safeZoneMinutes,
    bufferUseLimit: settings.bufferUseLimit,
    reducedBufferMinutes: settings.reducedBufferMinutes,
    settingsVersion: settings.version,
    effectiveFrom: settings.effectiveFrom
  };
}

/**
 * Update last attendance fetched date
 */
async function updateLastFetchedDate(date) {
  try {
    const settings = await getActiveSettings();
    settings.lastAttendanceFetchedDate = date;
    await settings.save();
    return settings;
  } catch (error) {
    console.error('Error updating last fetched date:', error);
    throw error;
  }
}

module.exports = {
  getActiveSettings,
  createSettings,
  updateSettings,
  getSettingsHistory,
  createSettingsSnapshot,
  updateLastFetchedDate
};
