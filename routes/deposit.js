const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

// Get deposit addresses
router.get('/addresses', auth, (req, res) => {
  const addresses = {
    'USDT-TRC20': 'TCe2pnTCySb63LDVpcBXe7Mz6wCaBadTHe',
    'Ethereum-ERC20': '0x62aa197f1361e126c001a63bcb3c8e4833e2f609',
    'USDC-ERC20': '0x62aa197f1361e126c001a63bcb3c8e4833e2f609'
  };
  res.json(addresses);
});

// Simulate deposit (in real app, listen to blockchain)
router.post('/deposit', auth, async (req, res) => {
  const { crypto, amount, transactionId } = req.body;
  if (!transactionId || !transactionId.trim()) {
    return res.status(400).json({ error: 'Transaction ID is required.' });
  }
  const parsedAmount = parseFloat(amount);
  if (!crypto || !parsedAmount || parsedAmount <= 0) {
    return res.status(400).json({ error: 'A valid crypto type and amount are required.' });
  }

  req.user.depositRequests.unshift({
    transactionId: transactionId.trim(),
    crypto,
    amount: parsedAmount,
    status: 'pending'
  });
  req.user.notifications.unshift({
    title: 'Deposit Request Received',
    message: `Your deposit request for ${parsedAmount.toFixed(2)} ${crypto} has been received with transaction ID ${transactionId.trim()}. Please wait while Alphatrade verifies your payment.`,
    type: 'info',
    read: false,
    createdAt: new Date()
  });

  // Notify admin
  const adminUsers = await User.find({ isAdmin: true });
  for (const admin of adminUsers) {
    admin.notifications.unshift({
      title: 'New Deposit Request',
      message: `User ${req.user.username} submitted a deposit request for $${parsedAmount.toFixed(2)} ${crypto} with transaction ID ${transactionId.trim()}.`,
      type: 'info',
      read: false,
      createdAt: new Date()
    });
    await admin.save();
  }

  await req.user.save();
  res.json({ message: 'Deposit request submitted', status: 'pending' });
});

// Admin approve deposit
router.put('/approve/:userId/:requestId', auth, async (req, res) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  const user = await User.findById(req.params.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const request = user.depositRequests.id(req.params.requestId);
  if (!request || request.status !== 'pending') {
    return res.status(404).json({ error: 'Deposit request not found or already processed.' });
  }

  request.status = 'approved';
  user.balance += request.amount;

  // Add to transactions
  user.transactions.push({
    type: 'deposit',
    crypto: request.crypto,
    amount: request.amount
  });

  // Notify user
  user.notifications.unshift({
    title: 'Deposit Successful',
    message: `Your deposit of $${request.amount.toFixed(2)} ${request.crypto} has been credited to your account.`,
    type: 'success',
    read: false,
    createdAt: new Date()
  });

  await user.save();
  res.json({ message: 'Deposit approved' });
});

// Admin reject deposit
router.put('/reject/:userId/:requestId', auth, async (req, res) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  const user = await User.findById(req.params.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const request = user.depositRequests.id(req.params.requestId);
  if (!request || request.status !== 'pending') {
    return res.status(404).json({ error: 'Deposit request not found or already processed.' });
  }

  request.status = 'rejected';

  // Notify user
  user.notifications.unshift({
    title: 'Deposit Rejected',
    message: `Your deposit request for $${request.amount.toFixed(2)} ${request.crypto} has been rejected.`,
    type: 'danger',
    read: false,
    createdAt: new Date()
  });

  await user.save();
  res.json({ message: 'Deposit rejected' });
});

module.exports = router;