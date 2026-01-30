import Transaction from '../models/Transaction.js';
import crypto from 'crypto';
import axios from 'axios';

// M-Pesa OAuth token (Production API)
const getMpesaAccessToken = async () => {
  try {
    const consumerKey = process.env.CONSUMER_KEY || process.env.DARAJA_CONSUMER_KEY;
    const consumerSecret = process.env.CONSUMER_SECRET || process.env.DARAJA_CONSUMER_SECRET;
    
    if (!consumerKey || !consumerSecret) {
      throw new Error('M-Pesa credentials not configured. Please add CONSUMER_KEY and CONSUMER_SECRET to .env');
    }

    console.log('🔐 Getting M-Pesa access token from production API...');
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    // Use PRODUCTION API endpoint (not sandbox)
    const response = await axios.get('https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
      headers: {
        'Authorization': `Basic ${auth}`
      }
    });

    console.log('✅ M-Pesa access token retrieved successfully');
    return response.data.access_token;
  } catch (error) {
    console.error('❌ Error getting M-Pesa access token:', error.response?.data || error.message);
    throw error;
  }
};

// Generate password for M-Pesa
const generatePassword = () => {
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
  const shortcode = process.env.SHORTCODE || process.env.DARAJA_BUSINESS_SHORTCODE;
  const passkey = process.env.PASSKEY || process.env.DARAJA_PASS_KEY;
  
  if (!shortcode || !passkey) {
    throw new Error('M-Pesa shortcode or passkey not configured. Please add SHORTCODE and PASSKEY to .env');
  }

  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
  return { password, timestamp };
};

