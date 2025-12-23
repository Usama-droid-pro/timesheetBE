const mongoose = require('mongoose');
const Project = require('../models/Project');
const TaskLog = require('../models/TaskLog');
require('dotenv').config();

async function fixCopperProject() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || process.env.DATABASE_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB');
    console.log('='.repeat(50));
    
    // 1. Find the current copper project (should be "coppertestfield" now)
    const copperProject = await Project.findOne({
      name: { $regex: /copper/i }
    });
    
    if (!copperProject) {
      console.log('❌ No copper project found in database!');
      console.log('Please create the project first.');
      return;
    }
    
    console.log(`✅ Found copper project: "${copperProject.name}" (ID: ${copperProject._id})`);
    
    // 2. Find all task logs with old copper project names
    const oldCopperNames = ['copperfield', 'Copperfield', 'COPPERFIELD'];
    
    let totalFixed = 0;
    
    for (const oldName of oldCopperNames) {
      console.log(`\n🔍 Looking for tasks with project name: "${oldName}"`);
      
      const taskLogs = await TaskLog.find({
        'tasks.project_name': oldName,
        'tasks.project_id': { $exists: false }
      });
      
      console.log(`Found ${taskLogs.length} task logs with "${oldName}"`);
      
      for (const taskLog of taskLogs) {
        let hasChanges = false;
        
        for (const task of taskLog.tasks) {
          if (task.project_name === oldName && !task.project_id) {
            console.log(`  📝 Updating task in log ${taskLog._id} (${taskLog.date.toISOString().split('T')[0]})`);
            task.project_id = copperProject._id;
            task.project_name = copperProject.name; // Update to new name
            hasChanges = true;
            totalFixed++;
          }
        }
        
        if (hasChanges) {
          await taskLog.save();
          console.log(`  ✅ Updated task log ${taskLog._id}`);
        }
      }
    }
    
    console.log(`\n🎉 Successfully fixed ${totalFixed} task entries!`);
    
    // 3. Verify the fix
    console.log('\n🔍 Verifying the fix...');
    
    const remainingOldEntries = await TaskLog.find({
      'tasks.project_name': { $in: oldCopperNames }
    });
    
    console.log(`Remaining old copper entries: ${remainingOldEntries.length}`);
    
    const newCopperEntries = await TaskLog.find({
      'tasks.project_id': copperProject._id
    });
    
    console.log(`Task logs now using copper project ID: ${newCopperEntries.length}`);
    
    // 4. Show sample of fixed data
    if (newCopperEntries.length > 0) {
      console.log('\nSample of fixed entries:');
      newCopperEntries.slice(0, 3).forEach(log => {
        console.log(`  - Date: ${log.date.toISOString().split('T')[0]}`);
        log.tasks.forEach(task => {
          if (task.project_id && task.project_id.toString() === copperProject._id.toString()) {
            console.log(`    * Project: "${task.project_name}" (ID: ${task.project_id}) | Hours: ${task.hours}`);
          }
        });
      });
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('Copper project fix completed!');
    
  } catch (error) {
    console.error('Fix failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run the fix
if (require.main === module) {
  fixCopperProject()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fix script failed:', error);
      process.exit(1);
    });
}

module.exports = fixCopperProject;