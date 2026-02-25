import Product from '../models/Product.js';
import SystemLog from '../models/SystemLog.js';
import Order from '../models/Order.js';

// Helper function to calculate active price based on flash sale timing
const calculateActivePrice = (product) => {
  const now = new Date();
  
  // Check if flash sale is active
  if (product.isFlashSale && 
      product.flashSalePrice && 
      product.saleStartTime && 
      product.saleEndTime) {
    const startTime = new Date(product.saleStartTime);
    const endTime = new Date(product.saleEndTime);
    
    if (now >= startTime && now <= endTime) {
      return {
        active: true,
        price: product.flashSalePrice,
        originalPrice: product.price,
        endTime: product.saleEndTime
      };
    }
  }
  
  return {
    active: false,
    price: product.price,
    originalPrice: null,
    endTime: null
  };
};

// Helper function to transform product with active pricing
const transformProduct = (product) => {
  const productObj = product.toObject ? product.toObject() : product;
  const pricing = calculateActivePrice(productObj);
  
  return {
    ...productObj,
    activePrice: pricing.price,
    originalPrice: pricing.originalPrice || productObj.price,
    isOnFlashSale: pricing.active,
    flashSaleEndTime: pricing.endTime
  };
};

// Get All Products
export const getAllProducts = async (req, res) => {
  try {
    const { page = 1, limit = 50, search, category, inStock } = req.query;

    const query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (category) query.category = category;
    if (inStock !== undefined) query.inStock = inStock === 'true';

    const products = await Product.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Product.countDocuments(query);

    // Transform products with active pricing
    const transformedProducts = products.map(transformProduct);

    res.status(200).json({
      success: true,
      products: transformedProducts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products'
    });
  }
};

// Get Single Product
export const getProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Transform product with active pricing
    const transformedProduct = transformProduct(product);

    res.status(200).json({
      success: true,
      product: transformedProduct
    });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product'
    });
  }
};

// Create Product
export const createProduct = async (req, res) => {
  try {
    const product = await Product.create(req.body);

    // Log action - with error handling to prevent crashes
    try {
      await SystemLog.create({
        action: 'product_created',
        actor: req.user?.email || 'system',
        actorType: 'admin',
        details: { productId: product._id },
        module: 'product'
      });
    } catch (logError) {
      console.error('Failed to create product log:', logError.message);
      // Continue without crashing - product was created successfully
    }

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      product
    });
  } catch (error) {
    console.error('Error creating product:', error);
    
    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = {};
      for (const field in error.errors) {
        validationErrors[field] = error.errors[field].message;
      }
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to create product'
    });
  }
};

// Update Product
export const updateProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Log action - with error handling to prevent crashes
    try {
      await SystemLog.create({
        action: 'product_updated',
        actor: req.user?.email || 'system',
        actorType: 'admin',
        details: { productId: product._id },
        module: 'product'
      });
    } catch (logError) {
      console.error('Failed to create product update log:', logError.message);
      // Continue without crashing - product was updated successfully
    }

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      product
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update product'
    });
  }
};

// Delete Product
export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Log action - with error handling to prevent crashes
    try {
      await SystemLog.create({
        action: 'product_deleted',
        actor: req.user?.email || 'system',
        actorType: 'admin',
        details: { productId: req.params.id },
        module: 'product'
      });
    } catch (logError) {
      console.error('Failed to create product delete log:', logError.message);
      // Continue without crashing - product was deleted successfully
    }

    res.status(200).json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete product'
    });
  }
};




