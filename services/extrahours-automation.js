const axios = require('axios');
const dayjs = require('dayjs');
const customParseFormat = require('dayjs/plugin/customParseFormat');
const User = require('../models/User');
const Team = require('../models/Team');
const ExtraHours = require('../models/ExtraHours');
const moment = require('moment')

async function getDigestClient() {
    const { default: DigestClient } = await import('digest-fetch');
    return DigestClient;
}

dayjs.extend(customParseFormat);



const CONFIG = {
    BIOMETRIC_API: {
        BASE_URL: process.env.BIOMETRIC_API_URL || 'http://192.168.100.202/ISAPI/AccessControl/AcsEvent',
        FORMAT: 'json',
        TIMEOUT: parseInt(process.env.BIOMETRIC_API_TIMEOUT) || 30000,
        USERNAME: process.env.BIOMETRIC_API_USERNAME || '',
        PASSWORD: process.env.BIOMETRIC_API_PASSWORD || '',
    },

    // Office Hours Configuration
    OFFICE_HOURS: {
        END_HOUR: parseInt(process.env.OFFICE_END_HOUR) || 19,        // 7:00 PM
        END_MINUTE: parseInt(process.env.OFFICE_END_MINUTE) || 0,
        THRESHOLD_MINUTES: parseInt(process.env.EXTRA_HOURS_THRESHOLD) || 30, // Extra hours start after 7:30 PM
    },

    // Fetch Configuration
    FETCH: {
        MAX_RESULTS: 1000,
        TIME_ZONE: process.env.TIMEZONE_OFFSET || '+05:00',  // Pakistan Standard Time (change if different)
    },

    // Cron Job Configuration
    CRON: {
        SCHEDULE: process.env.CRON_SCHEDULE || '*/10 * * * *', // Every 10 minutes
        AUTO_START: process.env.AUTO_START_CRON === 'true' || true
    }
};


class AutomationState {
    constructor() {
        this.lastFetchTime = null;
        this.isRunning = false;
        this.lastError = null;
        this.stats = {
            totalProcessed: 0,
            totalSaved: 0,
            totalSkipped: 0,
            lastRunTime: null,
        };
    }

    setRunning(status) {
        this.isRunning = status;
    }

    updateLastFetchTime(time) {
        this.lastFetchTime = time;
    }

    updateStats(processed, saved, skipped) {
        this.stats.totalProcessed += processed;
        this.stats.totalSaved += saved;
        this.stats.totalSkipped += skipped;
        this.stats.lastRunTime = new Date();
    }

    getState() {
        return {
            isRunning: this.isRunning,
            lastFetchTime: this.lastFetchTime,
            lastError: this.lastError,
            stats: this.stats,
        };
    }
}

const automationState = new AutomationState();

