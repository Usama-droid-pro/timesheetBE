const mongoose = require('mongoose');
const Project = require('../models/Project');
const TaskLog = require('../models/TaskLog');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function fixProjectNameChanges() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Define the mapping for known project name changes
    const nameMapping = {
      'Picklr': 'Picklr test',
      'CopperField': 'CopperTestField',
      // Add more mappings as needed
    };
    
    console.log('Project name mappings:');
    Object.entries(nameMapping).forEach(([old, current]) => {
      console.log(`  "${old}" → "${current}"`);
    });
    
    // Get all projects for ID lookup
    const projects = await Project.find({});
    const projectNameToId = {};
    projects.forEach(project => {
      projectNameToId[project.name] = project._id;
    });
    
    let updatedCount = 0;
    
    for (const [oldName, newName] of Object.entries(nameMapping)) {
      const newProjectId = projectNameToId[newName];
      
      if (!newProjectId) {
        console.warn(`Warning: New project name "${newName}" not found in database`);
        continue;
      }
      
      console.log(`\nUpdating task logs with project name "${oldName}"...`);
      
      // Find all task logs with the old project name
      const taskLogs = await TaskLog.find({
        'tasks.project_name': oldName
      });
      
      console.log(`Found ${taskLogs.length} task logs to update`);
      
      for (const taskLog of taskLogs) {
        let hasChanges = false;
        
        // Update each task in the task log
        for (const task of taskLog.tasks) {
          if (task.project_name === oldName) {
            task.project_name = newName;
            task.project_id = newProjectId;
            hasChanges = true;
          }
        }
        
        if (hasChanges) {
          await taskLog.save();
          updatedCount++;
        }
      }
      
      console.log(`Updated ${taskLogs.length} task logs for "${oldName}" → "${newName}"`);
    }
    
    console.log(`\n=== Summary ===`);
    console.log(`Total task logs updated: ${updatedCount}`);
    
    // Verify the changes
    console.log('\n=== Verification ===');
    for (const [oldName, newName] of Object.entries(nameMapping)) {
      const remainingOld = await TaskLog.countDocuments({
        'tasks.project_name': oldName
      });
      const newCount = await TaskLog.countDocuments({
        'tasks.project_name': newName
      });
      
      console.log(`"${oldName}": ${remainingOld} remaining, "${newName}": ${newCount} total`);
    }
    
    console.log('\nProject name fix completed!');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

fixProjectNameChanges();