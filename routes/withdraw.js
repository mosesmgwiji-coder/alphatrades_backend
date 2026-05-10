const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

// Withdraw request
router.post('/', auth, async (req, res) => {
  const { crypto, amount, address } = req.body;
  const parsedAmount = parseFloat(amount);

  if (!crypto || !parsedAmount || parsedAmount < 100) {
    return res.status(400).json({ error: 'Minimum withdrawal amount is $100.' });
  }

  if (!address || address.trim() === '') {
    return res.status(400).json({ error: 'Please provide a valid wallet address.' });
  }

  const fee = parsedAmount * 0.01; // 1% fee
  const totalDeduction = parsedAmount + fee;

  if (req.user.balance < totalDeduction) {
    // Insufficient funds, notify admin
    const adminUsers = await User.find({ isAdmin: true });
    for (const admin of adminUsers) {
      admin.notifications.unshift({
        title: 'Withdrawal Request - Insufficient Funds',
        message: `User ${req.user.username} attempted to withdraw $${parsedAmount.toFixed(2)} ${crypto} but has insufficient funds. Current balance: $${req.user.balance.toFixed(2)}.`,
        type: 'warning',
        read: false,
        createdAt: new Date()
      });
      await admin.save();
    }
    return res.status(400).json({ error: 'Insufficient funds for withdrawal including fees.' });
  }

  // Deduct balance
  req.user.balance -= totalDeduction;

  // Add withdrawal request
  req.user.withdrawalRequests.unshift({
    crypto,
    amount: parsedAmount,
    address: address.trim(),
    status: 'pending'
  });

  // Notify user
  req.user.notifications.unshift({
    title: 'Withdrawal Request Initiated',
    message: `Your withdrawal request for $${parsedAmount.toFixed(2)} ${crypto} has been initiated. Please wait while it is being processed.`,
    type: 'info',
    read: false,
    createdAt: new Date()
  });

  // Notify admin
  const adminUsers = await User.find({ isAdmin: true });
  for (const admin of adminUsers) {
    admin.notifications.unshift({
      title: 'New Withdrawal Request',
      message: `User ${req.user.username} requested withdrawal of $${parsedAmount.toFixed(2)} ${crypto} to address ${address.trim()}.`,
      type: 'info',
      read: false,
      createdAt: new Date()
    });
    await admin.save();
  }

  await req.user.save();
  res.json({ message: 'Withdrawal request submitted', balance: req.user.balance });
});

// Admin approve withdrawal
router.put('/approve/:userId/:requestId', auth, async (req, res) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  const user = await User.findById(req.params.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const request = user.withdrawalRequests.id(req.params.requestId);
  if (!request || request.status !== 'pending') {
    return res.status(404).json({ error: 'Withdrawal request not found or already processed.' });
  }

  request.status = 'approved';

  // Notify user
  user.notifications.unshift({
    title: 'Withdrawal Successful',
    message: `Your withdrawal of $${request.amount.toFixed(2)} ${request.crypto} has been processed successfully.`,
    type: 'success',
    read: false,
    createdAt: new Date()
  });

  await user.save();
  res.json({ message: 'Withdrawal approved' });
});

// Admin reject withdrawal
router.put('/reject/:userId/:requestId', auth, async (req, res) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  const user = await User.findById(req.params.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const request = user.withdrawalRequests.id(req.params.requestId);
  if (!request || request.status !== 'pending') {
    return res.status(404).json({ error: 'Withdrawal request not found or already processed.' });
  }

  request.status = 'rejected';

  // Refund the amount
  const fee = request.amount * 0.01;
  user.balance += request.amount + fee;

  // Notify user
  user.notifications.unshift({
    title: 'Withdrawal Rejected',
    message: `Your withdrawal request for $${request.amount.toFixed(2)} ${request.crypto} has been rejected.`,
    type: 'danger',
    read: false,
    createdAt: new Date()
  });

  await user.save();
  res.json({ message: 'Withdrawal rejected' });
});

module.exports = router;