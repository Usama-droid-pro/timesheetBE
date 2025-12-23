const mongoose = require('mongoose');
const Project = require('../models/Project');
const TaskLog = require('../models/TaskLog');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function checkProjectsAndTaskLogs() {
  try {
    const mongoUri = (process.env.MONGODB_URI || process.env.DATABASE_URL || '').trim();
    console.log('Full URI:', mongoUri);
    console.log('URI length:', mongoUri.length);
    await mongoose.connect(mongoUri);
    
    console.log('=== Current Projects ===');
    const projects = await Project.find({});
    projects.forEach(p => console.log(`- ${p.name} (ID: ${p._id})`));
    
    console.log('\n=== Task Log Project Names ===');
    const taskLogs = await TaskLog.find({});
    const projectNames = new Set();
    
    taskLogs.forEach(taskLog => {
      taskLog.tasks.forEach(task => {
        if (task.project_name) {
          projectNames.add(task.project_name);
        }
      });
    });
    
    console.log('Unique project names in task logs:');
    Array.from(projectNames).sort().forEach(name => console.log(`- "${name}"`));
    
    console.log('\n=== Potential Mismatches ===');
    const currentProjectNames = new Set(projects.map(p => p.name));
    const orphanedNames = Array.from(projectNames).filter(name => !currentProjectNames.has(name));
    
    if (orphanedNames.length > 0) {
      console.log('Project names in task logs that don\'t match current projects:');
      orphanedNames.forEach(name => console.log(`- "${name}"`));
    } else {
      console.log('All project names in task logs match current projects.');
    }
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkProjectsAndTaskLogs();