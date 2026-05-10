const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const User = require('./models/User');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

mongoose.set('strictQuery', false);

// Connect to MongoDB with retry logic
const connectDB = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('MongoDB connected successfully');
    await createAdminUser();
  } catch (err) {
    console.log('MongoDB connection failed:', err.message);
    console.log('Please check:');
    console.log('   - MongoDB Atlas cluster is running');
    console.log('   - Network connection is stable');
    console.log('   - IP whitelist includes your current IP');
    console.log('   - Database user credentials are correct');
    console.log('Running in offline mode - database operations will fail');
  }
};

const createAdminUser = async () => {
  try {
    const existingAdmin = await User.findOne({ username: 'admin' });
    if (!existingAdmin) {
      const adminUser = new User({
        username: 'admin',
        email: 'admin@charity.com',
        password: 'victor@2026',
        isAdmin: true,
        balance: 0
      });
      await adminUser.save();
      console.log('Admin user created: username=admin password=victor@2026');
    } else {
      existingAdmin.isAdmin = true;
      existingAdmin.email = existingAdmin.email || 'admin@charity.com';
      existingAdmin.password = 'victor@2026';
      await existingAdmin.save();
      console.log('Existing admin user reset with username=admin and password=victor@2026');
    }
  } catch (error) {
    console.error('Error creating admin user:', error.message);
  }
};

connectDB();

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/kyc', require('./routes/kyc'));
app.use('/api/deposit', require('./routes/deposit'));
app.use('/api/withdraw', require('./routes/withdraw'));
app.use('/api/admin', require('./routes/admin'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  const statusMessages = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };

  res.json({
    status: 'ok',
    dbConnected: dbStatus === 1,
    dbStatus: statusMessages[dbStatus] || 'unknown',
    serverTime: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(err.status || 500).json({ 
    error: err.message || 'Internal server error' 
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\nServer running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
  console.log(`Health check: http://localhost:${PORT}/api/health\n`);
});