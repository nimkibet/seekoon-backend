import express from 'express';
import { register, login, getMe, unifiedAuth, updateProfile } from '../controllers/authController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/auth/unified
// @desc    Unified login/register - auto-detects new users and signs them up
// @access  Public
router.post('/unified', unifiedAuth);

// @route   POST /api/auth/register
// @desc    Register new user
// @access  Public
router.post('/register', register);

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', login);

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', authMiddleware, getMe);

// @route   PUT /api/auth/me
// @desc    Update current user profile
// @access  Private
router.put('/me', authMiddleware, updateProfile);

export default router;

