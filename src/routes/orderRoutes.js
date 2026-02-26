import express from 'express';
import { getMyOrders, getOrder, createOrder } from '../controllers/orderController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Create new order (requires authentication)
router.post('/', authMiddleware, createOrder);

// Get current user's orders (requires authentication)
router.get('/myorders', authMiddleware, getMyOrders);

// Get single order by ID (public for payment polling)
router.get('/:id', getOrder);

export default router;