function hoursToHM(decimal) {
    const hours = Math.floor(decimal);
    const minutes = Math.round((decimal - hours) * 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function toUTCDateFromYMD(ymd) {
    const [y, m, d] = String(ymd).split('-').map(v => Number(v));
    if (!y || !m || !d) return new Date(ymd);
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
}

function formatTimeForAPI(date) {
    const d = new Date(date);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');

    const tz = CONFIG.FETCH.TIME_ZONE || '+00:00';
    return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}${tz}`;
}

function parseOffsetToMinutes(offsetStr) {
    const m = /^([+-])(\d{2}):(\d{2})$/.exec(String(offsetStr || ''));
    if (!m) return null;
    const sign = m[1] === '-' ? -1 : 1;
    return sign * (Number(m[2]) * 60 + Number(m[3]));
}

function parseTime(timeString) {
    if (!timeString) return null;
    // Extract only the date and time parts (YYYY-MM-DDTHH:mm:ss), ignoring offsets or Z
    const isoPart = timeString.substring(0, 19);
    const m = moment(isoPart);
    return m.isValid() ? m : null;
}

/**
 * Creates a naive moment object (ignores timezone) for a specific date/time string.
 * This ensures "wall-clock" logic: 19:30 is always 19:30 regardless of server TZ.
 */
function createNaiveMoment(dateStr, format = 'YYYY-MM-DD HH:mm:ss') {
    return moment(dateStr, format);
}
async function getLastFetchTime() {
    try {
        // Try to get the most recent extra hours entry
        const lastEntry = await ExtraHours.findOne()
            .sort({ createdAt: -1 })
            .limit(1);

        if (lastEntry && lastEntry.createdAt) {
            return lastEntry.createdAt;
        }

        // If no entries, fetch data from yesterday
        return dayjs().subtract(1, 'day').startOf('day').toDate();
    } catch (error) {
        console.error('Error getting last fetch time:', error);
        // Default to yesterday if error occurs
        return dayjs().subtract(1, 'day').startOf('day').toDate();
    }
}

async function fetchBiometricEvents(startTime, endTime, searchResultPosition = 0) {
    console.log(startTime, endTime)
    try {
        const requestBody = {
            AcsEventCond: {
                searchID: `${Date.now()}`,
                searchResultPosition,
                maxResults: CONFIG.FETCH.MAX_RESULTS,
                major: 0,
                minor: 0,
                startTime: formatTimeForAPI(startTime),
                endTime: formatTimeForAPI(endTime),
                timeReverseOrder: true,
            }
        };


        console.log(`[API] Fetching events from ${startTime} to ${endTime} (position: ${searchResultPosition})`);

        const url = `${CONFIG.BIOMETRIC_API.BASE_URL}?format=${CONFIG.BIOMETRIC_API.FORMAT}`;

        // Check if Digest Authentication credentials are provided
        if (CONFIG.BIOMETRIC_API.USERNAME && CONFIG.BIOMETRIC_API.PASSWORD) {
            console.log(`[API] Using Digest Authentication for user: ${CONFIG.BIOMETRIC_API.USERNAME}`);

            const DigestClient = await getDigestClient();

            const client = new DigestClient(
                CONFIG.BIOMETRIC_API.USERNAME,
                CONFIG.BIOMETRIC_API.PASSWORD
            );

            const response = await client.fetch(url, {
                method: 'POST',
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`ISAPI HTTP ${response.status}: ${text}`);
            }

            const data = await response.json();
            return data;


        } else {
            // No authentication - use regular axios
            console.log('[API] No authentication credentials provided');

            const response = await axios.post(url, requestBody, {
                timeout: CONFIG.BIOMETRIC_API.TIMEOUT,
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            return response.data;
        }

    } catch (error) {
        console.error('[API] Error fetching biometric events:', error.message);
        if (error.response) {
            console.error('[API] Response status:', error.response.status);
            console.error('[API] Response data:', error.response.data);
        }
        throw error;
    }
}

async function fetchAllBiometricEvents(startTime, endTime) {
    const allEvents = [];
    let position = 0;
    let hasMore = true;

    while (hasMore) {
        const data = await fetchBiometricEvents(startTime, endTime, position);

        if (data.AcsEvent && data.AcsEvent.InfoList) {
            allEvents.push(...data.AcsEvent.InfoList);

            // Check if there are more results
            hasMore = data.AcsEvent.responseStatusStrg === 'MORE';
            position += data.AcsEvent.InfoList.length;

            console.log(`[API] Fetched ${data.AcsEvent.InfoList.length} events (Total: ${allEvents.length})`);
        } else {
            hasMore = false;
        }
    }

    return allEvents;
}


function groupEventsByEmployeeAndWorkDate(events) {
    const groups = {};

    for (const event of events) {
        const employeeId = event.employeeNoString;
        const time = parseTime(event.time);

        if (!employeeId || !time) continue;

        // Determine logical Work Date: if between 00:00 and 05:59, it belongs to the previous day
        const workDate = time.hour() < 6 
            ? time.clone().subtract(1, 'day').format('YYYY-MM-DD')
            : time.format('YYYY-MM-DD');

        const key = `${employeeId}__${workDate}`;

        if (!groups[key]) {
            groups[key] = {
                employeeId,
                workDate,
                times: [],
            };
        }

        groups[key].times.push(time);
    }

    // Sort times for each group
    Object.values(groups).forEach(group => {
        group.times.sort((a, b) => a.valueOf() - b.valueOf());
    });

    return groups;
}

function calculateExtraHoursEntries(group) {
    const { times, workDate } = group;
    if (!times || times.length < 2) return [];

    const checkIn = times[0];
    const checkOut = times[times.length - 1];

    // Office End Time (7:00 PM) as naive wall-clock time
    const officeEnd = createNaiveMoment(`${workDate} 19:00:00`);

    // Threshold for eligibility (7:30 PM) as naive wall-clock time
    const threshold = createNaiveMoment(`${workDate} 19:30:00`);

    // Strictly compare wall-clock times
    if (checkOut.isBefore(threshold)) return [];

    const entries = [];

    // Overnight check: if physical checkout date is strictly after workDate
    const isOvernight = checkOut.format('YYYY-MM-DD') !== workDate;

    if (!isOvernight) {
        // Case: Checkout same day after 7:30 PM
        const diffMinutes = Math.max(0, checkOut.diff(officeEnd, 'minute'));
        const extraHours = diffMinutes / 60;

        entries.push({
            date: workDate,
            startTime: '19:00',
            endTime: checkOut.format('HH:mm'),
            hours: Number(extraHours.toFixed(2)),
        });
    } else {
        // Case: Checkout next day (before 6 AM)
        // Entry 1: Day 1 (7:00 PM to 11:59 PM)
        const day1End = createNaiveMoment(`${workDate} 23:59:00`);
        const diffMinutesDay1 = Math.max(0, day1End.diff(officeEnd, 'minute'));
        const extraHoursDay1 = diffMinutesDay1 / 60;

        entries.push({
            date: workDate,
            startTime: '19:00',
            endTime: '23:59',
            hours: Number(extraHoursDay1.toFixed(2)),
        });

        // Entry 2: Day 2 (12:00 AM to checkout)
        const day2Date = checkOut.format('YYYY-MM-DD');
        const day2Start = createNaiveMoment(`${day2Date} 00:00:00`);
        const diffMinutesDay2 = Math.max(0, checkOut.diff(day2Start, 'minute'));
        const extraHoursDay2 = diffMinutesDay2 / 60;

        if (extraHoursDay2 > 0) {
            entries.push({
                date: day2Date,
                startTime: '00:00',
                endTime: checkOut.format('HH:mm'),
                hours: Number(extraHoursDay2.toFixed(2)),
            });
        }
    }

    return entries;
}

function processGroupedEvents(groups) {
    const results = [];
    for (const group of Object.values(groups)) {
        const calculationEntries = calculateExtraHoursEntries(group);

        for (const entry of calculationEntries) {
            results.push({
                employeeId: group.employeeId,
                ...entry
            });
        }
    }
    return results;
}

async function findUserByBiometricId(biometricId) {
    try {
        const user = await User.findOne({
            bioMetricId: biometricId,
            isDeleted: false,
            active: true
        });
        return user;
    } catch (error) {
        console.error(`[DB] Error finding user with biometric ID ${biometricId}:`, error);
        return null;
    }
}


async function findTeamForUser(userId) {
    try {
        const team = await Team.findOne({ members: userId });
        return team;
    } catch (error) {
        console.error(`[DB] Error finding team for user ${userId}:`, error);
        return null;
    }
}

async function extraHoursExists(userId, date, startTime, endTime) {
    try {
        const exists = await ExtraHours.findOne({
            userId,
            date: toUTCDateFromYMD(date),
            startTime,
            endTime
        });
        return !!exists;
    } catch (error) {
        console.error('[DB] Error checking extra hours existence:', error);
        return false;
    }
}

async function saveExtraHours(extraHoursData) {
    const { employeeId, date, startTime, endTime, hours } = extraHoursData;

    try {
        // Find user by biometric ID
        const user = await findUserByBiometricId(employeeId);
        if (!user) {
            console.log(`[DB] User not found for biometric ID: ${employeeId}`);
            return { success: false, reason: 'user_not_found' };
        }

        // Check if entry already exists (check with time range too since multiple entries/day are allowed)
        const exists = await extraHoursExists(user._id, date, startTime, endTime);
        if (exists) {
            console.log(`[DB] Extra hours already exist for user ${user.name} on ${date} (${startTime}-${endTime})`);
            return { success: false, reason: 'already_exists' };
        }

        // Find team
        const team = await findTeamForUser(user._id);
        if (!team) {
            console.log(`[DB] Team not found for user: ${user.name}`);
            return { success: false, reason: 'team_not_found' };
        }

        // Create extra hours entry
        const extraHours = new ExtraHours({
            userId: user._id,
            teamId: team._id,
            date: toUTCDateFromYMD(date),
            startTime,
            endTime,
            hours,
        });

        await extraHours.save();
        console.log(`[DB] ✓ Saved extra hours for ${user.name} on ${date}: ${hours} hours`);

        return { success: true };
    } catch (error) {
        console.error('[DB] Error saving extra hours:', error);
        return { success: false, reason: 'save_error', error };
    }
}

async function processExtraHours(customStartTime = null, customEndTime = null) {
    if (automationState.isRunning) {
        console.log('[AUTOMATION] Process already running, skipping...');
        return {
            success: false,
            message: 'Process already running',
        };
    }
    automationState.setRunning(true);
    const startTime = Date.now();
    try {
        console.log('\n===================================s=====');
        console.log('[AUTOMATION] Starting Extra Hours Processing');
        console.log('========================================\n');

        const endTime = customEndTime || new Date();
        const fetchStartTime = customStartTime || dayjs().subtract(4, 'days').startOf('day').toDate();

        console.log(`[AUTOMATION] Time Range: ${dayjs(fetchStartTime).format('YYYY-MM-DD HH:mm')} to ${dayjs(endTime).format('YYYY-MM-DD HH:mm')}`);

        // Fetch biometric events
        console.log('[AUTOMATION] Step 1: Fetching biometric events...');
        const events = await fetchAllBiometricEvents(fetchStartTime, endTime);
        console.log(`[AUTOMATION] ✓ Fetched ${events.length} events\n`);

        if (events.length === 0) {
            console.log('[AUTOMATION] No new events to process');
            automationState.setRunning(false);
            return {
                success: true,
                message: 'No new events to process',
                stats: { processed: 0, saved: 0, skipped: 0 },
            };
        }

        console.log('[AUTOMATION] Step 2: Grouping events into work-days...');

        const groupedEvents = groupEventsByEmployeeAndWorkDate(events);
        console.log(`[AUTOMATION] ✓ Grouped into ${Object.keys(groupedEvents).length} work-day assignments\n`);
        // Calculate extra hours
        console.log('[AUTOMATION] Step 3: Calculating extra hours...');
        const extraHoursData = processGroupedEvents(groupedEvents);


        console.log(`[AUTOMATION] ✓ Found ${extraHoursData.length} entries with extra hours\n`);

        // Save to database in parallel for better performance
        console.log('[AUTOMATION] Step 4: Saving to database (parallel)...');
        let saved = 0;
        let skipped = 0;

        const results = await Promise.all(extraHoursData.map(data => saveExtraHours(data)));
        
        results.forEach(result => {
            if (result.success) {
                saved++;
            } else {
                skipped++;
            }
        });

        console.log(`[AUTOMATION] ✓ Saved: ${saved}, Skipped: ${skipped}\n`);

        automationState.updateLastFetchTime(endTime);
        automationState.updateStats(events.length, saved, skipped);

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log('========================================');
        console.log(`[AUTOMATION] ✓ Process completed in ${duration}s`);
        console.log('========================================\n');

        automationState.setRunning(false);

        return {
            success: true,
            message: 'Extra hours processed successfully',
            stats: {
                processed: events.length,
                saved,
                skipped,
                duration: `${duration}s`,
            },
        };

    } catch (error) {
        console.error('[AUTOMATION] ✗ Error during processing:', error);
        automationState.lastError = error.message;
        automationState.setRunning(false);

        return {
            success: false,
            message: 'Error processing extra hours',
            error: error.message,
        };
    }
}

// ===================================================================
// CRON JOB SETUP
// ===================================================================

const cron = require('node-cron');

let cronJob = null;
function startCronJob() {
    if (cronJob) {
        console.log('[CRON] Job already running');
        return;
    }

    cronJob = cron.schedule(CONFIG.CRON.SCHEDULE, async () => {
        console.log(`[CRON] Triggered at ${new Date().toISOString()}`);
        await processExtraHours();
    });

    console.log(`[CRON] Started with schedule: ${CONFIG.CRON.SCHEDULE}`);
}
function stopCronJob() {
    if (cronJob) {
        cronJob.stop();
        cronJob = null;
        console.log('[CRON] Stopped');
    }
}
function getAutomationState() {
    return automationState.getState();
}

module.exports = {
    processExtraHours,
    startCronJob,
    stopCronJob,

    getAutomationState,

    // Configuration (for customization)
    CONFIG,
};