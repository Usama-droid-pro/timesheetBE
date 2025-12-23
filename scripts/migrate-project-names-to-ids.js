const mongoose = require('mongoose');
const Project = require('../models/Project');
const TaskLog = require('../models/TaskLog');
require('dotenv').config();

async function migrateProjectNamesToIds() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || process.env.DATABASE_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB');
    
    // Get all projects to create a name-to-id mapping
    const projects = await Project.find({});
    const projectNameToId = {};
    
    projects.forEach(project => {
      projectNameToId[project.name] = project._id;
    });
    
    console.log(`Found ${projects.length} projects:`, Object.keys(projectNameToId));
    
    // Get all task logs that have project_name but no project_id
    const taskLogs = await TaskLog.find({
      'tasks.project_name': { $exists: true },
      'tasks.project_id': { $exists: false }
    });
    
    console.log(`Found ${taskLogs.length} task logs to migrate`);
    
    let migratedCount = 0;
    let errorCount = 0;
    const unmatchedProjects = new Set();
    
    for (const taskLog of taskLogs) {
      try {
        let hasChanges = false;
        
        // Update each task in the task log
        for (const task of taskLog.tasks) {
          if (task.project_name && !task.project_id) {
            const projectId = projectNameToId[task.project_name];
            
            if (projectId) {
              task.project_id = projectId;
              hasChanges = true;
              console.log(`Mapping "${task.project_name}" to ID: ${projectId}`);
            } else {
              unmatchedProjects.add(task.project_name);
              console.warn(`No project found for name: "${task.project_name}"`);
            }
          }
        }
        
        if (hasChanges) {
          await taskLog.save();
          migratedCount++;
          
          if (migratedCount % 10 === 0) {
            console.log(`Migrated ${migratedCount} task logs...`);
          }
        }
      } catch (error) {
        console.error(`Error migrating task log ${taskLog._id}:`, error.message);
        errorCount++;
      }
    }
    
    console.log('\n=== Migration Summary ===');
    console.log(`Successfully migrated: ${migratedCount} task logs`);
    console.log(`Errors encountered: ${errorCount}`);
    
    if (unmatchedProjects.size > 0) {
      console.log(`\nUnmatched project names (${unmatchedProjects.size}):`);
      unmatchedProjects.forEach(name => console.log(`  - "${name}"`));
      console.log('\nYou may need to:');
      console.log('1. Create missing projects in the database');
      console.log('2. Manually map these project names to existing projects');
      console.log('3. Clean up old data with invalid project names');
    }
    
    // Verify migration
    const remainingOldFormat = await TaskLog.countDocuments({
      'tasks.project_name': { $exists: true },
      'tasks.project_id': { $exists: false }
    });
    
    const newFormatCount = await TaskLog.countDocuments({
      'tasks.project_id': { $exists: true }
    });
    
    console.log(`\n=== Verification ===`);
    console.log(`Task logs still using project_name only: ${remainingOldFormat}`);
    console.log(`Task logs now using project_id: ${newFormatCount}`);
    
    console.log('\nMigration completed successfully!');
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run the migration
if (require.main === module) {
  migrateProjectNamesToIds()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = migrateProjectNamesToIds;