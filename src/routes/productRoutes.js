import express from 'express';
import {
  getAllProducts,
  getProduct,
  createProduct,
  updateProduct,
<<<<<<< HEAD
  deleteProduct,
  addReview,
  canUserReview
=======
  deleteProduct
>>>>>>> 9de8a30e5d2d5f4909bc14d2509e3d3b34282613
} from '../controllers/productController.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Public Routes (Everyone can see products)
router.get('/', getAllProducts);
router.get('/:id', getProduct);

<<<<<<< HEAD
// Review Routes (Auth required - verified buyer check included)
router.post('/:id/reviews', authMiddleware, addReview);
router.get('/:id/can-review', authMiddleware, canUserReview);

=======
>>>>>>> 9de8a30e5d2d5f4909bc14d2509e3d3b34282613
// Admin Routes (Only for creating/editing) - Protected and Admin only
router.post('/', authMiddleware, adminMiddleware, createProduct);
router.put('/:id', authMiddleware, adminMiddleware, updateProduct);
router.delete('/:id', authMiddleware, adminMiddleware, deleteProduct);

export default router;