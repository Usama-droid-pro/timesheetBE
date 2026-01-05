const {
  getActiveSettings,
  createSettings,
  updateSettings,
  getSettingsHistory
} = require('../services/systemSettingsService');

/**
 * @route   GET /api/system-settings/active
 * @desc    Get currently active system settings
 * @access  Private
 */
async function getActive(req, res) {
  try {
    const settings = await getActiveSettings();
    res.json({ success: true, data: settings });
  } catch (error) {
    console.error('Error fetching active settings:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch settings', error: error.message });
  }
}

/**
 * @route   POST /api/system-settings
 * @desc    Create new system settings (Admin only)
 * @access  Private/Admin
 */
async function create(req, res) {
  try {
    const {
      bufferTimeMinutes,
      safeZoneMinutes,
      bufferUseLimit,
      reducedBufferMinutes,
      defaultOfficeStartTime,
      defaultOfficeEndTime,
      effectiveFrom
    } = req.body;

    const settings = await createSettings({
      bufferTimeMinutes,
      safeZoneMinutes,
      bufferUseLimit,
      reducedBufferMinutes,
      defaultOfficeStartTime,
      defaultOfficeEndTime,
      effectiveFrom
    }, req.user.id);

    res.status(201).json({ 
      success: true, 
      message: 'System settings created successfully', 
      data: settings 
    });
  } catch (error) {
    console.error('Error creating settings:', error);
    res.status(500).json({ success: false, message: 'Failed to create settings', error: error.message });
  }
}

/**
 * @route   PUT /api/system-settings/:id
 * @desc    Update system settings (creates new version) (Admin only)
 * @access  Private/Admin
 */
async function update(req, res) {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const settings = await updateSettings(id, updateData, req.user.id);

    res.json({ 
      success: true, 
      message: 'System settings updated successfully', 
      data: settings 
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ success: false, message: 'Failed to update settings', error: error.message });
  }
}

/**
 * @route   GET /api/system-settings/history
 * @desc    Get all settings history (Admin only)
 * @access  Private/Admin
 */
async function getHistory(req, res) {
  try {
    const history = await getSettingsHistory();
    res.json({ success: true, data: history });
  } catch (error) {
    console.error('Error fetching settings history:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch history', error: error.message });
  }
}

module.exports = {
  getActive,
  create,
  update,
  getHistory
};
