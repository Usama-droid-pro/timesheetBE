const mongoose = require('mongoose');
const TaskLog = require('../models/TaskLog');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function checkOsamaDateRange() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const osamaId = '6904a2a9988e2a6a7facf3a5';
    
    // Get all task logs for Osama
    const taskLogs = await TaskLog.find({ userId: osamaId }).sort({ date: 1 });
    
    console.log(`\n=== Osama's Task Logs Date Range ===`);
    console.log(`Total task logs: ${taskLogs.length}`);
    
    if (taskLogs.length > 0) {
      const firstDate = taskLogs[0].date;
      const lastDate = taskLogs[taskLogs.length - 1].date;
      
      console.log(`First log: ${firstDate.toISOString().split('T')[0]}`);
      console.log(`Last log: ${lastDate.toISOString().split('T')[0]}`);
      
      // Group by month
      const monthCounts = {};
      taskLogs.forEach(log => {
        const monthKey = log.date.toISOString().substring(0, 7); // YYYY-MM
        monthCounts[monthKey] = (monthCounts[monthKey] || 0) + 1;
      });
      
      console.log('\n=== Task Logs by Month ===');
      Object.entries(monthCounts)
        .sort()
        .forEach(([month, count]) => {
          console.log(`${month}: ${count} logs`);
        });
      
      // Check current month specifically
      const now = new Date();
      const currentMonth = now.toISOString().substring(0, 7);
      console.log(`\nCurrent month (${currentMonth}): ${monthCounts[currentMonth] || 0} logs`);
    }
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkOsamaDateRange();