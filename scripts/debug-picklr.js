const mongoose = require('mongoose');
const Project = require('../models/Project');
const TaskLog = require('../models/TaskLog');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function debugPicklrData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Find the Picklr test project
    const picklrProject = await Project.findOne({ name: 'Picklr test' });
    console.log('\n=== Picklr Test Project ===');
    if (picklrProject) {
      console.log(`Found project: "${picklrProject.name}" (ID: ${picklrProject._id})`);
    } else {
      console.log('Picklr test project not found!');
      return;
    }
    
    // Find task logs with this project ID
    console.log('\n=== Task Logs with Picklr Test Project ID ===');
    const taskLogsWithId = await TaskLog.find({
      'tasks.project_id': picklrProject._id
    });
    console.log(`Found ${taskLogsWithId.length} task logs with project_id: ${picklrProject._id}`);
    
    // Find task logs with project name "Picklr test"
    console.log('\n=== Task Logs with Project Name "Picklr test" ===');
    const taskLogsWithName = await TaskLog.find({
      'tasks.project_name': 'Picklr test'
    });
    console.log(`Found ${taskLogsWithName.length} task logs with project_name: "Picklr test"`);
    
    // Show a sample of the data
    if (taskLogsWithId.length > 0) {
      console.log('\n=== Sample Task Log ===');
      const sample = taskLogsWithId[0];
      console.log(`Date: ${sample.date}`);
      console.log(`User: ${sample.userId}`);
      console.log(`Total Hours: ${sample.totalHours}`);
      console.log('Tasks:');
      sample.tasks.forEach((task, index) => {
        console.log(`  Task ${index + 1}:`);
        console.log(`    project_id: ${task.project_id}`);
        console.log(`    project_name: "${task.project_name}"`);
        console.log(`    description: "${task.description}"`);
        console.log(`    hours: ${task.hours}`);
      });
    }
    
    // Check if there are any task logs with old "Picklr" name still
    console.log('\n=== Task Logs with Old "Picklr" Name ===');
    const oldPicklrLogs = await TaskLog.find({
      'tasks.project_name': 'Picklr'
    });
    console.log(`Found ${oldPicklrLogs.length} task logs with old project_name: "Picklr"`);
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugPicklrData();