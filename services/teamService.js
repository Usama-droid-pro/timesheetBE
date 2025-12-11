const Team = require('../models/Team');
const mongoose = require('mongoose');

const isObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const createTeam = async (payload) => {
  const { name, leadId, members = [] } = payload;
  const team = await Team.create({ name, leadId, members });
  return team;
};

const updateTeam = async (paramId, payload) => {
  const query = isObjectId(paramId) ? { _id: paramId } : { id: Number(paramId) };
  const update = {};
  if (payload.name !== undefined) update.name = payload.name;
  if (payload.leadId !== undefined) update.leadId = payload.leadId;
  if (payload.members !== undefined) update.members = payload.members;
  if (payload.members?.length === 0) {
    update.leadId = null;
  }
  const team = await Team.findOneAndUpdate(query, update, { new: true });
  return team;
};

const getTeamsForUser = async (user) => {
  const userId = String(user.id);
  const isAdmin = user.role === "Admin" || user.isAdmin === true;

  // --- ADMIN: return all teams with full members ---
  if (isAdmin) {
    return Team.find({}).populate("members");
  }

  // --- TEAM LEAD: return full data for teams they lead ---
  const leadTeams = await Team.find({ leadId: userId }).populate("members");
  if (leadTeams.length > 0) {
    return leadTeams;
  }
  const teams = await Team.find({
    members: { $in: [userId] },
  }).populate("members");

  const sanitized = teams.map((team) => {
    const onlyUser = team.members.filter(
      (m) => String(m._id) === userId
    );

    return {
      ...team.toObject(),
      members: onlyUser,
    };
  });

  return sanitized;
};


const getTeamByIdForUser = async (user, paramId) => {
  const query = isObjectId(paramId) ? { _id: paramId } : { id: Number(paramId) };
  const team = await Team.findOne(query).populate('members');
  if (!team) return null;
  const isAdmin = user.role === 'Admin' || user.isAdmin === true;
  if (isAdmin) return team;
  if (String(team.leadId) === String(user.id)) return team;
  const isMember = team.members.some((m) => String(m._id) === String(user.id));
  return isMember ? team : null;
};

module.exports = {
  createTeam,
  updateTeam,
  getTeamsForUser,
  getTeamByIdForUser,
  getMyTeamsForUser: async (user) => {
    return Team.find({ members: { $in: [user.id] } }).populate('members');
  },
};