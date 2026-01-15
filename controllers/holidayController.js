const holidayService = require('../services/holidayService');

/**
 * Get all holidays
 */
async function getHolidays(req, res) {
  try {
    const holidays = await holidayService.getAllHolidays();
    res.status(200).json({ holidays });
  } catch (error) {
    console.error('Error fetching holidays:', error);
    res.status(500).json({ message: error.message });
  }
}

/**
 * Add a new holiday
 */
async function addHoliday(req, res) {
  try {
    const { date, name, description } = req.body;
    
    if (!date || !name) {
      return res.status(400).json({ message: 'Date and name are required' });
    }
    
    const result = await holidayService.addHoliday(
      { date, name, description },
      req.user._id
    );
    
    res.status(201).json({
      message: 'Holiday added successfully',
      ...result
    });
  } catch (error) {
    console.error('Error adding holiday:', error);
    res.status(500).json({ message: error.message });
  }
}

/**
 * Remove a holiday
 */
async function removeHoliday(req, res) {
  try {
    const { date } = req.params;
    
    const result = await holidayService.removeHoliday(date);
    
    res.status(200).json({
      message: 'Holiday removed successfully',
      ...result
    });
  } catch (error) {
    console.error('Error removing holiday:', error);
    res.status(500).json({ message: error.message });
  }
}

/**
 * Update a holiday
 */
async function updateHoliday(req, res) {
  try {
    const { date } = req.params;
    const { name, description } = req.body;
    
    const holiday = await holidayService.updateHoliday(date, { name, description });
    
    res.status(200).json({
      message: 'Holiday updated successfully',
      holiday
    });
  } catch (error) {
    console.error('Error updating holiday:', error);
    res.status(500).json({ message: error.message });
  }
}

module.exports = {
  getHolidays,
  addHoliday,
  removeHoliday,
  updateHoliday
};
