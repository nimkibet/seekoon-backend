import express from 'express';
import { getMyOrders, getOrder, createOrder, updateOrderStatus } from '../controllers/orderController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Create new order (requires authentication)
router.post('/', authMiddleware, createOrder);

// Get current user's orders (requires authentication)
router.get('/my-orders', authMiddleware, getMyOrders);

// Get single order by ID (public for payment polling)
router.get('/:id', getOrder);

// Update order status/fulfillment (admin)
router.patch('/:id', updateOrderStatus);

export default router;
