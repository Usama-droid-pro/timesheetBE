const mongoose = require('mongoose');
const Project = require('../models/Project');
const TaskLog = require('../models/TaskLog');
require('dotenv').config();

async function updateProjectNames() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || process.env.DATABASE_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB');
    console.log('='.repeat(50));
    
    // Get all projects to create an id-to-name mapping
    const projects = await Project.find({});
    const projectIdToName = {};
    
    projects.forEach(project => {
      projectIdToName[project._id.toString()] = project.name;
    });
    
    console.log('📋 Current projects:');
    projects.forEach(project => {
      console.log(`  - ${project.name} (ID: ${project._id})`);
    });
    
    // Find all task logs that have project_id
    const taskLogs = await TaskLog.find({
      'tasks.project_id': { $exists: true }
    });
    
    console.log(`\n🔄 Found ${taskLogs.length} task logs with project_id to update`);
    
    let updatedCount = 0;
    let taskCount = 0;
    
    for (const taskLog of taskLogs) {
      let hasChanges = false;
      
      // Update each task in the task log
      for (const task of taskLog.tasks) {
        if (task.project_id) {
          const currentProjectName = projectIdToName[task.project_id.toString()];
          
          if (currentProjectName && task.project_name !== currentProjectName) {
            console.log(`  📝 Updating "${task.project_name}" → "${currentProjectName}" (${taskLog.date.toISOString().split('T')[0]})`);
            task.project_name = currentProjectName;
            hasChanges = true;
            taskCount++;
          }
        }
      }
      
      if (hasChanges) {
        await taskLog.save();
        updatedCount++;
        
        if (updatedCount % 10 === 0) {
          console.log(`    Progress: ${updatedCount} task logs updated...`);
        }
      }
    }
    
    console.log('\n🎉 Update Summary:');
    console.log(`  - Task logs updated: ${updatedCount}`);
    console.log(`  - Individual tasks updated: ${taskCount}`);
    
    // Verify the update
    console.log('\n🔍 Verification:');
    
    // Check for mismatched project names
    const mismatchedLogs = await TaskLog.aggregate([
      { $unwind: '$tasks' },
      {
        $lookup: {
          from: 'projects',
          localField: 'tasks.project_id',
          foreignField: '_id',
          as: 'projectInfo'
        }
      },
      {
        $addFields: {
          currentProjectName: { $arrayElemAt: ['$projectInfo.name', 0] },
          storedProjectName: '$tasks.project_name'
        }
      },
      {
        $match: {
          $expr: { $ne: ['$currentProjectName', '$storedProjectName'] }
        }
      },
      {
        $group: {
          _id: {
            stored: '$storedProjectName',
            current: '$currentProjectName'
          },
          count: { $sum: 1 }
        }
      }
    ]);
    
    if (mismatchedLogs.length === 0) {
      console.log('  ✅ All project names are now synchronized!');
    } else {
      console.log('  ⚠️  Still found mismatched project names:');
      mismatchedLogs.forEach(mismatch => {
        console.log(`    - "${mismatch._id.stored}" should be "${mismatch._id.current}" (${mismatch.count} entries)`);
      });
    }
    
    // Show updated copper project data
    const copperProject = await Project.findOne({ name: /copper/i });
    if (copperProject) {
      const copperLogs = await TaskLog.find({
        'tasks.project_id': copperProject._id
      });
      
      console.log(`\n🔍 Copper project verification:`);
      console.log(`  - Project name: "${copperProject.name}"`);
      console.log(`  - Task logs with this project: ${copperLogs.length}`);
      
      if (copperLogs.length > 0) {
        const sampleTask = copperLogs[0].tasks.find(t => t.project_id && t.project_id.toString() === copperProject._id.toString());
        if (sampleTask) {
          console.log(`  - Sample task project_name: "${sampleTask.project_name}"`);
        }
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('Project name update completed!');
    
  } catch (error) {
    console.error('Update failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run the update
if (require.main === module) {
  updateProjectNames()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Update script failed:', error);
      process.exit(1);
    });
}

module.exports = updateProjectNames;