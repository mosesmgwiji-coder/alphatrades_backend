const express = require('express');
const User = require('../models/User');
const admin = require('../middleware/admin');
const nodemailer = require('nodemailer');

const router = express.Router();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'your-email@gmail.com',
    pass: process.env.EMAIL_PASSWORD || 'your-app-password'
  }
});

const sendStatusEmail = (to, fullName, status) => {
  const subject = status === 'verified' ? 'KYC Approved' : 'KYC Rejected';
  const message = status === 'verified'
    ? `<p>Hello ${fullName},</p><p>Your KYC verification has been approved. You can now access full account functionality.</p><p>Thank you for completing the verification process.</p>`
    : `<p>Hello ${fullName},</p><p>Unfortunately, your KYC verification has been rejected. Please review your submitted documents and try again.</p><p>If you need assistance, contact support.</p>`;

  const mailOptions = {
    from: process.env.EMAIL_USER || 'your-email@gmail.com',
    to,
    subject,
    html: `
      <h2>${subject}</h2>
      ${message}
      <p>Best regards,<br/>Charity Website Team</p>
    `
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Admin email send error:', error);
    } else {
      console.log('Admin email sent:', info.response);
    }
  });
};

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

router.get('/users', admin, async (req, res) => {
  try {
    const users = await User.find().select('username email balance profitTotal isKycVerified isBanned isAdmin kycDetails depositRequests withdrawalRequests reviewRequests createdAt updatedAt');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/kyc/:id', admin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('username email balance isBanned isKycVerified kycDetails');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/kyc/:id/approve', admin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.isKycVerified = true;
    user.kycDetails.kycStatus = 'verified';
    addNotificationToUser(user, 'KYC Approved', 'Your KYC verification has been approved. Your account is now fully active.', 'success');
    await user.save();

    if (user.kycDetails.phoneEmail) {
      sendStatusEmail(user.kycDetails.phoneEmail, user.kycDetails.fullName || user.username, 'verified');
    }

    res.json({ message: 'KYC approved successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/kyc/:id/reject', admin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.isKycVerified = false;
    user.kycDetails.kycStatus = 'rejected';
    addNotificationToUser(user, 'KYC Rejected', 'Your KYC submission has been rejected. Please review your documents and try again.', 'warning');
    await user.save();

    if (user.kycDetails.phoneEmail) {
      sendStatusEmail(user.kycDetails.phoneEmail, user.kycDetails.fullName || user.username, 'rejected');
    }

    res.json({ message: 'KYC rejected successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/users/:id/reset-password', admin, async (req, res) => {
  try {
    const password = req.body.password || req.body.newPassword;
    if (!password || typeof password !== 'string' || password.trim().length < 6) {
      return res.status(400).json({ error: 'A valid password of at least 6 characters is required.' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.password = password.trim();
    await user.save();

    res.json({ message: 'User password has been reset successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/users/:id/notify', admin, async (req, res) => {
  try {
    const { title, message, type } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!title || !message) return res.status(400).json({ error: 'Title and message are required' });

    addNotificationToUser(user, title, message, type || 'info');
    await user.save();

    res.json({ message: 'Notification sent successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/users/:id/balance', admin, async (req, res) => {
  try {
    const rawBalance = req.body.balance;
    let balance = rawBalance;
    if (typeof rawBalance === 'string') {
      balance = parseFloat(rawBalance.replace(/,/g, ''));
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (typeof balance !== 'number' || Number.isNaN(balance) || balance < 0) {
      return res.status(400).json({ error: 'Balance must be a valid non-negative number' });
    }

    user.balance = balance;
    await user.save();

    res.json({ message: 'User balance updated successfully', balance: user.balance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/users/:id/profit', admin, async (req, res) => {
  try {
    const rawAmount = req.body.amount;
    const amount = typeof rawAmount === 'string' ? parseFloat(rawAmount.replace(/,/g, '')) : rawAmount;
    const description = req.body.description?.trim() || 'Profit added by admin';
    if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Profit amount must be a valid positive number' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.profitTotal = (user.profitTotal || 0) + amount;
    user.balance = (user.balance || 0) + amount;
    user.transactions.push({ type: 'profit', crypto: 'Profit', amount, date: new Date() });
    addNotificationToUser(user, 'Profit Added', `Alphatrade has added $${amount.toFixed(2)} in profit to your account.`, 'success');
    await user.save();

    res.json({ message: 'Profit added successfully', balance: user.balance, profitTotal: user.profitTotal });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/users/:id/ban', admin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.isAdmin) return res.status(403).json({ error: 'Cannot ban an admin account' });

    user.isBanned = true;
    await user.save();
    res.json({ message: 'User account banned successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/users/:id/unban', admin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.isBanned = false;
    await user.save();
    res.json({ message: 'User account unbanned successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/users/:id', admin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.isAdmin) return res.status(403).json({ error: 'Cannot delete an admin account' });

    await user.deleteOne();
    res.json({ message: 'User account deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/users/:id/reset-password-request/:requestId/handle', admin, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 6) {
      return res.status(400).json({ error: 'A valid password of at least 6 characters is required.' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const request = user.passwordResetRequests.id(req.params.requestId);
    if (!request) return res.status(404).json({ error: 'Password reset request not found' });

    user.password = newPassword.trim();
    user.mustChangePassword = false;
    request.status = 'handled';

    const subject = 'Alphatrade Password Reset';
    const html = `
      <h2>Your Password Has Been Reset</h2>
      <p>Hello ${user.username},</p>
      <p>Your password has been reset by our support team. Your new password is:</p>
      <p style="font-size: 18px; font-weight: bold; color: #333; background: #f0f0f0; padding: 10px; border-radius: 5px;">${newPassword.trim()}</p>
      <p>Please log in with this password and change it immediately from the Security section of your dashboard.</p>
      <p>If you did not request this reset, please contact support immediately.</p>
      <p>Best regards,<br/>Alphatrade Support Team</p>
    `;
    sendUserEmail(user.email, subject, html);

    await user.save();

    res.json({ message: 'Password reset successfully and email sent to user' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/users/:id/reset-password-request/:requestId', admin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.passwordResetRequests.id(req.params.requestId).remove();
    await user.save();

    res.json({ message: 'Password reset request deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
