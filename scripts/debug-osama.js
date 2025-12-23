const mongoose = require('mongoose');
const User = require('../models/User');
const TaskLog = require('../models/TaskLog');
const tasklogService = require('../services/tasklogService');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function debugOsamaData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Find Osama's user record
    console.log('\n=== Finding Osama User ===');
    const osamaUser = await User.findOne({ name: /osama/i });
    if (osamaUser) {
      console.log(`Found Osama: ${osamaUser.name} (ID: ${osamaUser._id})`);
      console.log(`Email: ${osamaUser.email}`);
      console.log(`Role: ${osamaUser.role}`);
    } else {
      console.log('Osama user not found!');
      return;
    }
    
    // Check task logs directly in database
    console.log('\n=== Direct Database Query ===');
    const directTaskLogs = await TaskLog.find({ userId: osamaUser._id });
    console.log(`Found ${directTaskLogs.length} task logs directly in database`);
    
    // Test with string ID
    console.log('\n=== Testing with String ID ===');
    const stringTaskLogs = await TaskLog.find({ userId: osamaUser._id.toString() });
    console.log(`Found ${stringTaskLogs.length} task logs with string ID`);
    
    // Test the service method
    console.log('\n=== Testing TaskLog Service ===');
    const serviceTaskLogs = await tasklogService.getTaskLogs({
      userId: osamaUser._id.toString()
    });
    console.log(`Service returned ${serviceTaskLogs.length} task logs`);
    
    // Test with current month date range (November 2025)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    console.log('\n=== Testing with Current Month Range (November) ===');
    console.log(`Date range: ${startOfMonth.toISOString().split('T')[0]} to ${endOfMonth.toISOString().split('T')[0]}`);
    
    const monthlyTaskLogs = await tasklogService.getTaskLogs({
      userId: osamaUser._id.toString(),
      startDate: startOfMonth.toISOString().split('T')[0],
      endDate: endOfMonth.toISOString().split('T')[0]
    });
    console.log(`Service returned ${monthlyTaskLogs.length} task logs for November 2025`);
    
    // Test with October 2025 (where Osama has data)
    console.log('\n=== Testing with October 2025 ===');
    const octoberTaskLogs = await tasklogService.getTaskLogs({
      userId: osamaUser._id.toString(),
      startDate: '2025-10-01',
      endDate: '2025-10-31'
    });
    console.log(`Service returned ${octoberTaskLogs.length} task logs for October 2025`);
    
    if (monthlyTaskLogs.length > 0) {
      console.log('\n=== Sample Task Log ===');
      const sample = monthlyTaskLogs[0];
      console.log(`Date: ${sample.date}`);
      console.log(`Total Hours: ${sample.totalHours}`);
      console.log('Tasks:');
      sample.tasks.forEach((task, index) => {
        console.log(`  Task ${index + 1}: ${task.project_name} - ${task.hours}hrs`);
      });
    }
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugOsamaData();