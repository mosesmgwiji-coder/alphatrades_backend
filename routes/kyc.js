const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const auth = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage });

// Configure email (update with your email service credentials)
const transporter = nodemailer.createTransport({
  service: 'gmail', // or your email service
  auth: {
    user: process.env.EMAIL_USER || 'your-email@gmail.com',
    pass: process.env.EMAIL_PASSWORD || 'your-app-password'
  }
});

router.post('/upload', auth, upload.fields([
  { name: 'idCardFront', maxCount: 1 },
  { name: 'idCardBack', maxCount: 1 }
]), async (req, res) => {
  try {
    const { fullName, phoneEmail, country, countryCode, phoneNumber, additionalDetails } = req.body;

    // Validate required fields
    if (!fullName || !phoneEmail || !country || !phoneNumber || !additionalDetails) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    if (!req.files || !req.files.idCardFront || !req.files.idCardBack) {
      return res.status(400).json({ error: 'Both ID card front and back are required.' });
    }

    // Update user KYC details
    const user = req.user;
    user.kycDetails = {
      fullName,
      phoneEmail,
      country,
      countryCode,
      phoneNumber,
      additionalDetails,
      idCardFront: req.files.idCardFront[0].path,
      idCardBack: req.files.idCardBack[0].path,
      kycStatus: 'pending',
      submittedAt: new Date()
    };

    await user.save();

    // Send confirmation email
    const mailOptions = {
      from: process.env.EMAIL_USER || 'your-email@gmail.com',
      to: phoneEmail,
      subject: 'KYC Submission - Under Review',
      html: `
        <h2>Your KYC Submission is Under Review</h2>
        <p>Hello ${fullName},</p>
        <p>Thank you for submitting your KYC details. We have received your submission and it is now under review.</p>
        <p><strong>Review Timeline:</strong> You will receive a confirmation email within 30 minutes.</p>
        <br/>
        <h3>Submitted Information:</h3>
        <ul>
          <li><strong>Full Name:</strong> ${fullName}</li>
          <li><strong>Email:</strong> ${phoneEmail}</li>
          <li><strong>Country:</strong> ${country}</li>
          <li><strong>Phone Number:</strong> ${countryCode}${phoneNumber}</li>
        </ul>
        <p>If you have any questions, please contact our support team.</p>
        <br/>
        <p>Best regards,<br/>Charity Website Team</p>
      `
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log('Email send error:', error);
        // Don't fail the request if email fails
      } else {
        console.log('Email sent: ' + info.response);
      }
    });

    res.json({ 
      message: 'KYC submitted successfully. Your submission is under review. You will receive a confirmation email within 30 minutes.',
      kycStatus: 'pending'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;