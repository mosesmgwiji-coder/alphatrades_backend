const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  balance: { type: Number, default: 0 },
  profitTotal: { type: Number, default: 0 },
  mustChangePassword: { type: Boolean, default: false },
  isAdmin: { type: Boolean, default: false },
  isBanned: { type: Boolean, default: false },
  kycDocuments: [{ type: String }], // array of file paths or URLs
  isKycVerified: { type: Boolean, default: false },
  kycDetails: {
    fullName: { type: String, default: null },
    phoneEmail: { type: String, default: null },
    country: { type: String, default: null },
    countryCode: { type: String, default: null },
    phoneNumber: { type: String, default: null },
    additionalDetails: { type: String, default: null },
    idCardFront: { type: String, default: null },
    idCardBack: { type: String, default: null },
    kycStatus: { type: String, enum: ['pending', 'verified', 'rejected'], default: null },
    submittedAt: { type: Date, default: null }
  },
  transactions: [{
    type: { type: String, enum: ['deposit', 'withdraw', 'profit'], required: true },
    crypto: { type: String, required: true },
    amount: { type: Number, required: true },
    date: { type: Date, default: Date.now }
  }],
  depositRequests: [{
    transactionId: { type: String, required: true },
    crypto: { type: String, required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
  }],
  withdrawalRequests: [{
    crypto: { type: String, required: true },
    amount: { type: Number, required: true },
    address: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
  }],
  reviewRequests: [{
    message: { type: String, default: null },
    status: { type: String, enum: ['pending', 'reviewed'], default: 'pending' },
    requestedAt: { type: Date, default: Date.now }
  }],
  passwordResetRequests: [{
    status: { type: String, enum: ['pending', 'handled'], default: 'pending' },
    requestedAt: { type: Date, default: Date.now }
  }],
  notifications: [{

    _id: { type: mongoose.Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, enum: ['info', 'success', 'warning', 'danger'], default: 'info' },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);