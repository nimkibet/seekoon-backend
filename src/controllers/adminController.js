import Transaction from '../models/Transaction.js';
import Admin from '../models/Admin.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'seekon_secret_key';

// Admin Login
export const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find admin
    const admin = await Admin.findOne({ email });
    
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check password
    const isMatch = await admin.comparePassword(password);
    
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update last login
    admin.lastLogin = new Date();
    await admin.save();

    // Generate JWT
    const token = jwt.sign(
      {
        userId: admin._id,
        email: admin.email,
        role: admin.role
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      admin: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
};

// Get Dashboard Stats
export const getDashboardStats = async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    
    // Today's stats
    const todayStats = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: todayStart }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          total: { $sum: '$amount' }
        }
      }
    ]);

    // Total stats
    const totalStats = await Transaction.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          total: { $sum: '$amount' }
        }
      }
    ]);

    // Weekly revenue
    const weeklyRevenue = await Transaction.aggregate([
      {
        $match: {
          status: 'completed',
          createdAt: { $gte: weekStart }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Calculate totals
    const today = {
      successful: todayStats.find(s => s._id === 'completed')?.count || 0,
      failed: todayStats.find(s => s._id === 'failed')?.count || 0,
      pending: todayStats.find(s => s._id === 'pending')?.count || 0,
      revenue: todayStats.find(s => s._id === 'completed')?.total || 0
    };

    const total = {
      successful: totalStats.find(s => s._id === 'completed')?.count || 0,
      failed: totalStats.find(s => s._id === 'failed')?.count || 0,
      pending: totalStats.find(s => s._id === 'pending')?.count || 0,
      revenue: totalStats.find(s => s._id === 'completed')?.total || 0
    };

    // Get counts for users, products, and orders
    const [userCount, productCount, orderCount] = await Promise.all([
      User.countDocuments(),
      Product.countDocuments(),
      Order.countDocuments()
    ]);

    // Get recent orders for dashboard
    const recentOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('user', 'name email');

    // Get top products
    const topProducts = await Product.find()
      .sort({ sold: -1 })
      .limit(5);

    // Get recent activities
    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(3);

    res.status(200).json({
      success: true,
      stats: {
        today,
        total: {
          ...total,
          users: userCount,
          products: productCount,
          orders: orderCount
        },
        weeklyRevenue
      },
      recentOrders: recentOrders.map(order => ({
        id: order._id,
        customer: order.user?.name || order.guestName || 'Guest',
        amount: order.totalAmount,
        status: order.status,
        date: new Date(order.createdAt).toLocaleDateString(),
        paymentMethod: order.paymentMethod || 'M-Pesa'
      })),
      topProducts: topProducts.map(product => ({
        id: product._id,
        name: product.name,
        sold: product.sold || 0,
        revenue: (product.sold || 0) * product.price,
        category: product.category
      })),
      recentActivities: [
        ...recentUsers.map(user => ({
          type: 'user',
          message: `New user registered: ${user.name}`,
          time: new Date(user.createdAt).toLocaleDateString(),
          icon: '👤'
        }))
      ]
    });
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stats'
    });
  }
};

// Get All Transactions
export const getAllTransactions = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      status, 
      search, 
      startDate, 
      endDate 
    } = req.query;

    // Build query
    const query = {};
    
    if (status) {
      query.status = status;
    }
    
    if (search) {
      query.$or = [
        { phoneNumber: { $regex: search, $options: 'i' } },
        { userEmail: { $regex: search, $options: 'i' } },
        { reference: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Get transactions
    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    // Get total count
    const total = await Transaction.countDocuments(query);

    res.status(200).json({
      success: true,
      transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions'
    });
  }
};

// Get Single Transaction
export const getTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    
    const transaction = await Transaction.findById(id);
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    res.status(200).json({
      success: true,
      transaction
    });
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction'
    });
  }
};

// Export Transactions to CSV
export const exportTransactions = async (req, res) => {
  try {
    const { status, startDate, endDate } = req.query;

    const query = {};
    if (status) query.status = status;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const transactions = await Transaction.find(query).sort({ createdAt: -1 });

    // Convert to CSV
    const headers = 'Phone Number,Email,Amount,Status,Reference,Date,Method\n';
    const rows = transactions.map(t => {
      return `"${t.phoneNumber}","${t.userEmail}",${t.amount},"${t.status}","${t.reference}","${t.createdAt}",${t.method}`;
    }).join('\n');

    const csv = headers + rows;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=transactions.csv');
    res.send(csv);
  } catch (error) {
    console.error('Error exporting transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export transactions'
    });
  }
};

