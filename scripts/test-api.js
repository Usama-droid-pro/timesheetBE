const mongoose = require('mongoose');
const tasklogService = require('../services/tasklogService');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function testTaskLogAPI() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Test getting task logs for a specific user
    const userId = '6904a2a9988e2a6a7facf3a7'; // From the sample above
    
    console.log(`\n=== Testing getTaskLogs for user ${userId} ===`);
    
    // First, let's test without date range
    console.log('Testing without date range...');
    const allTaskLogs = await tasklogService.getTaskLogs({
      userId: userId
    });
    console.log(`Found ${allTaskLogs.length} task logs (no date filter)`);
    
    // Now test with a wider date range
    console.log('Testing with wider date range...');
    const taskLogs = await tasklogService.getTaskLogs({
      userId: userId,
      startDate: '2020-01-01',
      endDate: '2030-12-31'
    });
    
    console.log(`Found ${taskLogs.length} task logs`);
    
    // Look for Picklr test entries
    const picklrLogs = taskLogs.filter(log => 
      log.tasks.some(task => task.project_name === 'Picklr test')
    );
    
    console.log(`Found ${picklrLogs.length} task logs with Picklr test tasks`);
    
    if (picklrLogs.length > 0) {
      console.log('\n=== Sample Picklr Test Log ===');
      const sample = picklrLogs[0];
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

testTaskLogAPI();