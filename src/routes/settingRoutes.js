import express from 'express';
import { getFlashSaleSettings, updateFlashSaleSettings } from '../controllers/settingController.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Public route to check status
router.get('/flash-sale', getFlashSaleSettings);

// Admin route to update settings
router.put('/flash-sale', authMiddleware, adminMiddleware, updateFlashSaleSettings);

export default router;
