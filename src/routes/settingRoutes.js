import express from 'express';
import { getFlashSaleSettings, updateFlashSaleSettings, getHomeSettings, updateHomeSettings } from '../controllers/settingController.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Public route to check status
router.get('/flash-sale', getFlashSaleSettings);

// Admin route to update settings
router.put('/flash-sale', authMiddleware, adminMiddleware, updateFlashSaleSettings);

// Home Page Settings (Public GET, Admin PUT)
router.get('/home', getHomeSettings);
router.put('/home', authMiddleware, adminMiddleware, updateHomeSettings);

export default router;
