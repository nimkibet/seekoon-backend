import express from 'express';
import {
  initiateMpesaPayment,
  initiateFlutterwavePayment,
  mpesaCallback,
  flutterwaveCallback,
  getUserTransactions
} from '../controllers/paymentController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// All payment routes except callbacks require authentication
router.post('/mpesa', authMiddleware, initiateMpesaPayment);
router.post('/flutterwave', authMiddleware, initiateFlutterwavePayment);
router.post('/mpesa-callback', mpesaCallback);
router.get('/flutterwave-callback', flutterwaveCallback);
router.get('/transactions/:userEmail', authMiddleware, getUserTransactions);

export default router;
