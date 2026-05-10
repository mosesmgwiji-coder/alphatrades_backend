const express = require('express');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'your-email@gmail.com',
    pass: process.env.EMAIL_PASSWORD || 'your-app-password'
  }
});

const addNotificationToUser = (user, title, message, type = 'info') => {
  user.notifications.unshift({
    title,
    message,
    type,
    read: false,
    createdAt: new Date()
  });
  if (user.notifications.length > 100) {
    user.notifications = user.notifications.slice(0, 100);
  }
};

const sendUserEmail = (to, subject, html) => {
  const mailOptions = {
    from: process.env.EMAIL_USER || 'your-email@gmail.com',
    to,
    subject,
    html
  };
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Email send error:', error);
    } else {
      console.log('Email sent:', info.response);
    }
  });
};

// Register
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ error: 'Email or username already in use' });
    }
    const user = new User({ username, email, password });
    await user.save();
    res.status(201).json({ message: 'User registered' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { identifier, password } = req.body;
  try {
    const normalizedIdentifier = String(identifier || '').trim();
    const user = await User.findOne({
      $or: [
        { email: { $regex: `^${normalizedIdentifier}$`, $options: 'i' } },
        { username: { $regex: `^${normalizedIdentifier}$`, $options: 'i' } }
      ]
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (user.isBanned) {
      return res.status(403).json({ error: 'Your account has been banned due to security reasons. Please contact us for more information.' });
    }
    if (!(await user.matchPassword(password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, user: {
      id: user._id,
      username: user.username,
      email: user.email,
      balance: user.balance,
      profitTotal: user.profitTotal || 0,
      kycDocuments: user.kycDocuments,
      isKycVerified: user.isKycVerified,
      isAdmin: user.isAdmin,
      isBanned: user.isBanned,
      mustChangePassword: user.mustChangePassword || false
    }});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get profile
router.get('/profile', auth, async (req, res) => {
  const user = req.user.toObject();
  delete user.password;
  res.json(user);
});

// Change password
router.put('/change-password', auth, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!(await req.user.matchPassword(oldPassword))) {
    return res.status(400).json({ error: 'Old password incorrect' });
  }
  req.user.password = newPassword;
  req.user.mustChangePassword = false;
  await req.user.save();
  res.json({ message: 'Password changed' });
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const user = await User.findOne({ email: { $regex: `^${String(email).trim()}$`, $options: 'i' } });
  if (user) {
    user.passwordResetRequests.unshift({
      status: 'pending',
      requestedAt: new Date()
    });
    if (user.passwordResetRequests.length > 10) {
      user.passwordResetRequests = user.passwordResetRequests.slice(0, 10);
    }
    await user.save();
  }

  res.json({ message: 'If this email is registered, a password reset request has been submitted. Support will contact you shortly.' });
});

router.post('/review-request', async (req, res) => {
  const { identifier, message } = req.body;
  if (!identifier) {
    return res.status(400).json({ error: 'Identifier is required' });
  }

  const normalizedIdentifier = String(identifier).trim();
  const user = await User.findOne({
    $or: [
      { email: { $regex: `^${normalizedIdentifier}$`, $options: 'i' } },
      { username: { $regex: `^${normalizedIdentifier}$`, $options: 'i' } }
    ]
  });

  if (!user || !user.isBanned) {
    return res.status(200).json({ message: 'Your account review request has been submitted. Support will contact you shortly.' });
  }

  user.reviewRequests.unshift({
    message: message?.trim() || 'Account review requested by user.',
    status: 'pending',
    requestedAt: new Date()
  });
  if (user.reviewRequests.length > 20) {
    user.reviewRequests = user.reviewRequests.slice(0, 20);
  }
  addNotificationToUser(user, 'Review Request Received', 'Your account review request has been received by Alphatrade support.', 'info');
  await user.save();
  res.json({ message: 'Your account review request has been submitted. Support will contact you shortly.' });
});

router.put('/notifications/:id/read', auth, async (req, res) => {
  const notification = req.user.notifications.id(req.params.id);
  if (!notification) {
    return res.status(404).json({ error: 'Notification not found' });
  }
  notification.read = true;
  await req.user.save();
  res.json({ message: 'Notification marked as read' });
});

router.put('/notifications/read-all', auth, async (req, res) => {
  req.user.notifications.forEach((notification) => {
    notification.read = true;
  });
  await req.user.save();
  res.json({ message: 'All notifications marked as read' });
});

// Get transaction history
router.get('/transactions', auth, async (req, res) => {
  res.json(req.user.transactions.reverse()); // most recent first
});

module.exports = router;