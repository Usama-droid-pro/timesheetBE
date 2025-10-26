const bcrypt = require('bcryptjs');
const User = require('../models/User');

/**
 * Seed Super Admin User
 * Creates or updates the super admin user on app startup
 */
const seedAdmin = async () => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminName = process.env.ADMIN_NAME;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminName || !adminPassword) {
      console.error('Missing admin credentials in environment variables');
      return;
    }

    // Check if admin already exists
    let admin = await User.findOne({ email: adminEmail });

    if (admin) {
      // Update existing admin
      admin.name = adminName;
      admin.password = await bcrypt.hash(adminPassword, 10);
      admin.role = 'Admin';
      admin.isDeleted = false;
      await admin.save();
      console.log('✅ Super Admin updated successfully');
    } else {
      // Create new admin
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      
      admin = new User({
        name: adminName,
        email: adminEmail,
        password: hashedPassword,
        role: 'Admin',
        isDeleted: false
      });

      await admin.save();
      console.log('✅ Super Admin created successfully');
    }

    console.log(`📧 Admin Email: ${adminEmail}`);
    console.log(`👤 Admin Name: ${adminName}`);
    console.log(`🔑 Admin Password: ${adminPassword}`);
    
  } catch (error) {
    console.error('❌ Error seeding admin:', error);
  }
};

module.exports = seedAdmin;
