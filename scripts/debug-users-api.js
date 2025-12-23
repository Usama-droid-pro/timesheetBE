const mongoose = require('mongoose');
const userService = require('../services/userService');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function debugUsersAPI() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    console.log('\n=== Testing Users Service ===');
    const users = await userService.getAllUsers();
    console.log(`Found ${users.length} users from service`);
    
    console.log('\n=== All Users ===');
    users.forEach(user => {
      console.log(`- ${user.name} (ID: ${user.id}, Email: ${user.email}, Role: ${user.role})`);
    });
    
    // Check if Osama is in the list
    const osamaUser = users.find(u => u.name.toLowerCase().includes('osama'));
    console.log('\n=== Osama Check ===');
    if (osamaUser) {
      console.log(`✅ Osama found in users service: ${osamaUser.name} (ID: ${osamaUser.id})`);
    } else {
      console.log('❌ Osama NOT found in users service');
    }
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugUsersAPI();