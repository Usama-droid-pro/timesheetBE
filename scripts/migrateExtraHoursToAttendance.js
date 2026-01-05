/**
 * Migration Script: ExtraHours to AttendanceSystem
 * 
 * This script:
 * 1. Creates initial system settings if not exists
 * 2. Renames extrahours collection to extrahours_archive
 * 3. Migrates data from ExtraHours to AttendanceSystem with new fields
 * 4. Initializes buffer counters for all active users
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const ExtraHours = require('../models/ExtraHours');
const AttendanceSystem = require('../models/AttendanceSystem');
const SystemSettings = require('../models/SystemSettings');
const BufferCounterHistory = require('../models/BufferCounterHistory');
const User = require('../models/User');
const Team = require('../models/Team');

// Connect to MongoDB
async function connect() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✓ Connected to MongoDB');
  } catch (error) {
    console.error('✗ MongoDB connection failed:', error);
    process.exit(1);
  }
}

// Create initial system settings
async function createInitialSettings() {
  try {
    const existingSettings = await SystemSettings.findOne({ isActive: true });
    
    if (existingSettings) {
      console.log('✓ Active system settings already exist');
      return existingSettings;
    }

    // Find admin user (first admin or create system user)
    const adminUser = await User.findOne({ isAdmin: true });
    
    if (!adminUser) {
      console.error('✗ No admin user found. Please create an admin user first.');
      process.exit(1);
    }

    const settings = new SystemSettings({
      bufferTimeMinutes: 30,
      safeZoneMinutes: 10,
      bufferUseLimit: 5,
      reducedBufferMinutes: 10,
      defaultOfficeStartTime: '10:00',
      defaultOfficeEndTime: '19:00',
      version: 1,
      isActive: true,
      effectiveFrom: new Date(),
      createdBy: adminUser._id
    });

    await settings.save();
    console.log('✓ Created initial system settings');
    return settings;
  } catch (error) {
    console.error('✗ Error creating system settings:', error);
    throw error;
  }
}

// Migrate ExtraHours to AttendanceSystem
async function migrateExtraHours() {
  try {
    console.log('\n--- Starting ExtraHours Migration ---\n');

    const extraHoursCount = await ExtraHours.countDocuments();
    console.log(`Found ${extraHoursCount} ExtraHours records to migrate`);

    if (extraHoursCount === 0) {
      console.log('No records to migrate');
      return;
    }

    // Get system settings for snapshot
    const systemSettings = await SystemSettings.findOne({ isActive: true });
    
    if (!systemSettings) {
      console.error('✗ No active system settings found');
      process.exit(1);
    }

    const settingsSnapshot = {
      bufferTimeMinutes: systemSettings.bufferTimeMinutes,
      safeZoneMinutes: systemSettings.safeZoneMinutes,
      bufferUseLimit: systemSettings.bufferUseLimit,
      reducedBufferMinutes: systemSettings.reducedBufferMinutes,
      settingsVersion: systemSettings.version,
      effectiveFrom: systemSettings.effectiveFrom
    };

    // Migrate in batches
    const batchSize = 100;
    let processed = 0;
    let migrated = 0;
    let skipped = 0;

    while (processed < extraHoursCount) {
      const batch = await ExtraHours.find()
        .skip(processed)
        .limit(batchSize)
        .populate('userId');

      for (const oldRecord of batch) {
        try {
          // Check if already migrated
          const exists = await AttendanceSystem.findOne({
            userId: oldRecord.userId._id,
            date: oldRecord.date
          });

          if (exists) {
            skipped++;
            continue;
          }

          // Get user's office hours
          const officeStartTime = oldRecord.userId.officeStartTime || systemSettings.defaultOfficeStartTime;
          const officeEndTime = oldRecord.userId.officeEndTime || systemSettings.defaultOfficeEndTime;

          // Convert hours (decimal) to minutes
          const extraHoursMinutes = Math.round(oldRecord.hours * 60);

          // Create new attendance record
          const attendanceRecord = new AttendanceSystem({
            userId: oldRecord.userId._id,
            teamId: oldRecord.teamId,
            date: oldRecord.date,
            checkInTime: oldRecord.startTime,
            checkOutTime: oldRecord.endTime,
            officeStartTime,
            officeEndTime,
            totalWorkMinutes: extraHoursMinutes, // Approximate
            deductionMinutes: 0, // Old system didn't track deductions
            extraHoursMinutes,
            ruleApplied: {
              isLate: false,
              hasDeduction: false,
              hasExtraHours: extraHoursMinutes > 0,
              isBufferUsed: false,
              isBufferAbused: false,
              isSafeZone: false,
              isEarlyCheckout: false
            },
            bufferCountAtCalculation: 0,
            bufferIncrementedThisDay: false,
            systemSettingsSnapshot: settingsSnapshot,
            approvalStatus: oldRecord.approvalStatus,
            payoutMultiplier: oldRecord.userId.payoutMultiplier || 1,
            calculatedPayout: 0,
            note: oldRecord.note,
            description: oldRecord.description,
            calculatedAt: oldRecord.createdAt
          });

          await attendanceRecord.save();
          migrated++;
        } catch (error) {
          console.error(`Error migrating record ${oldRecord._id}:`, error.message);
          skipped++;
        }
      }

      processed += batch.length;
      console.log(`Progress: ${processed}/${extraHoursCount} (Migrated: ${migrated}, Skipped: ${skipped})`);
    }

    console.log(`\n✓ Migration complete: ${migrated} migrated, ${skipped} skipped\n`);
  } catch (error) {
    console.error('✗ Migration failed:', error);
    throw error;
  }
}

// Archive ExtraHours collection
async function archiveExtraHours() {
  try {
    const db = mongoose.connection.db;
    const collections = await db.listCollections({ name: 'extrahours' }).toArray();
    
    if (collections.length === 0) {
      console.log('✓ ExtraHours collection does not exist or already archived');
      return;
    }

    // Rename collection
    await db.renameCollection('extrahours', 'extrahours_archive');
    console.log('✓ Renamed extrahours to extrahours_archive');
  } catch (error) {
    if (error.code === 48) {
      // Collection already exists
      console.log('✓ Archive collection already exists');
    } else {
      console.error('✗ Error archiving collection:', error);
      throw error;
    }
  }
}

// Initialize buffer counters for all active users
async function initializeBufferCounters() {
  try {
    console.log('\n--- Initializing Buffer Counters ---\n');

    const activeUsers = await User.find({ active: true, isDeleted: false });
    console.log(`Found ${activeUsers.length} active users`);

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    let created = 0;
    let existing = 0;

    for (const user of activeUsers) {
      try {
        const existingCounter = await BufferCounterHistory.findOne({
          userId: user._id,
          month: currentMonth,
          year: currentYear
        });

        if (existingCounter) {
          existing++;
          continue;
        }

        const counter = new BufferCounterHistory({
          userId: user._id,
          month: currentMonth,
          year: currentYear,
          bufferUseCount: 0,
          bufferAbusedReached: false,
          usageDates: []
        });

        await counter.save();
        created++;
      } catch (error) {
        console.error(`Error creating counter for user ${user.name}:`, error.message);
      }
    }

    console.log(`✓ Buffer counters initialized: ${created} created, ${existing} already existed\n`);
  } catch (error) {
    console.error('✗ Error initializing buffer counters:', error);
    throw error;
  }
}

// Main migration function
async function runMigration() {
  try {
    console.log('\n========================================');
    console.log('  ExtraHours to AttendanceSystem Migration');
    console.log('========================================\n');

    await connect();

    // Step 1: Create initial system settings
    console.log('Step 1: Creating initial system settings...');
    await createInitialSettings();

    // Step 2: Migrate data
    console.log('\nStep 2: Migrating ExtraHours data...');
    await migrateExtraHours();

    // Step 3: Archive old collection
    console.log('\nStep 3: Archiving ExtraHours collection...');
    await archiveExtraHours();

    // Step 4: Initialize buffer counters
    console.log('\nStep 4: Initializing buffer counters...');
    await initializeBufferCounters();

    console.log('\n========================================');
    console.log('  ✓ Migration Completed Successfully');
    console.log('========================================\n');

    process.exit(0);
  } catch (error) {
    console.error('\n========================================');
    console.error('  ✗ Migration Failed');
    console.error('========================================\n');
    console.error(error);
    process.exit(1);
  }
}

// Run migration if called directly
if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };
