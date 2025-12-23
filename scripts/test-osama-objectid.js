const mongoose = require('mongoose');

// Test ObjectId conversion for Osama's ID
const osamaId = '6904a2a9988e2a6a7facf3a5';

console.log('Testing ObjectId conversion for Osama ID:', osamaId);

try {
  const objectId = new mongoose.Types.ObjectId(osamaId);
  console.log('✅ ObjectId conversion successful:', objectId);
  console.log('String representation:', objectId.toString());
  console.log('Equals original string:', objectId.toString() === osamaId);
} catch (error) {
  console.log('❌ ObjectId conversion failed:', error.message);
}

// Test if it's a valid ObjectId format
console.log('Is valid ObjectId format:', mongoose.Types.ObjectId.isValid(osamaId));