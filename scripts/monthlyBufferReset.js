/**
 * Monthly Buffer Counter Reset Script
 * 
 * This script should be run on the 1st of every month at 00:00
 * It resets buffer counters for all active users for the new month
 */

const mongoose = require('mongoose');
const cron = require('node-cron');
require('dotenv').config();

const { resetMonthlyCounters } = require('../services/bufferCounterService');

// Connect to MongoDB
async function connect() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✓ Connected to MongoDB');
  } catch (error) {
    console.error('✗ MongoDB connection failed:', error);
    process.exit(1);
  }
}

// Run the reset
async function runReset() {
  try {
    console.log('\n========================================');
    console.log('  Monthly Buffer Counter Reset');
    console.log('========================================\n');

    await connect();

    const result = await resetMonthlyCounters();

    console.log('\n========================================');
    console.log('  ✓ Reset Completed Successfully');
    console.log(`  Created: ${result.created}, Skipped: ${result.skipped}`);
    console.log('========================================\n');

    process.exit(0);
  } catch (error) {
    console.error('\n========================================');
    console.error('  ✗ Reset Failed');
    console.error('========================================\n');
    console.error(error);
    process.exit(1);
  }
}

// Setup cron job (runs on 1st of every month at 00:00)
function setupCron() {
  // Schedule: 0 0 1 * * (second, minute, hour, day, month, year)
  // Runs at 00:00 on the 1st day of every month
  const job = cron.schedule('0 0 1 * *', async () => {
    console.log('[CRON] Monthly buffer reset triggered at', new Date().toISOString());
    await runReset();
  }, {
    scheduled: true,
    timezone: process.env.TIMEZONE || 'Asia/Karachi'
  });

  console.log('[CRON] Monthly buffer reset scheduled (1st of every month at 00:00)');
  return job;
}

// Manual execution
if (require.main === module) {
  const arg = process.argv[2];
  
  if (arg === '--cron') {
    // Start as cron job
    connect().then(() => {
      setupCron();
      console.log('Cron job running... Press Ctrl+C to stop');
    });
  } else {
    // Run immediately
    runReset();
  }
}

module.exports = { runReset, setupCron };
