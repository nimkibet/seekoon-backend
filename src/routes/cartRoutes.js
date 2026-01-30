import express from 'express';
import {
  getCart,
  addToCart,
  updateCartItemQuantity,
  removeFromCart,
  clearCart
} from '../controllers/cartController.js';
import { protect } from '../middleware/authMiddleware.js'; 

const router = express.Router();

// SECURITY: All cart routes require authentication
// The protect middleware verifies JWT token and sets req.user
router.use(protect);

router.get('/', getCart);                           // GET /api/cart
router.post('/add', addToCart);                     // POST /api/cart/add
router.patch('/update', updateCartItemQuantity);    // PATCH /api/cart/update
router.delete('/remove', removeFromCart);           // DELETE /api/cart/remove
router.delete('/clear', clearCart);                 // DELETE /api/cart/clear

export default router;