// M-Pesa STK Push
export const initiateMpesaPayment = async (req, res) => {
  try {
    const { phoneNumber, amount, userEmail } = req.body;

    console.log('📥 Received payment request:', { phoneNumber, amount, userEmail });

    if (!phoneNumber || !amount || !userEmail) {
      return res.status(400).json({
        success: false,
        message: 'Phone number, amount, and email are required'
      });
    }

    // Validate Kenyan phone number
    const formattedPhone = phoneNumber.startsWith('254') 
      ? phoneNumber 
      : phoneNumber.replace(/^0/, '254');

    console.log('📱 Formatted phone number:', formattedPhone);

    if (!formattedPhone.startsWith('254')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Kenyan phone number format'
      });
    }

    // Generate reference
    const reference = `MPESA${Date.now()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    // Create transaction record
    const transaction = await Transaction.create({
      userEmail,
      phoneNumber: formattedPhone,
      method: 'mpesa',
      amount: parseFloat(amount),
      status: 'pending',
      reference
    });

    // Check if credentials are set up
    const hasCredentials = 
      (process.env.CONSUMER_KEY || process.env.DARAJA_CONSUMER_KEY) &&
      (process.env.CONSUMER_SECRET || process.env.DARAJA_CONSUMER_SECRET) &&
      (process.env.SHORTCODE || process.env.DARAJA_BUSINESS_SHORTCODE) &&
      (process.env.PASSKEY || process.env.DARAJA_PASS_KEY);

    if (!hasCredentials) {
      console.log('⚠️ M-Pesa credentials not configured. Running in mock mode.');
      return res.status(200).json({
        success: true,
        message: 'Mock: STK Push would be sent. Please configure M-Pesa credentials in .env file.',
        mock: true,
        data: {
          transactionId: transaction._id,
          reference,
          checkoutRequestID: 'MOCK_CHECKOUT_123'
        }
      });
    }

    // Get access token
    const accessToken = await getMpesaAccessToken();

    // Generate password
    const { password, timestamp } = generatePassword();

    // STK Push request
    const shortcode = process.env.SHORTCODE || process.env.DARAJA_BUSINESS_SHORTCODE;
    const callbackURL = process.env.CALLBACK_URL || 'http://localhost:3000';

    const stkPushData = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: formattedPhone,
      PartyB: shortcode,
      PhoneNumber: formattedPhone,
      CallBackURL: `${callbackURL}/api/payment/mpesa-callback`,
      AccountReference: reference,
      TransactionDesc: 'Seekon Apparel Purchase'
    };

    console.log('📤 Sending STK Push request:', {
      phone: formattedPhone,
      amount,
      reference
    });

    console.log('📤 Sending STK Push to PRODUCTION API...');
    const response = await axios.post(
      'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      stkPushData,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ STK Push response:', response.data);

    // Update transaction with M-Pesa response
    transaction.mpesaResponse = response.data;
    await transaction.save();

    res.status(200).json({
      success: true,
      message: 'STK Push sent. Please complete the payment on your phone.',
      data: {
        transactionId: transaction._id,
        reference,
        checkoutRequestID: response.data.CheckoutRequestID
      }
    });
  } catch (error) {
    console.error('❌ M-Pesa payment error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: error.response?.data?.errorMessage || error.message || 'Failed to initiate M-Pesa payment',
      error: error.response?.data || { message: error.message }
    });
  }
};

// M-Pesa Callback
export const mpesaCallback = async (req, res) => {
  try {
    const callbackData = req.body;

    if (callbackData.Body?.stkCallback) {
      const callback = callbackData.Body.stkCallback;
      const resultCode = callback.ResultCode;
      const checkoutRequestID = callback.CheckoutRequestID;

      // Find transaction by checkout request ID
      const transaction = await Transaction.findOne({
        'mpesaResponse.CheckoutRequestID': checkoutRequestID
      });

      if (transaction) {
        if (resultCode === 0) {
          // Payment successful
          transaction.status = 'completed';
          transaction.callbackData = callback;
        } else {
          // Payment failed
          transaction.status = 'failed';
          transaction.callbackData = callback;
        }

        await transaction.save();
      }
    }

    res.status(200).json({
      success: true,
      message: 'Callback received'
    });
  } catch (error) {
    console.error('M-Pesa callback error:', error);
    res.status(500).json({
      success: false,
      message: 'Callback processing failed'
    });
  }
};

// Flutterwave Payment
export const initiateFlutterwavePayment = async (req, res) => {
  try {
    const { email, amount, userEmail } = req.body;

    if (!email || !amount || !userEmail) {
      return res.status(400).json({
        success: false,
        message: 'Email, amount, and user email are required'
      });
    }

    // Generate reference
    const reference = `FLW${Date.now()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    // Create transaction record
    const transaction = await Transaction.create({
      userEmail,
      phoneNumber: email, // Store email as phoneNumber for Flutterwave
      method: 'card',
      amount: parseFloat(amount),
      status: 'pending',
      reference
    });

    // Flutterwave payment request
    const paymentData = {
      tx_ref: reference,
      amount: amount,
      currency: 'KES',
      redirect_url: `${process.env.CALLBACK_URL}/api/payment/flutterwave-callback`,
      payment_options: 'card,mpesa',
      customer: {
        email: email,
        name: userEmail
      },
      customizations: {
        title: 'Seekon Apparel',
        description: 'Premium clothing and sneakers'
      }
    };

    const response = await axios.post(
      'https://api.flutterwave.com/v3/payments',
      paymentData,
      {
        headers: {
          'Authorization': `Bearer ${process.env.FLW_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Update transaction with Flutterwave response
    transaction.flutterwaveResponse = response.data;
    await transaction.save();

    res.status(200).json({
      success: true,
      message: 'Payment link generated',
      data: {
        transactionId: transaction._id,
        reference,
        paymentLink: response.data.data.link
      }
    });
  } catch (error) {
    console.error('Flutterwave payment error:', error);
    res.status(500).json({
      success: false,
      message: error.response?.data?.message || 'Failed to initiate Flutterwave payment'
    });
  }
};

// Flutterwave Callback
export const flutterwaveCallback = async (req, res) => {
  try {
    const { status, tx_ref } = req.query;

    // Find transaction by reference
    const transaction = await Transaction.findOne({ reference: tx_ref });

    if (transaction) {
      if (status === 'successful') {
        transaction.status = 'completed';
      } else {
        transaction.status = 'failed';
      }
      transaction.callbackData = req.query;
      await transaction.save();
    }

    // Redirect to frontend
    res.redirect(`${process.env.FRONTEND_URL}/checkout-success?status=${status}`);
  } catch (error) {
    console.error('Flutterwave callback error:', error);
    res.status(500).json({
      success: false,
      message: 'Callback processing failed'
    });
  }
};

// Get User Transactions
export const getUserTransactions = async (req, res) => {
  try {
    const { userEmail } = req.params;

    const transactions = await Transaction.find({ userEmail })
      .sort({ createdAt: -1 })
      .limit(50);

    res.status(200).json({
      success: true,
      transactions
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions'
    });
  }
};
