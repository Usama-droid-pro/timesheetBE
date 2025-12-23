const mongoose = require('mongoose');
const Project = require('../models/Project');
const TaskLog = require('../models/TaskLog');
require('dotenv').config();

async function verifyMigration() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || process.env.DATABASE_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB');
    console.log('='.repeat(50));
    
    // 1. Check all projects
    const projects = await Project.find({});
    console.log('\n📋 PROJECTS IN DATABASE:');
    projects.forEach(project => {
      console.log(`  - ID: ${project._id} | Name: "${project.name}" | Status: ${project.status}`);
    });
    
    // 2. Check task logs with project_name only (not migrated)
    const unmigrated = await TaskLog.find({
      'tasks.project_name': { $exists: true },
      'tasks.project_id': { $exists: false }
    });
    
    console.log(`\n🔄 UNMIGRATED TASK LOGS: ${unmigrated.length}`);
    if (unmigrated.length > 0) {
      console.log('Sample unmigrated entries:');
      unmigrated.slice(0, 3).forEach(log => {
        console.log(`  - Date: ${log.date.toISOString().split('T')[0]} | User: ${log.userId}`);
        log.tasks.forEach(task => {
          console.log(`    * Project: "${task.project_name}" | Hours: ${task.hours}`);
        });
      });
    }
    
    // 3. Check task logs with project_id (migrated)
    const migrated = await TaskLog.find({
      'tasks.project_id': { $exists: true }
    });
    
    console.log(`\n✅ MIGRATED TASK LOGS: ${migrated.length}`);
    if (migrated.length > 0) {
      console.log('Sample migrated entries:');
      const sampleMigrated = migrated.slice(0, 3);
      for (const log of sampleMigrated) {
        console.log(`  - Date: ${log.date.toISOString().split('T')[0]} | User: ${log.userId}`);
        for (const task of log.tasks) {
          if (task.project_id) {
            const project = await Project.findById(task.project_id);
            const projectName = project ? project.name : 'NOT FOUND';
            console.log(`    * Project ID: ${task.project_id} -> "${projectName}" | Hours: ${task.hours}`);
          }
        }
      }
    }
    
    // 4. Check for specific project issues
    console.log('\n🔍 CHECKING FOR COPPER PROJECT ISSUES:');
    
    // Find all unique project names in task logs
    const projectNamesInLogs = await TaskLog.aggregate([
      { $unwind: '$tasks' },
      { $group: { _id: '$tasks.project_name', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    console.log('Project names found in task logs:');
    projectNamesInLogs.forEach(item => {
      if (item._id) {
        console.log(`  - "${item._id}": ${item.count} entries`);
      }
    });
    
    // Check if there are entries with "copperfield" or similar
    const copperEntries = await TaskLog.find({
      'tasks.project_name': { $regex: /copper/i }
    });
    
    console.log(`\nEntries with "copper" in project name: ${copperEntries.length}`);
    copperEntries.forEach(log => {
      log.tasks.forEach(task => {
        if (task.project_name && task.project_name.toLowerCase().includes('copper')) {
          console.log(`  - "${task.project_name}" | Has project_id: ${!!task.project_id}`);
        }
      });
    });
    
    // 5. Check October data specifically
    console.log('\n📅 CHECKING OCTOBER 2024 DATA:');
    const octStart = new Date('2024-10-01');
    const octEnd = new Date('2024-10-31');
    
    const octLogs = await TaskLog.find({
      date: { $gte: octStart, $lte: octEnd }
    });
    
    console.log(`October 2024 task logs: ${octLogs.length}`);
    if (octLogs.length > 0) {
      console.log('Sample October entries:');
      octLogs.slice(0, 3).forEach(log => {
        console.log(`  - Date: ${log.date.toISOString().split('T')[0]} | Total Hours: ${log.totalHours}`);
        log.tasks.forEach(task => {
          console.log(`    * Project: "${task.project_name}" | Project ID: ${task.project_id || 'NONE'} | Hours: ${task.hours}`);
        });
      });
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('Verification completed!');
    
  } catch (error) {
    console.error('Verification failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run the verification
if (require.main === module) {
  verifyMigration()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Verification script failed:', error);
      process.exit(1);
    });
}

module.exports = verifyMigration;