const ExtraHours = require('../models/ExtraHours');
const Team = require('../models/Team');
const User = require('../models/User');

const addExtraHours = async (payload) => {
  try {
    const entry = await ExtraHours.create(payload);
    return entry;
  } catch (error) {
    console.log(error)
    throw error;
  }
};

const updateExtraHours = async (id, payload) => {
  const entry = await ExtraHours.findByIdAndUpdate(id, payload, { new: true });
  return entry;
};

const getTaskHours = async (user, { start, end, userId }) => {
  const isAdmin = user.role === 'Admin' || user.isAdmin === true;
  let allowedUserIds = [];
  if (isAdmin) {
    allowedUserIds = [];
  } else {
    const leadTeams = await Team.find({ leadId: String(user.id) });
    if (leadTeams.length > 0) {
      const memberIds = new Set();
      for (const t of leadTeams) {
        for (const m of t.members) memberIds.add(String(m));
      }
      allowedUserIds = Array.from(memberIds);
      allowedUserIds.push(String(user.id));
    } else {
      allowedUserIds = [String(user.id)];
    }
  }

  const dateFilter = {};
  if (start) dateFilter.$gte = new Date(start);
  if (end) dateFilter.$lte = new Date(end);

  const query = {};
  if (Object.keys(dateFilter).length) query.date = dateFilter;
  if (userId) query.userId = userId;
  if (!isAdmin && !userId) query.userId = { $in: allowedUserIds };
  if (!isAdmin && userId) {
    if (!allowedUserIds.includes(String(userId))) return { entries: [], totalHours: 0 };
  }

  const entries = await ExtraHours.find(query).lean();
  const totalHours = entries.reduce((sum, e) => sum + (e.hours || 0), 0);
  return { entries, totalHours };
};

const getTeamWiseWorkHours = async (user, { start, end }) => {
  try {
    const isAdmin = user.role === 'Admin' || user.isAdmin === true;
    let allowedTeamIds = [];
    if (isAdmin) {
      const allTeams = await Team.find({}).lean();
      allowedTeamIds = allTeams.map(t => String(t._id));
    } else {
      const leadTeams = await Team.find({ leadId: String(user.id) }).lean();
      allowedTeamIds = leadTeams.map(t => String(t._id));
    }

    if (!isAdmin && allowedTeamIds.length === 0) {
      return [];
    }

    const dateFilter = {};
    if (start) dateFilter.$gte = new Date(start);
    if (end) dateFilter.$lte = new Date(end);

    const query = {};
    if (Object.keys(dateFilter).length) query.date = dateFilter;
    if (!isAdmin) query.teamId = { $in: allowedTeamIds };

    const entries = await ExtraHours.find(query).lean();

    const teamIds = Array.from(new Set(entries.map(e => String(e.teamId))));
    const userIds = Array.from(new Set(entries.map(e => String(e.userId))));

    const [teamsMeta, usersMeta] = await Promise.all([
      Team.find({ _id: { $in: teamIds } }).lean(),
      User.find({ _id: { $in: userIds } }).lean()
    ]);

    const teamMap = new Map(teamsMeta.map(t => [String(t._id), { name: t.name, leadId: String(t.leadId) }]));
    const userMap = new Map(usersMeta.map(u => [String(u._id), { name: u.name || '', email: u.email || '' }]));

    const byTeam = new Map();
    for (const e of entries) {
      const tId = String(e.teamId);
      const uId = String(e.userId);
      const hrs = Number(e.hours) || 0;
      if (!byTeam.has(tId)) {
        byTeam.set(tId, { teamId: tId, team: teamMap.get(tId) || { name: '', leadId: '' }, totalHours: 0, members: new Map() });
      }
      const bucket = byTeam.get(tId);
      bucket.totalHours += hrs;
      bucket.members.set(uId, (bucket.members.get(uId) || 0) + hrs);
    }

    const result = Array.from(byTeam.values()).map(t => {
      const members = Array.from(t.members.entries()).map(([uId, hrs]) => ({
        user: userMap.get(uId) || undefined,
        userId: uId,
        hours: Number(hrs) || 0,
      }));
      return {
        teamId: t.teamId,
        team: t.team,
        totalHours: Number(t.totalHours) || 0,
        members,
      };
    });

    return result;
  } catch (err) {
    console.log(err)
    throw err;
  }

}

const updateApprovalStatus = async (user, { entryId, status, note }) => {
  const entry = await ExtraHours.findById(entryId);
  if (!entry) return { error: 'Entry not found', code: 404 };

  const team = await Team.findById(entry?.teamId)
  const isTeamLead = team?.leadId === String(user.id)
  const isAdmin = user.role === 'Admin' || user.isAdmin === true;
  if (!isTeamLead && !isAdmin) return { error: 'Team lead or Admin access required', code: 403 };
  entry.approvalStatus = status;
  entry.note = note;
  await entry.save();
  return { entry };
}

const deleteExtraHours = async (id) => {
  try {
    const entry = await ExtraHours.findByIdAndDelete(id);
    return entry;
  } catch (error) {
    return { error: 'Error deleting entry', code: 500 };
  }
}

module.exports = {
  addExtraHours,
  updateExtraHours,
  getTaskHours,
  getTeamWiseWorkHours,
  updateApprovalStatus,
  deleteExtraHours


};