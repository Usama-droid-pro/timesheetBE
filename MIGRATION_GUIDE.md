# Project ID Migration Guide

## Overview

This migration updates the task logging system to use project IDs instead of project names as the primary identifier. This change ensures data consistency when project names are updated.

## What Changed

### Before Migration
- Tasks were stored with `project_name` (string) only
- When project names changed, historical data became disconnected
- Reports and analytics relied on string matching

### After Migration
- Tasks are stored with `project_id` (ObjectId reference) as primary identifier
- `project_name` is maintained for backward compatibility and display
- System automatically resolves project names from IDs
- Historical data remains connected even when project names change

## Migration Steps

### 1. Backup Your Database
```bash
# Create a backup before running migration
mongodump --uri="your_mongodb_connection_string" --out=backup_before_migration
```

### 2. Update Backend Code
The following files have been updated:
- `models/TaskLog.js` - Updated schema to support both project_id and project_name
- `controllers/taskLogController.js` - Updated validation to accept either field
- `services/tasklogService.js` - Added project resolution logic
- `services/reportService.js` - Updated aggregation to handle both fields

### 3. Run the Migration Script
```bash
cd backend6nov
npm run migrate:project-ids
```

The migration script will:
- Find all task logs with `project_name` but no `project_id`
- Match project names to existing projects in the database
- Add `project_id` references to existing task entries
- Report any unmatched project names

### 4. Update Frontend Code
The frontend has been updated to:
- Send `project_id` as the primary identifier
- Include `project_name` for backward compatibility
- Continue displaying project names in the UI

## Verification

After migration, verify the changes:

### 1. Check Migration Results
```bash
# Run the migration script - it will show a summary
npm run migrate:project-ids
```

### 2. Test Project Name Changes
1. Update a project name in the admin panel
2. Verify that historical task logs still show the correct project
3. Verify that reports still include the project's data

### 3. Test New Task Logging
1. Create new task logs
2. Verify they use `project_id` internally
3. Verify they display project names correctly

## Rollback Plan

If you need to rollback:

### 1. Restore Database Backup
```bash
mongorestore --uri="your_mongodb_connection_string" --drop backup_before_migration
```

### 2. Revert Code Changes
```bash
git revert <migration_commit_hash>
```

## API Changes

### Task Log Creation (Backward Compatible)

**Before:**
```json
{
  "userId": "user_id",
  "date": "2024-01-15",
  "totalHours": 8,
  "tasks": [
    {
      "project_name": "Project Alpha",
      "description": "Development work",
      "hours": 8
    }
  ]
}
```

**After (Recommended):**
```json
{
  "userId": "user_id", 
  "date": "2024-01-15",
  "totalHours": 8,
  "tasks": [
    {
      "project_id": "507f1f77bcf86cd799439011",
      "project_name": "Project Alpha",
      "description": "Development work", 
      "hours": 8
    }
  ]
}
```

**Legacy Support:**
The old format with only `project_name` is still supported but not recommended for new implementations.

## Database Schema Changes

### TaskLog Model
```javascript
// Before
tasks: [{
  project_name: { type: String, required: true },
  description: String,
  hours: Number
}]

// After  
tasks: [{
  project_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Project',
    required: function() { return !this.project_name; }
  },
  project_name: { 
    type: String,
    required: function() { return !this.project_id; }
  },
  description: String,
  hours: Number
}]
```

## Troubleshooting

### Migration Issues

**Problem:** Migration script reports unmatched project names
**Solution:** 
1. Check if projects exist in the database
2. Create missing projects or manually map old names to existing projects
3. Clean up invalid historical data if necessary

**Problem:** Reports showing incorrect data after migration
**Solution:**
1. Verify migration completed successfully
2. Check that report aggregation pipelines are updated
3. Clear any cached data

### Performance Considerations

- The migration adds project lookups to aggregation pipelines
- Consider adding indexes on `tasks.project_id` for large datasets
- Monitor query performance after migration

## Support

If you encounter issues during migration:
1. Check the migration script output for detailed error messages
2. Verify database connectivity and permissions
3. Ensure all projects referenced in task logs exist in the projects collection
4. Contact the development team with specific error messages

## Post-Migration Cleanup

After successful migration and verification:
1. Consider removing `project_name` fields from new task entries (optional)
2. Update any custom scripts or integrations to use `project_id`
3. Monitor system performance and optimize queries if needed