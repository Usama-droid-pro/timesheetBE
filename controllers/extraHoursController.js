const { sendSuccess, sendNotFound, sendServerError } = require('../utils/responseHandler');
const { sendForbidden, sendError } = require('../utils/responseHandler');
const extraHoursService = require('../services/extraHoursService');

const addExtraHours = async (req, res) => {
  try {
    const entry = await extraHoursService.addExtraHours(req.body);
    return sendSuccess(res, 'Extra hours added', { entry }, 201);
  } catch (e) {
    return sendServerError(res, 'Failed to add extra hours', e.message);
  }
};

const addTaskHours = async (req, res) => {
  try {
    const today = new Date();
    const payload = {
      userId: req.user.id,
      date: req.body.date || new Date(today.getFullYear(), today.getMonth(), today.getDate()),
      teamId: req.body.teamId,
      startTime: req.body.startTime,
      endTime: req.body.endTime,
      description: req.body.description || '',
      hours: req.body.hours,
    };
    const entry = await extraHoursService.addExtraHours(payload);
    return sendSuccess(res, 'Task hours added', { entry }, 201);
  } catch (e) {
    return sendServerError(res, 'Failed to add task hours', e.message);
  }
};

const updateExtraHours = async (req, res) => {
  try {
    const entry = await extraHoursService.updateExtraHours(req.params.id, req.body);
    if (!entry) return sendNotFound(res, 'Extra hours entry not found');
    return sendSuccess(res, 'Extra hours updated', { entry });
  } catch (e) {
    return sendServerError(res, 'Failed to update extra hours', e.message);
  }
};

const getTaskHours = async (req, res) => {
  try {
    const { start, end, userId } = req.query;
    console.log(start, end)
    if (!userId) return sendError(res, 'User ID is required', null, 400);
    if (!start || !end) {
      return sendError(res, 'Start and end dates are required', null, 400);
    }
    if (start && isNaN(Date.parse(start))) return sendError(res, 'Invalid start date format. Use YYYY-MM-DD', null, 400);
    if (end && isNaN(Date.parse(end))) return sendError(res, 'Invalid end date format. Use YYYY-MM-DD', null, 400);
    const result = await extraHoursService.getTaskHours(req.user, { start, end, userId });
    return sendSuccess(res, 'Task hours fetched', result);
  } catch (e) {
    return sendServerError(res, 'Failed to fetch task hours', e.message);
  }
};

const getTeamWiseWorkHours = async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return sendError(res, 'Start and end dates are required', null, 400);
    }
    if (start && isNaN(Date.parse(start))) return sendError(res, 'Invalid start date format. Use YYYY-MM-DD', null, 400);
    if (end && isNaN(Date.parse(end))) return sendError(res, 'Invalid end date format. Use YYYY-MM-DD', null, 400);
    const result = await extraHoursService.getTeamWiseWorkHours(req.user, { start, end });
    return sendSuccess(res, 'Team-wise work hours fetched', result);
  } catch (e) {
    return sendServerError(res, 'Failed to fetch team-wise work hours', e.message);
  }
};

const updateApprovalStatus = async (req, res) => {
  try {
    const result = await extraHoursService.updateApprovalStatus(req.user, { ...req.body, entryId: req.params.id });
    if (result.error) {
      if (result.code === 400) return sendError(res, result.error, null, 400);
      if (result.code === 403) return sendForbidden(res, result.error);
      if (result.code === 404) return sendNotFound(res, result.error);
      return sendServerError(res, result.error);
    }
    return sendSuccess(res, 'Approval status updated', { entry: result.entry });
  } catch (e) {
    return sendServerError(res, 'Failed to update approval status', e.message);
  }
}


const deleteExtraHours = async (req, res) => {
  try {
    const entry = await extraHoursService.deleteExtraHours(req.params.id);
    if (!entry) return sendNotFound(res, 'Extra hours entry not found');
    return sendSuccess(res, 'Extra hours deleted', { entry });
  } catch (e) {
    return sendServerError(res, 'Failed to delete extra hours', e.message);
  }
}

const checkAvailability = async (req, res) => {
  try {
    const { personIds } = req.body;
    if (!Array.isArray(personIds) || personIds.length === 0) {
      return sendError(res, 'personIds must be a non-empty array', null, 400);
    }
    const result = await extraHoursService.checkAvailability(personIds);
    return sendSuccess(res, 'Availability checked', result);
  } catch (e) {
    return sendServerError(res, 'Failed to check availability', e.message);
  }
}

const importFromExcel = async (req, res) => {
  try {
    const { entries } = req.body;
    if (!Array.isArray(entries) || entries.length === 0) {
      return sendError(res, 'entries must be a non-empty array', null, 400);
    }
    const result = await extraHoursService.importFromExcel(entries);
    return sendSuccess(res, 'Excel import processed', result);
  } catch (e) {
    return sendServerError(res, 'Failed to import excel entries', e.message);
  }
}



module.exports = {
  addExtraHours,
  addTaskHours,
  updateExtraHours,
  getTaskHours,
  updateApprovalStatus,
  deleteExtraHours,
  getTeamWiseWorkHours,
  checkAvailability,
  importFromExcel

};