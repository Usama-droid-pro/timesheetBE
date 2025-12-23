const ExtraHours = require('../models/ExtraHours');
const Team = require('../models/Team');
const User = require('../models/User');

const removeSpecialCharaceters = (str) => {
  return str.replace(/[^\w\s]/gi, '');
}
const toUTCDateFromYMD = (ymd) => {
  const [y, m, d] = String(ymd).split('-').map(v => Number(v));
  if (!y || !m || !d) return new Date(ymd);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
}
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

const checkAvailability = async (personIdsRaw) => {
  const personIds = Array.from(new Set((personIdsRaw || []).map(v => removeSpecialCharaceters(String(v || '').trim())).filter(Boolean)));
  console.log(personIds)
  if (personIds.length === 0) return { unknown: [] };
  const users = await User.find({ bioMetricId: { $in: personIds } }).lean();

  console.log(users)
  const known = new Set((users || []).map(u => removeSpecialCharaceters(String(u.bioMetricId || '').trim())));
  const unknown = personIds
    .filter(pid => !known.has(pid))
    .map(pid => ({ personId: pid }));
  return { unknown };
}

const importFromExcel = async (entriesRaw) => {
  const entries = Array.isArray(entriesRaw) ? entriesRaw : [];
  if (entries.length === 0) return { inserted: 0, updated: 0, failed: [] };
  const personIds = Array.from(new Set(entries.map(e => removeSpecialCharaceters(String(e.personId || '').trim())).filter(Boolean)));
  const users = await User.find({ bioMetricId: { $in: personIds } }).lean();
  const personToUser = new Map(users.map(u => [String(u.bioMetricId || '').trim(), u]));
  const userIds = Array.from(new Set(users.map(u => String(u._id))));
  const teams = await Team.find({ members: { $in: userIds } }).lean();
  const teamForUser = new Map();
  for (const t of teams) {
    for (const m of (t.members || [])) {
      const id = String(m);
      if (!teamForUser.has(id)) teamForUser.set(id, String(t._id));
    }
  }

  const ops = [];
  const failed = [];
  for (const e of entries) {
    const pid = removeSpecialCharaceters(String(e.personId || '').trim());
    const u = personToUser.get(pid);
    if (!u) {
      failed.push({ personId: pid, date: String(e.date || ''), reason: 'User not found' });
      continue;
    }
    const uId = String(u._id);
    const tId = teamForUser.get(uId);
    if (!tId) {
      failed.push({ personId: pid, date: String(e.date || ''), reason: 'Team not found' });
      continue;
    }
    const hrs = Number(e.extraHours || 0) || 0;
    const start = String(e.checkIn || '');
    const end = String(e.checkOut || '');
    const dt = e.date ? toUTCDateFromYMD(e.date) : new Date();
    ops.push({
      updateOne: {
        filter: { userId: uId, date: dt },
        update: { $set: { userId: uId, teamId: tId, date: dt, startTime: start, endTime: end, description: '', hours: hrs, approvalStatus: "Pending" } },
        upsert: true,
      }
    });
  }

  let inserted = 0;
  let updated = 0;
  if (ops.length > 0) {
    const result = await ExtraHours.bulkWrite(ops, { ordered: false });
    inserted = result.upsertedCount || (result.upsertedIds ? Object.keys(result.upsertedIds).length : 0);
    updated = result.modifiedCount || 0;
  }

  return { inserted, updated, failed };
}

module.exports = {
  addExtraHours,
  updateExtraHours,
  getTaskHours,
  getTeamWiseWorkHours,
  updateApprovalStatus,
  deleteExtraHours,
  checkAvailability,
  importFromExcel


};