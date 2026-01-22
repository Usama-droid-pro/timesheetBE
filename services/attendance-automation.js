const axios = require('axios');
const moment = require('moment');
const cron = require('node-cron');
const User = require('../models/User');
const Team = require('../models/Team');
const AttendanceSystem = require('../models/AttendanceSystem');
const { getActiveSettings, createSettingsSnapshot, updateLastFetchedDate } = require('./systemSettingsService');
const { getCurrentMonthCounter, incrementBufferCounter } = require('./bufferCounterService');
const { isHoliday, calculateHolidayBonus } = require('./holidayService');

async function getDigestClient() {
    const { default: DigestClient } = await import('digest-fetch');
    return DigestClient;
}

const CONFIG = {
    BIOMETRIC_API: {
        BASE_URL: process.env.BIOMETRIC_API_URL || 'http://192.168.100.202/ISAPI/AccessControl/AcsEvent',
        FORMAT: 'json',
        TIMEOUT: parseInt(process.env.BIOMETRIC_API_TIMEOUT) || 30000,
        USERNAME: process.env.BIOMETRIC_API_USERNAME || '',
        PASSWORD: process.env.BIOMETRIC_API_PASSWORD || '',
    },
    FETCH: {
        MAX_RESULTS: 1000,
        TIME_ZONE: process.env.TIMEZONE_OFFSET || '+05:00',
    },
    CRON: {
        SCHEDULE: process.env.CRON_SCHEDULE || '*/10 * * * *',
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

function parseTime(timeString) {
    if (!timeString) return null;
    const isoPart = timeString.substring(0, 19);
    const m = moment(isoPart);
    return m.isValid() ? m : null;
}

function createNaiveMoment(dateStr, format = 'YYYY-MM-DD HH:mm:ss') {
    return moment(dateStr, format);
}

/**
 * Check if a date is a weekend (Saturday or Sunday)
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {boolean} - True if weekend, false otherwise
 */
function isWeekend(dateStr) {
    const date = new Date(dateStr);
    const day = date.getDay();
    return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}

async function fetchBiometricEvents(startTime, endTime, searchResultPosition = 0) {
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

        const url = `${CONFIG.BIOMETRIC_API.BASE_URL}?format=${CONFIG.BIOMETRIC_API.FORMAT}`;

        if (CONFIG.BIOMETRIC_API.USERNAME && CONFIG.BIOMETRIC_API.PASSWORD) {
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

            return await response.json();
        } else {
            const response = await axios.post(url, requestBody, {
                timeout: CONFIG.BIOMETRIC_API.TIMEOUT,
                headers: { 'Content-Type': 'application/json' }
            });
            return response.data;
        }
    } catch (error) {
        console.error('[API] Error fetching biometric events:', error.message);
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
            hasMore = data.AcsEvent.responseStatusStrg === 'MORE';
            position += data.AcsEvent.InfoList.length;
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

        // Work date determination: before 6am = previous day
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

/**
 * NEW: Calculate attendance records with comprehensive rules
 */
async function calculateAttendanceRecords(group) {
    const { times, workDate, employeeId } = group;
    if (!times || times.length < 2) return [];

    const checkIn = times[0];
    const checkOut = times[times.length - 1];

    try {
        // Get user by biometric ID
        const user = await User.findOne({
            bioMetricId: employeeId,
            isDeleted: false,
            active: true
        });

        if (!user) {
            console.log(`[CALC] User not found for biometric ID: ${employeeId}`);
            return [];
        }

        // Get team
        const team = await Team.findOne({ members: user._id });
        if (!team) {
            console.log(`[CALC] Team not found for user: ${user.name}`);
            return [];
        }

        // Get system settings
        const settings = await getActiveSettings();

        // Get user's office hours (or defaults)
        const officeStart = user.officeStartTime || settings.defaultOfficeStartTime;
        const officeEnd = user.officeEndTime || settings.defaultOfficeEndTime;

        // Get buffer counter for the work date's month (not current month)
        const bufferCounter = await getCurrentMonthCounter(user._id, workDate);

        // **CHECK IF THIS IS A WEEKEND**
        const isWeekendWork = isWeekend(workDate);
        
        if (isWeekendWork) {
            console.log(`[WEEKEND] Detected weekend work on ${workDate} for ${user.name}. Bypassing all rules, applying 2x multiplier.`);
        }

        // Parse office hours for this work date
        const start = createNaiveMoment(`${workDate} ${officeStart}:00`);
        const end = createNaiveMoment(`${workDate} ${officeEnd}:00`);

        // Calculate time boundaries
        const safeZoneEnd = start.clone().add(settings.safeZoneMinutes, 'minutes');
        const bufferAbused = bufferCounter.bufferAbusedReached;
        const effectiveBufferEnd = bufferAbused
            ? start.clone().add(settings.reducedBufferMinutes, 'minutes')
            : start.clone().add(settings.bufferTimeMinutes, 'minutes');

        //  Initialize calculation variables
        let deductionMinutes = 0;
        let extraHoursMinutes = 0;
        let totalWorkMinutes = 0;
        const ruleApplied = {
            isLate: false,
            hasDeduction: false,
            hasExtraHours: false,
            isBufferUsed: false,
            isBufferAbused: bufferAbused,
            isSafeZone: false,
            isEarlyCheckout: false
        };
        let incrementBuffer = false;

        // === WEEKEND LOGIC: Bypass all rules ===
        if (isWeekendWork) {
            // For weekends: No rules, all time is extra hours
            totalWorkMinutes = checkOut.diff(checkIn, 'minutes');
            extraHoursMinutes = totalWorkMinutes;
            deductionMinutes = 0;
            incrementBuffer = false;
            ruleApplied.hasExtraHours = extraHoursMinutes > 0;
            // No late, no buffer, no deductions on weekends
        } else {
            // === WEEKDAY RULES (Original Logic) ===
            
            // === RULE 1: Determine lateness and deduction ===
            if (checkIn.isAfter(effectiveBufferEnd)) {
                // LATE ARRIVAL (after buffer time)
                ruleApplied.isLate = true;
                ruleApplied.hasDeduction = true;
                deductionMinutes = checkIn.diff(start, 'minutes');
            } else if (checkIn.isAfter(safeZoneEnd)) {
                // BUFFER ZONE USAGE (between safe zone and buffer end)
                ruleApplied.isBufferUsed = true;
            } else {
                // SAFE ZONE (within safe zone time)
                ruleApplied.isSafeZone = true;
            }

            // === RULE 2: Check early checkout ===
            if (checkOut.isBefore(end)) {
                ruleApplied.isEarlyCheckout = true;
                const earlyMinutes = end.diff(checkOut, 'minutes');
                deductionMinutes += earlyMinutes;
                ruleApplied.hasDeduction = true;

                // NEW RULE: If Buffer Used + Early Checkout, add the late arrival time to deduction
                if (ruleApplied.isBufferUsed) {
                    const lateArrivalMinutes = checkIn.diff(start, 'minutes');
                    deductionMinutes += lateArrivalMinutes;
                }
            }

            // === RULE 3: Calculate extra hours ===
            totalWorkMinutes = checkOut.diff(checkIn, 'minutes');
            const requiredMinutes = end.diff(start, 'minutes');
            

            if (ruleApplied.isLate) {
                // Late arrival: extra hours count after office end time only
                if (checkOut.isAfter(end)) {
                    extraHoursMinutes = checkOut.diff(end, 'minutes');
                    ruleApplied.hasExtraHours = true;
                }
            } else if (ruleApplied.isBufferUsed) {

                // Extra hours: Only if 9 hours completed
                if (totalWorkMinutes > requiredMinutes) {
                    extraHoursMinutes = totalWorkMinutes - requiredMinutes;
                    ruleApplied.hasExtraHours = true;
                }
                else{
                    if(ruleApplied.isEarlyCheckout){
                        //because we are already addind deduction of morning . thats why giving user a buffer advantage
                        incrementBuffer = false;
                    }else{
                        incrementBuffer = true;
                    }
                    
                }
            } else { 
                // Safe zone: extra hours after office end time
                if (checkOut.isAfter(end)) {
                extraHoursMinutes = checkOut.diff(end, 'minutes');
                ruleApplied.hasExtraHours = true;
            }
        }

            // === OPERATIONS TEAM EARLY ARRIVAL BONUS ===
            // If user is in Operations team and arrived BEFORE office start time,
            // add those early minutes as extra hours
            if (team.name === 'Operations' && checkIn.isBefore(start)) {
                const earlyArrivalMinutes = start.diff(checkIn, 'minutes');
                if (earlyArrivalMinutes > 0) {
                    extraHoursMinutes += earlyArrivalMinutes;
                    ruleApplied.hasExtraHours = extraHoursMinutes > 0;
                    console.log(`[OPERATIONS] Early arrival bonus: +${earlyArrivalMinutes}min for ${user.name} (arrived ${earlyArrivalMinutes}min before ${officeStart})`);
                }
            }
        } // End of weekend vs weekday logic

        // === RULE 4: Update buffer counter if needed ===
        if (incrementBuffer) {
            await incrementBufferCounter(user._id, workDate);
        }

        // === RULE 5: Create settings snapshot ===
        const snapshot = createSettingsSnapshot(settings);

        // === RULE 6: Handle midnight checkout (PRESERVE EXISTING LOGIC) ===
        const isOvernight = checkOut.format('YYYY-MM-DD') !== workDate;
        const records = [];

        if (!isOvernight) {
            // Check for holiday work (only if not weekend - weekend takes precedence)
            let isHolidayWork = false;
            let holidayBonusMinutes = 0;
            
            if (!isWeekendWork) {
              isHolidayWork = await isHoliday(workDate);
              if (isHolidayWork) {
                holidayBonusMinutes = calculateHolidayBonus(
                  workDate,
                  officeEnd,
                  checkIn.format('HH:mm'),
                  checkOut.format('HH:mm')
                );
                console.log(`[HOLIDAY] Holiday work detected for ${user.name} on ${workDate}. Bonus: ${holidayBonusMinutes} minutes (${(holidayBonusMinutes/60).toFixed(2)} hours)`);
              }
            }
            
            // Single day record
            records.push({
                userId: user._id,
                teamId: team._id,
                date: toUTCDateFromYMD(workDate),
                checkInTime: checkIn.format('HH:mm'),
                checkOutTime: checkOut.format('HH:mm'),
                officeStartTime: officeStart,
                officeEndTime: officeEnd,
                totalWorkMinutes,
                deductionMinutes,
                extraHoursMinutes,
                ruleApplied,
                bufferCountAtCalculation: bufferCounter.bufferUseCount,
                bufferIncrementedThisDay: incrementBuffer,
                systemSettingsSnapshot: snapshot,
                payoutMultiplier: isWeekendWork ? 2 : user.payoutMultiplier,
                calculatedAt: new Date(),
                isWeekendWork: isWeekendWork,
                isHolidayWork: isHolidayWork,
                holidayBonusMinutes: holidayBonusMinutes,
                holidayBonusApplied: isHolidayWork
            });
        } else {
            // MIDNIGHT CHECKOUT: Split into two records
            const day1End = createNaiveMoment(`${workDate} 23:59:00`);
            const day2Date = checkOut.format('YYYY-MM-DD');
            const day2Start = createNaiveMoment(`${day2Date} 00:00:00`);

            // Record 1: Day 1 (check-in to 23:59)
            const day1WorkMinutes = day1End.diff(checkIn, 'minutes');
            const day1ExtraMinutes = Math.max(0, day1End.diff(end, 'minutes'));

            records.push({
                userId: user._id,
                teamId: team._id,
                date: toUTCDateFromYMD(workDate),
                checkInTime: checkIn.format('HH:mm'),
                checkOutTime: '23:59',
                officeStartTime: officeStart,
                officeEndTime: officeEnd,
                totalWorkMinutes: day1WorkMinutes,
                deductionMinutes, // All deduction on day 1
                extraHoursMinutes: day1ExtraMinutes,
                ruleApplied,
                bufferCountAtCalculation: bufferCounter.bufferUseCount,
                bufferIncrementedThisDay: incrementBuffer,
                systemSettingsSnapshot: snapshot,
                payoutMultiplier: user.payoutMultiplier,
                calculatedAt: new Date()
            });

            // Record 2: Day 2 (00:00 to checkout)
            const day2WorkMinutes = checkOut.diff(day2Start, 'minutes');

            records.push({
                userId: user._id,
                teamId: team._id,
                date: toUTCDateFromYMD(day2Date),
                checkInTime: '00:00',
                checkOutTime: checkOut.format('HH:mm'),
                officeStartTime: officeStart,
                officeEndTime: officeEnd,
                totalWorkMinutes: day2WorkMinutes,
                deductionMinutes: 0, // No deduction on day 2
                extraHoursMinutes: day2WorkMinutes, // All day 2 time is extra
                ruleApplied: {
                    ...ruleApplied,
                    hasExtraHours: day2WorkMinutes > 0,
                    hasDeduction: false,
                    isLate: false,
                },
                bufferCountAtCalculation: bufferCounter.bufferUseCount,
                bufferIncrementedThisDay: false, // Only day 1 affects buffer
                systemSettingsSnapshot: snapshot,
                payoutMultiplier: user.payoutMultiplier,
                calculatedAt: new Date(),
                // Mark as automatic second entry
                isAnotherEntry: true,
                anotherEntryDetails: {
                    entryNo: 2,
                    entryType: 'automatic'
                }
            });
        }

        return records;
    } catch (error) {
        console.error(`[CALC] Error calculating attendance for ${employeeId}:`, error);
        return [];
    }
}

async function processGroupedEvents(groups) {
    const results = [];
    
    // Sort groups by date to ensure buffer count increments in chronological order
    const sortedGroups = Object.values(groups).sort((a, b) => {
        return moment(a.workDate).valueOf() - moment(b.workDate).valueOf();
    });

    for (const group of sortedGroups) {
        const records = await calculateAttendanceRecords(group);
        results.push(...records);
    }
    
    return results;
}

async function attendanceRecordExists(userId, date) {
    try {
        const exists = await AttendanceSystem.findOne({
            userId,
            date: toUTCDateFromYMD(date)
        });
        return !!exists;
    } catch (error) {
        console.error('[DB] Error checking attendance record existence:', error);
        return false;
    }
}

async function saveAttendanceRecord(recordData) {
    try {
        // Check if already exists
        const exists = await attendanceRecordExists(recordData.userId, recordData.date);
        
        if (exists) {
            console.log(`[DB] Attendance record already exists for user on ${moment(recordData.date).format('YYYY-MM-DD')}`);
            return { success: false, reason: 'already_exists' };
        }

        const record = new AttendanceSystem(recordData);
        await record.save();
        
        const user = await User.findById(recordData.userId);
        console.log(`[DB] ✓ Saved attendance for ${user.name} on ${moment(recordData.date).format('YYYY-MM-DD')}: ` +
                    `Deduction=${recordData.deductionMinutes}min, Extra=${recordData.extraHoursMinutes}min`);

        return { success: true };
    } catch (error) {
        console.error('[DB] Error saving attendance record:', error);
        return { success: false, reason: 'save_error', error };
    }
}

async function processAttendance(customStartTime = null, customEndTime = null) {
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
        console.log('\n========================================');
        console.log('[AUTOMATION] Starting Attendance Processing');
        console.log('========================================\n');

        // Get system settings to determine fetch start time
        const systemSettings = await getActiveSettings();
        
        const endTime = customEndTime || new Date();
        
        // Use lastAttendanceFetchedDate if available, otherwise default to 3 days ago
        let fetchStartTime;
        if (customStartTime) {
            fetchStartTime = customStartTime;
        } else if (systemSettings.lastAttendanceFetchedDate) {
            // Fetch from last fetched date (including that day)
            fetchStartTime = moment(systemSettings.lastAttendanceFetchedDate).startOf('day').toDate();
            console.log(`[AUTOMATION] Using last fetched date: ${moment(fetchStartTime).format('YYYY-MM-DD')}`);
        } else {
            // First time running - default to 3 days ago
            fetchStartTime = moment().subtract(1 , "month").startOf('month').toDate();
            console.log('[AUTOMATION] No last fetched date found, using default (3 days ago)');
        }

        console.log(`[AUTOMATION] Time Range: ${moment(fetchStartTime).format('YYYY-MM-DD HH:mm')} to ${moment(endTime).format('YYYY-MM-DD HH:mm')}`);

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

        // Calculate attendance records with new rules
        console.log('[AUTOMATION] Step 3: Calculating attendance with rules...');
        const attendanceRecords = await processGroupedEvents(groupedEvents);
        console.log(`[AUTOMATION] ✓ Calculated ${attendanceRecords.length} attendance records\n`);

        // Save to database
        console.log('[AUTOMATION] Step 4: Saving to database...');
        let saved = 0;
        let skipped = 0;

        const results = await Promise.all(attendanceRecords.map(record => saveAttendanceRecord(record)));
        
        results.forEach(result => {
            if (result.success) {
                saved++;
            } else {
                skipped++;
            }
        });

        console.log(`[AUTOMATION] ✓ Saved: ${saved}, Skipped: ${skipped}\n`);

        // Update last fetched date in system settings
        await updateLastFetchedDate(endTime);
        console.log(`[AUTOMATION] ✓ Updated last fetched date: ${moment(endTime).format('YYYY-MM-DD HH:mm')}\n`);

        automationState.updateLastFetchTime(endTime);
        automationState.updateStats(events.length, saved, skipped);

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log('========================================');
        console.log(`[AUTOMATION] ✓ Process completed in ${duration}s`);
        console.log('========================================\n');

        automationState.setRunning(false);

        return {
            success: true,
            message: 'Attendance processed successfully',
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
            message: 'Error processing attendance',
            error: error.message,
        };
    }
}

function getAutomationState() {
    return automationState.getState();
}

// ===================================================================
// CRON JOB SETUP
// ===================================================================

let cronJob = null;

/**
 * Start the cron job to run daily at 7:00 AM Pakistan time (UTC+5)
 * Cron expression: '0 7 * * *' means "At 7:00 AM every day"
 * Since the server is running in Pakistan timezone, this will execute at 7:00 AM local time
 */
function startCronJob() {
    if (cronJob) {
        console.log('[CRON] Job already running');
        return;
    }

    // Run daily at 7:00 AM Pakistan time
    cronJob = cron.schedule('0 7 * * *', async () => {
        console.log('\n========================================');
        console.log('[CRON] Daily attendance processing started at 7:00 AM PKT');
        console.log('========================================\n');
        
        try {
            await processAttendance();
            console.log('[CRON] Daily attendance processing completed successfully');
        } catch (error) {
            console.error('[CRON] Error during scheduled attendance processing:', error);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Karachi" // Pakistan timezone (UTC+5)
    });

    console.log('[CRON] ✓ Daily attendance job scheduled for 7:00 AM PKT (Asia/Karachi timezone)');
}

/**
 * Stop the cron job
 */
function stopCronJob() {
    if (cronJob) {
        cronJob.stop();
        cronJob = null;
        console.log('[CRON] Job stopped');
    } else {
        console.log('[CRON] No job running');
    }
}

/**
 * Get cron job status
 */
function getCronStatus() {
    return {
        isRunning: cronJob !== null,
        schedule: '0 7 * * * (Daily at 7:00 AM PKT)',
        timezone: 'Asia/Karachi'
    };
}

module.exports = {
    processAttendance,
    fetchAllBiometricEvents,
    getAutomationState,
    parseTime,
    createNaiveMoment,
    startCronJob,
    stopCronJob,
    getCronStatus,
    CONFIG,
};
