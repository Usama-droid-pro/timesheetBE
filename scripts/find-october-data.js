const mongoose = require('mongoose');
const TaskLog = require('../models/TaskLog');
require('dotenv').config();

async function findOctoberData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || process.env.DATABASE_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB');
    console.log('='.repeat(50));
    
    // Check for October data in different years
    const years = [2023, 2024, 2025];
    
    for (const year of years) {
      console.log(`\n📅 Checking October ${year}:`);
      
      const octStart = new Date(`${year}-10-01`);
      const octEnd = new Date(`${year}-10-31`);
      
      const octLogs = await TaskLog.find({
        date: { $gte: octStart, $lte: octEnd }
      });
      
      console.log(`  Found ${octLogs.length} task logs`);
      
      if (octLogs.length > 0) {
        // Calculate total hours
        const totalHours = octLogs.reduce((sum, log) => sum + log.totalHours, 0);
        console.log(`  Total hours: ${totalHours.toFixed(2)}`);
        
        // Show date range
        const dates = octLogs.map(log => log.date.toISOString().split('T')[0]).sort();
        console.log(`  Date range: ${dates[0]} to ${dates[dates.length - 1]}`);
        
        // Show sample entries
        console.log(`  Sample entries:`);
        octLogs.slice(0, 3).forEach(log => {
          console.log(`    - ${log.date.toISOString().split('T')[0]}: ${log.totalHours}h`);
          log.tasks.forEach(task => {
            console.log(`      * ${task.project_name}: ${task.hours}h`);
          });
        });
      }
    }
    
    // Check all data to see what date ranges we have
    console.log('\n📊 Overall data summary:');
    
    const allLogs = await TaskLog.find({}).sort({ date: 1 });
    
    if (allLogs.length > 0) {
      const firstDate = allLogs[0].date.toISOString().split('T')[0];
      const lastDate = allLogs[allLogs.length - 1].date.toISOString().split('T')[0];
      
      console.log(`  Total task logs: ${allLogs.length}`);
      console.log(`  Date range: ${firstDate} to ${lastDate}`);
      
      // Group by year-month
      const monthlyData = {};
      allLogs.forEach(log => {
        const yearMonth = log.date.toISOString().slice(0, 7); // YYYY-MM
        if (!monthlyData[yearMonth]) {
          monthlyData[yearMonth] = { count: 0, hours: 0 };
        }
        monthlyData[yearMonth].count++;
        monthlyData[yearMonth].hours += log.totalHours;
      });
      
      console.log('\n  Monthly breakdown:');
      Object.entries(monthlyData)
        .sort()
        .forEach(([month, data]) => {
          console.log(`    ${month}: ${data.count} logs, ${data.hours.toFixed(2)} hours`);
        });
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('October data search completed!');
    
  } catch (error) {
    console.error('Search failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run the search
if (require.main === module) {
  findOctoberData()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Search script failed:', error);
      process.exit(1);
    });
}

module.exports = findOctoberData;