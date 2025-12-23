const { sendSuccess, sendError, sendNotFound, sendServerError } = require('../utils/responseHandler');
const teamService = require('../services/teamService');

const createTeam = async (req, res) => {
  try {
    const team = await teamService.createTeam(req.body);
    return sendSuccess(res, 'Team created', { team }, 201);
  } catch (e) {
    console.log(e)
    return sendServerError(res, 'Failed to create team', e.message);
  }
};

const updateTeam = async (req, res) => {
  try {
    const team = await teamService.updateTeam(req.params.id, req.body);
    if (!team) return sendNotFound(res, 'Team not found');
    return sendSuccess(res, 'Team updated', { team });
  } catch (e) {
    return sendServerError(res, 'Failed to update team', e.message);
  }
};

const getAllTeams = async (req, res) => {
  try {
    const teams = await teamService.getTeamsForUser(req.user);
    return sendSuccess(res, 'Teams fetched', { teams });
  } catch (e) {
    return sendServerError(res, 'Failed to fetch teams', e.message);
  }
};

const getTeamById = async (req, res) => {
  try {
    const team = await teamService.getTeamByIdForUser(req.user, req.params.id);
    if (!team) return sendNotFound(res, 'Team not found or access denied');
    return sendSuccess(res, 'Team fetched', { team });
  } catch (e) {
    return sendServerError(res, 'Failed to fetch team', e.message);
  }
};

const getMyTeams = async (req, res) => {
  try {
    const teams = await teamService.getMyTeamsForUser(req.user);
    return sendSuccess(res, 'My teams fetched', { teams });
  } catch (e) {
    return sendServerError(res, 'Failed to fetch my teams', e.message);
  }
};

module.exports = {
  createTeam,
  updateTeam,
  getAllTeams,
  getTeamById,
  getMyTeams,
};