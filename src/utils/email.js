// Email utility with optional nodemailer support
import { createRequire } from 'module';

let transporter = null;
let nodemailerChecked = false;

// Try to load nodemailer using createRequire (works in ESM)
const loadNodemailer = () => {
  try {
    const require = createRequire(import.meta.url);
    const nodemailer = require('nodemailer');
    return nodemailer;
  } catch (e) {
    return null;
  }
};

// Get or create email transporter
const getTransporter = () => {
  if (transporter) return transporter;
  if (nodemailerChecked) return null;
  
  const nodemailer = loadNodemailer();
  if (!nodemailer) {
    nodemailerChecked = true;
    return null;
  }
  
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    try {
      // Use port 465 (SSL) instead of 587 if EMAIL_PORT is set to 465
      const useSSL = process.env.EMAIL_PORT === '465';
      
      transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.EMAIL_PORT || '587'),
        secure: useSSL, // true for 465, false for 587
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        },
        tls: {
          rejectUnauthorized: false
        },
        // Add connection timeout
        connectionTimeout: 10000, // 10 seconds
        greetingTimeout: 10000,
        socketTimeout: 10000
      });
      console.log('✅ Email transporter configured successfully');
    } catch (error) {
      console.error('❌ Failed to create email transporter:', error.message);
    }
  } else {
    console.warn('⚠️  EMAIL_USER or EMAIL_PASS not set in environment');
  }
  
  nodemailerChecked = true;
  return transporter;
};

// Log email to console for development
const logEmailToConsole = (type, to, url) => {
  const line = '='.repeat(50);
  console.log('\n' + line);
  console.log(` 📧 ${type}`);
  console.log(line);
  console.log(` To:      ${to}`);
  console.log(` Link:    ${url}`);
  console.log(line);
  console.log(' \n ⚠️  EMAIL CONFIGURATION INCOMPLETE');
  console.log('    To enable real emails:');
  console.log('    1. Ensure nodemailer is installed: npm install nodemailer');
  console.log('    2. Add to server/.env:');
  console.log('       EMAIL_USER=your-email@gmail.com');
  console.log('       EMAIL_PASS=your-app-password');
  console.log('    3. Restart the server');
  console.log(' ' + line + '\n');
};

// Function to send verification email
export const sendVerificationEmail = async (email, token) => {
  const verificationUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/verify-email/${token}`;
  
  // Try to get transporter
  const mailer = getTransporter();
  
  // Development mode - log to console if no mailer
  if (!mailer) {
    logEmailToConsole('VERIFICATION EMAIL', email, verificationUrl);
    return { 
      success: true, 
      message: 'Email logged to console (check server logs)',
      development: true,
      verificationUrl
    };
  }

  const mailOptions = {
    from: `"Seekon" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Verify Your Email Address',
    html: `
      <h2>Verify Your Email</h2>
      <p>Thank you for registering with Seekon. Please click the link below to verify your email address:</p>
      <a href="${verificationUrl}" style="display: inline-block; padding: 10px 20px; color: white; background-color: #007bff; text-decoration: none; border-radius: 5px;">Verify Email</a>
      <p>If the button above doesn't work, copy and paste this link into your browser:</p>
      <p>${verificationUrl}</p>
      <p>This link will expire in 24 hours.</p>
      <p>If you did not create an account with Seekon, please ignore this email.</p>
    `
  };

  try {
    await mailer.sendMail(mailOptions);
    console.log(`✅ Verification email sent to ${email}`);
    return { success: true, message: 'Verification email sent successfully' };
  } catch (error) {
    console.error('❌ Error sending verification email:', error.message);
    // Fall back to console logging on connection error
    if (error.code === 'ESOCKET' || error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.log('⚠️  Email server connection failed. Falling back to console logging...');
      logEmailToConsole('VERIFICATION EMAIL', email, verificationUrl);
      return {
        success: true,
        message: 'Email logged to console (SMTP connection failed - check your network/firewall)',
        development: true,
        verificationUrl
      };
    }
    return { success: false, message: 'Failed to send verification email', error: error.message };
  }
};

// Function to send password reset email
export const sendPasswordResetEmail = async (email, token) => {
  const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password/${token}`;
  
  // Try to get transporter
  const mailer = getTransporter();
  
  // Development mode - log to console if no mailer
  if (!mailer) {
    logEmailToConsole('PASSWORD RESET EMAIL', email, resetUrl);
    return { 
      success: true, 
      message: 'Email logged to console (check server logs)',
      development: true,
      resetUrl
    };
  }
  
  const mailOptions = {
    from: `"Seekon" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Reset Your Password',
    html: `
      <h2>Password Reset Request</h2>
      <p>We received a request to reset your password. Click the link below to set a new password:</p>
      <a href="${resetUrl}" style="display: inline-block; padding: 10px 20px; color: white; background-color: #007bff; text-decoration: none; border-radius: 5px;">Reset Password</a>
      <p>If the button above doesn't work, copy and paste this link into your browser:</p>
      <p>${resetUrl}</p>
      <p>This link will expire in 10 minutes for security reasons.</p>
      <p>If you did not request a password reset, please ignore this email or contact support.</p>
    `
  };

  try {
    await mailer.sendMail(mailOptions);
    console.log(`✅ Password reset email sent to ${email}`);
    return { success: true, message: 'Password reset email sent successfully' };
  } catch (error) {
    console.error('❌ Error sending password reset email:', error.message);
    // Fall back to console logging on connection error
    if (error.code === 'ESOCKET' || error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.log('⚠️  Email server connection failed. Falling back to console logging...');
      logEmailToConsole('PASSWORD RESET EMAIL', email, resetUrl);
      return {
        success: true,
        message: 'Email logged to console (SMTP connection failed - check your network/firewall)',
        development: true,
        resetUrl
      };
    }
    return { success: false, message: 'Failed to send password reset email', error: error.message };
  }
};
