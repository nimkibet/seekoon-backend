import express from 'express';
import authRoutes from './authRoutes.js';
import uploadRoutes from './uploadRoutes.js';
import paymentRoutes from './paymentRoutes.js';
import cartRoutes from './cartRoutes.js';
import wishlistRoutes from './wishlistRoutes.js';
import adminRoutes from './adminRoutes.js';
import { 
  getAllProducts as getAllProductsPublic, 
  getProduct as getProductPublic 
} from '../controllers/productController.js';

const router = express.Router();

// Mount routes
router.use('/auth', authRoutes);
router.use('/upload', uploadRoutes);
router.use('/payment', paymentRoutes);
router.use('/cart', cartRoutes);
router.use('/wishlist', wishlistRoutes);
router.use('/admin', adminRoutes);

// Public product routes (no auth required for viewing)
router.get('/products', getAllProductsPublic);
router.get('/products/:id', getProductPublic);

export default router;

