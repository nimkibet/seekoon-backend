import Transaction from '../models/Transaction.js';
import Order from '../models/Order.js';
import Cart from '../models/Cart.js';
import Notification from '../models/Notification.js';
import crypto from 'crypto';
import axios from 'axios';

// M-Pesa OAuth token (Production API)
const getMpesaAccessToken = async () => {
  try {
    const consumerKey = process.env.CONSUMER_KEY || process.env.DARAJA_CONSUMER_KEY || process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = process.env.CONSUMER_SECRET || process.env.DARAJA_CONSUMER_SECRET || process.env.MPESA_CONSUMER_SECRET;
    
    if (!consumerKey || !consumerSecret) {
      throw new Error('M-Pesa credentials not configured. Please add CONSUMER_KEY and CONSUMER_SECRET to .env');
    }

    // Check environment - use sandbox or production
    const isSandbox = process.env.MPESA_ENVIRONMENT === 'sandbox';
    const baseUrl = isSandbox 
      ? 'https://sandbox.safaricom.co.ke' 
      : 'https://api.safaricom.co.ke';

    console.log(isSandbox ? '🔐 Getting M-Pesa access token from SANDBOX API...' : '🔐 Getting M-Pesa access token from PRODUCTION API...');
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    // Use appropriate API endpoint based on environment
    const response = await axios.get(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
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
  const shortcode = process.env.SHORTCODE || process.env.DARAJA_BUSINESS_SHORTCODE || process.env.MPESA_SHORTCODE;
  const passkey = process.env.PASSKEY || process.env.DARAJA_PASS_KEY || process.env.MPESA_PASSKEY;
  
  // Default sandbox passkey for testing
  const defaultPasskey = 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';
  const finalPasskey = process.env.MPESA_ENVIRONMENT === 'sandbox' ? defaultPasskey : passkey;

  if (!shortcode) {
    throw new Error('M-Pesa shortcode not configured. Please add SHORTCODE to .env');
  }

  if (!finalPasskey) {
    throw new Error('M-Pesa passkey not configured. Please add PASSKEY to .env');
  }

  const password = Buffer.from(`${shortcode}${finalPasskey}${timestamp}`).toString('base64');
  return { password, timestamp };
};

// M-Pesa STK Push
export const initiateMpesaPayment = async (req, res) => {
  try {
    // Extract raw values from request body
    const rawPhone = req.body.phone || req.body.phoneNumber;
    let rawAmount = req.body.amount;
    const { userEmail, orderId } = req.body;

    console.log('📥 Received payment request:', { rawPhone, rawAmount, userEmail, orderId });

    if (!rawPhone || !userEmail) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and email are required'
      });
    }

    // SECURITY: Recalculate total from database if orderId is provided
    // This ensures the amount cannot be manipulated from the frontend
    if (orderId) {
      try {
        const order = await Order.findById(orderId);
        if (order) {
          // Recalculate total from order items stored in database
          const calculatedTotal = order.items.reduce((sum, item) => {
            return sum + (item.price * item.quantity);
          }, 0);
          rawAmount = calculatedTotal;
          console.log('🔒 Recalculated total from database:', rawAmount);
        }
      } catch (calcError) {
        console.error('⚠️ Error recalculating order total:', calcError.message);
        // Fall back to frontend amount if calculation fails
      }
    }

    if (!rawAmount) {
      return res.status(400).json({
        success: false,
        message: 'Amount is required'
      });
    }

    // 1. Format Phone Number: Strip all non-numeric characters (removes the '+')
    let formattedPhone = rawPhone.replace(/\D/g, '');
    
    // If it starts with '0', replace '0' with '254'
    if (formattedPhone.startsWith('0')) {
      formattedPhone = `254${formattedPhone.substring(1)}`;
    }
    
    console.log(`📱 Cleaned Phone: ${formattedPhone}`);

    if (!formattedPhone.startsWith('254')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Kenyan phone number format'
      });
    }

    // 2. Format Amount: Safaricom requires strict integers
    const finalAmount = Math.round(Number(rawAmount));
    console.log(`💰 Cleaned Amount: ${finalAmount}`);

    // Generate reference - will be used to create Transaction upon successful payment
    const reference = `MPESA${Date.now()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    // Check if credentials are set up
    const hasCredentials = 
      (process.env.CONSUMER_KEY || process.env.DARAJA_CONSUMER_KEY || process.env.MPESA_CONSUMER_KEY) &&
      (process.env.CONSUMER_SECRET || process.env.DARAJA_CONSUMER_SECRET || process.env.MPESA_CONSUMER_SECRET) &&
      (process.env.SHORTCODE || process.env.DARAJA_BUSINESS_SHORTCODE || process.env.MPESA_SHORTCODE);

    // Determine environment and base URL
    const isSandbox = process.env.MPESA_ENVIRONMENT === 'sandbox';

    if (!hasCredentials) {
      console.log('⚠️ M-Pesa credentials not configured. Running in mock mode.');
      return res.status(200).json({
        success: true,
        message: 'Mock: STK Push would be sent. Please configure M-Pesa credentials in .env file.',
        mock: true,
        data: {
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
    const shortcode = process.env.SHORTCODE || process.env.DARAJA_BUSINESS_SHORTCODE || process.env.MPESA_SHORTCODE;
    
    // PRODUCTION: Use Railway callback URL
    const CallBackURL = 'https://seekoon-backend-production.up.railway.app/api/payment/mpesa-callback';
    console.log('🎯 Using CallBackURL:', CallBackURL);

    // Determine base URL based on environment
    const stkPushUrl = isSandbox
      ? 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest'
      : 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest';

    // For sandbox testing, force amount to 1
    const amountForSTK = isSandbox ? 1 : finalAmount;

    const stkPushData = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amountForSTK,
      PartyA: formattedPhone,
      PartyB: shortcode,
      PhoneNumber: formattedPhone,
      CallBackURL: CallBackURL,
      AccountReference: reference,
      TransactionDesc: 'Seekon Apparel Purchase'
    };

    console.log('🚀 Payload being sent to Safaricom:', JSON.stringify(stkPushData, null, 2));

    console.log('📤 Sending STK Push request:', {
      phone: formattedPhone,
      amount: amountForSTK,
      reference,
      callbackURL: CallBackURL,
      environment: isSandbox ? 'sandbox' : 'production'
    });

    console.log(isSandbox ? '📤 Sending STK Push to SANDBOX API...' : '📤 Sending STK Push to PRODUCTION API...');
    const response = await axios.post(
      stkPushUrl,
      stkPushData,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ STK Push response:', response.data);

    // If orderId is provided, save the CheckoutRequestID to the order
    if (orderId && response.data.CheckoutRequestID) {
      try {
        await Order.findByIdAndUpdate(orderId, {
          mpesaCheckoutRequestId: response.data.CheckoutRequestID,
          paymentReference: reference
        });
        console.log(`✅ Saved CheckoutRequestID ${response.data.CheckoutRequestID} to order ${orderId}`);
      } catch (orderError) {
        console.error('⚠️ Error saving CheckoutRequestID to order:', orderError.message);
      }
    }

    res.status(200).json({
      success: true,
      message: 'STK Push sent. Please complete the payment on your phone.',
      data: {
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
  console.log("🔥 ALERT: DARAJA CALLBACK HIT THE SERVER!");
  console.log("📦 RAW PAYLOAD:", JSON.stringify(req.body, null, 2));
  console.log("📋 HEADERS:", JSON.stringify(req.headers, null, 2));
  try {
    const callbackData = req.body;
    console.log('📥 M-Pesa Callback Received:', JSON.stringify(callbackData));

    if (callbackData.Body?.stkCallback) {
      const callback = callbackData.Body.stkCallback;
      const resultCode = callback.ResultCode;
      const checkoutRequestID = callback.CheckoutRequestID;

      if (resultCode === 0) {
        // Payment successful - extract metadata
        const meta = callback.CallbackMetadata?.Item || [];
        const amountPaid = meta.find(item => item.Name === 'Amount')?.Value;
        const mpesaReceipt = meta.find(item => item.Name === 'MpesaReceiptNumber')?.Value;
        const phoneNumber = meta.find(item => item.Name === 'PhoneNumber')?.Value;
        
        console.log(`✅ Payment SUCCESS! Receipt: ${mpesaReceipt}, Amount: ${amountPaid}, Phone: ${phoneNumber}`);
        
        // Find the order first to get user info
        let order = null;
        try {
          order = await Order.findOne({ mpesaCheckoutRequestId: checkoutRequestID });
        } catch (orderError) {
          console.error('⚠️ Error finding order:', orderError.message);
        }

        // Get userEmail from order or use phone number as fallback
        const userEmail = order?.userEmail || (phoneNumber ? `${phoneNumber}@mpesa.com` : 'unknown@seekon.com');

        // Create Transaction ONLY when payment succeeds
        try {
          await Transaction.create({
            userEmail,
            phoneNumber: phoneNumber || '',
            method: 'mpesa',
            amount: amountPaid || 0,
            status: 'completed',
            reference: order?.paymentReference || checkoutRequestID,
            mpesaResponse: callback,
            callbackData: callback
          });
          console.log('✅ Transaction created for successful payment!');
        } catch (transError) {
          console.error('⚠️ Error creating transaction:', transError.message);
        }

        // Update the order if it exists
        if (order) {
          try {
            order.isPaid = true;
            order.paidAt = new Date();
            order.paymentResult = {
              id: mpesaReceipt,
              status: 'Completed',
              email_address: phoneNumber
            };
            order.status = 'processing';
            await order.save();
            console.log(`✅ Order ${order._id} marked as paid!`);

            // Clear the user's cart ONLY when payment succeeds
            if (order.user) {
              try {
                await Cart.findOneAndUpdate(
                  { userId: order.user },
                  { items: [], totalItems: 0, totalPrice: 0 }
                );
                console.log(`✅ Cart cleared for user ${order.user}!`);
              } catch (cartError) {
                console.error('⚠️ Error clearing cart:', cartError.message);
              }
            }
            
            // Create admin notification for paid order
            try {
              await Notification.create({
                type: 'NEW_ORDER',
                message: `Payment received! Order paid: KSh ${amountPaid || order.totalAmount}`,
                orderId: order._id
              });
              console.log('✅ Admin notification created for paid order!');
            } catch (notifError) {
              console.error('⚠️ Error creating notification:', notifError.message);
            }
          } catch (orderError) {
            console.error('⚠️ Error updating order:', orderError.message);
          }
        }
      } else {
        // Payment failed - do NOT create a Transaction document
        console.log(`❌ Payment FAILED: ${callback.ResultDesc} (Code: ${resultCode})`);

        // Update order status to cancelled
        try {
          const order = await Order.findOne({ mpesaCheckoutRequestId: checkoutRequestID });
          if (order) {
            order.status = 'cancelled';
            await order.save();
            console.log(`❌ Order ${order._id} marked as cancelled!`);
          }
        } catch (orderError) {
          console.error('⚠️ Error updating order:', orderError.message);
        }
      }
    }

    // Always respond with 200 OK so Safaricom knows we received it
    res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    console.error('❌ M-Pesa callback error:', error);
    res.status(500).json({
      success: false,
      message: 'Callback processing failed'
    });
  }
};

// M-Pesa STK Push Query - Fallback to check transaction status
const processMpesaResult = async (resultCode, checkoutRequestID, amount, mpesaReceipt, phoneNumber) => {
  if (resultCode === 0 || resultCode === '0') {
    // Payment successful - create transaction
    try {
      // Find the order first to get user info
      const order = await Order.findOne({ mpesaCheckoutRequestId: checkoutRequestID });
      const userEmail = order?.userEmail || (phoneNumber ? `${phoneNumber}@mpesa.com` : 'unknown@seekon.com');

      await Transaction.create({
        userEmail,
        phoneNumber: phoneNumber || '',
        method: 'mpesa',
        amount: amount || 0,
        status: 'completed',
        reference: order?.paymentReference || checkoutRequestID,
        callbackData: { ResultCode: resultCode, ResultDesc: 'Success via query' }
      });
      console.log('✅ Transaction created via query for successful payment!');
    } catch (transError) {
      console.error('⚠️ Error creating transaction:', transError.message);
    }

    // Also update the order if it exists
    try {
      const order = await Order.findOne({ mpesaCheckoutRequestId: checkoutRequestID });
      if (order) {
        order.isPaid = true;
        order.paidAt = new Date();
        order.paymentResult = {
          id: mpesaReceipt,
          status: 'Completed',
          email_address: phoneNumber
        };
        order.status = 'processing';
        await order.save();
        console.log(`✅ Order ${order._id} marked as paid via query!`);
        
        // Clear the user's cart ONLY when payment succeeds
        if (order.user) {
          try {
            await Cart.findOneAndUpdate(
              { userId: order.user },
              { items: [], totalItems: 0, totalPrice: 0 }
            );
            console.log(`✅ Cart cleared for user ${order.user} via query!`);
          } catch (cartError) {
            console.error('⚠️ Error clearing cart:', cartError.message);
          }
        }
        
        // Create admin notification for paid order
        try {
          await Notification.create({
            type: 'NEW_ORDER',
            message: `Payment received! Order paid: KSh ${amount || order.totalAmount}`,
            orderId: order._id
          });
          console.log('✅ Admin notification created for paid order via query!');
        } catch (notifError) {
          console.error('⚠️ Error creating notification:', notifError.message);
        }
      }
    } catch (orderError) {
      console.error('⚠️ Error updating order:', orderError.message);
    }
    return true;
  } else {
    // Payment failed - do NOT create a Transaction document
    console.log(`❌ Query: Payment FAILED (Code: ${resultCode})`);

    // Update order status to cancelled
    try {
      const order = await Order.findOne({ mpesaCheckoutRequestId: checkoutRequestID });
      if (order) {
        order.status = 'cancelled';
        await order.save();
        console.log(`❌ Order ${order._id} marked as cancelled via query!`);
      }
    } catch (orderError) {
      console.error('⚠️ Error updating order:', orderError.message);
    }
    return false;
  }
};

// M-Pesa STK Push Query API
export const queryMpesaTransaction = async (req, res) => {
  try {
    const { checkoutRequestId, orderId } = req.body;

    if (!checkoutRequestId) {
      return res.status(400).json({
        success: false,
        message: 'CheckoutRequestID is required'
      });
    }

    console.log('🔍 Querying M-Pesa transaction:', { checkoutRequestId, orderId });

    // Check if credentials are set up
    const hasCredentials = 
      (process.env.CONSUMER_KEY || process.env.DARAJA_CONSUMER_KEY || process.env.MPESA_CONSUMER_KEY) &&
      (process.env.CONSUMER_SECRET || process.env.DARAJA_CONSUMER_SECRET || process.env.MPESA_CONSUMER_SECRET) &&
      (process.env.SHORTCODE || process.env.DARAJA_BUSINESS_SHORTCODE || process.env.MPESA_SHORTCODE);

    if (!hasCredentials) {
      return res.status(400).json({
        success: false,
        message: 'M-Pesa credentials not configured'
      });
    }

    // Get access token
    const accessToken = await getMpesaAccessToken();

    // Generate password
    const { password, timestamp } = generatePassword();

    // Determine environment and base URL
    const isSandbox = process.env.MPESA_ENVIRONMENT === 'sandbox';
    const shortcode = process.env.SHORTCODE || process.env.DARAJA_BUSINESS_SHORTCODE || process.env.MPESA_SHORTCODE;

    // STK Query request
    const queryUrl = isSandbox
      ? 'https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query'
      : 'https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query';

    const queryData = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId
    };

    console.log('🔍 Sending STK Query request:', queryData);

    const response = await axios.post(
      queryUrl,
      queryData,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('📥 STK Query response:', response.data);

    const resultCode = response.data.ResultCode;
    let amount = null;
    let mpesaReceipt = null;
    let phoneNumber = null;

    // Extract metadata if payment was successful
    if (response.data.CallbackMetadata) {
      const meta = response.data.CallbackMetadata.Item || [];
      amount = meta.find(item => item.Name === 'Amount')?.Value;
      mpesaReceipt = meta.find(item => item.Name === 'MpesaReceiptNumber')?.Value;
      phoneNumber = meta.find(item => item.Name === 'PhoneNumber')?.Value;
    }

    // Process the result
    await processMpesaResult(resultCode, checkoutRequestId, amount, mpesaReceipt, phoneNumber);

    // Return appropriate response
    if (resultCode === 0 || resultCode === '0') {
      res.status(200).json({
        success: true,
        message: 'Payment successful',
        data: {
          status: 'completed',
          mpesaReceipt,
          amount,
          phoneNumber
        }
      });
    } else {
      res.status(200).json({
        success: false,
        message: response.data.ResultDesc || 'Payment failed or still pending',
        data: {
          status: 'failed',
          resultCode
        }
      });
    }
  } catch (error) {
    console.error('❌ M-Pesa query error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: error.response?.data?.errorMessage || error.message || 'Failed to query M-Pesa transaction'
    });
  }
};
