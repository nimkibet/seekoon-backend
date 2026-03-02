import Cart from '../models/Cart.js';
import Product from '../models/Product.js';

// Maximum quantity per item to prevent abuse
const MAX_QUANTITY_PER_ITEM = 99;

// @desc    Get user's cart
// @route   GET /api/cart
export const getCart = async (req, res) => {
  try {
    // SECURITY: Check if user is authenticated
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    
    // SECURITY: Use req.user._id from verified JWT token, never from client input
    const userId = req.user._id; 
    
    let cart = await Cart.findOne({ userId });
    
    if (!cart) {
      cart = await Cart.create({ userId, items: [] });
    }
    
    // SANITY CHECK: Filter out items with missing product references
    // Check multiple possible field names for product ID
    const originalLength = cart.items.length;
    cart.items = cart.items.filter(item => {
      // Check item.productId, item.product, or item._id
      const hasProductRef = item.productId != null || item.product != null || item._id != null;
      return hasProductRef;
    });
    
    // If we removed corrupted items, save the cleaned cart
    if (cart.items.length !== originalLength) {
      console.log(`🧹 Sanitized cart: removed ${originalLength - cart.items.length} corrupted items`);
      await cart.save();
    }
    
    res.status(200).json({
      success: true,
      cart
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Add item to cart
// @route   POST /api/cart/add
export const addToCart = async (req, res) => {
  try {
    // SECURITY: Check if user is authenticated
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    
    // SECURITY: Always use authenticated user's ID from token
    const userId = req.user._id;
    // Check for product ID in multiple formats
    let { productId, size, color, quantity } = req.body;
    
    // If productId is missing, try other common field names
    if (!productId) {
      productId = req.body.product || req.body.id;
      console.log("🔍 Alternative product ID lookup:", productId);
    }
    
    // Input validation
    if (!productId) {
      return res.status(400).json({ success: false, message: 'Product ID is required' });
    }
    
    if (!color) {
      return res.status(400).json({ success: false, message: 'Color is required' });
    }
    
    // Validate quantity
    const requestedQuantity = Number(quantity) || 1;
    if (requestedQuantity < 1) {
      return res.status(400).json({ success: false, message: 'Quantity must be at least 1' });
    }
    if (requestedQuantity > MAX_QUANTITY_PER_ITEM) {
      return res.status(400).json({ success: false, message: `Quantity cannot exceed ${MAX_QUANTITY_PER_ITEM}` });
    }
    
    // SECURITY CRITICAL: Verify product exists and get authentic data from database
    // This prevents price manipulation and fake product attacks
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    // SECURITY: Verify the requested color is valid for this product
    if (product.colors && product.colors.length > 0 && !product.colors.includes(color)) {
      return res.status(400).json({ success: false, message: 'Invalid color for this product' });
    }
    
    // SECURITY: Verify size is valid if product has sizes
    if (size && product.sizes && product.sizes.length > 0 && !product.sizes.includes(size)) {
      return res.status(400).json({ success: false, message: 'Invalid size for this product' });
    }
    
    // SECURITY: Use price from database, never trust client-provided price
    const verifiedPrice = product.price;
    const verifiedName = product.name;
    const verifiedBrand = product.brand;
    const verifiedImage = product.images && product.images.length > 0 ? product.images[0] : product.image;
    
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = await Cart.create({ userId, items: [] });
    }
    
    // Check if item already exists (Matches logic for same ID, Size, and Color)
    const existingItem = cart.items.find(item => 
      item.productId.toString() === productId &&
      item.color === color &&
      item.size === (size || null)
    );
    
    if (existingItem) {
      // Check if new total would exceed max quantity
      const newTotalQuantity = existingItem.quantity + requestedQuantity;
      if (newTotalQuantity > MAX_QUANTITY_PER_ITEM) {
        return res.status(400).json({ 
          success: false, 
          message: `Total quantity cannot exceed ${MAX_QUANTITY_PER_ITEM}` 
        });
      }
      existingItem.quantity = newTotalQuantity;
    } else {
      cart.items.push({
        productId,
        name: verifiedName,
        brand: verifiedBrand,
        price: verifiedPrice,
        image: verifiedImage,
        size: size || null,
        color,
        quantity: requestedQuantity
      });
    }
    
    // The Model handles the math automatically!
    await cart.save();
    
    res.status(200).json({
      success: true,
      message: existingItem ? 'Quantity updated' : 'Item added to cart',
      cart
    });
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update cart item quantity
// @route   PATCH /api/cart/update
export const updateCartItemQuantity = async (req, res) => {
  try {
    // SECURITY: Check if user is authenticated
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    
    const { productId, size, color, quantity } = req.body;
    const cart = await Cart.findOne({ userId: req.user._id });
    
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }
    
    // Validate quantity
    const requestedQuantity = Number(quantity);
    if (isNaN(requestedQuantity) || requestedQuantity < 1) {
      return res.status(400).json({ 
        success: false, 
        message: 'Quantity must be at least 1' 
      });
    }
    if (requestedQuantity > MAX_QUANTITY_PER_ITEM) {
      return res.status(400).json({ 
        success: false, 
        message: `Quantity cannot exceed ${MAX_QUANTITY_PER_ITEM}` 
      });
    }
    
    // Find the item safely even if the product reference is broken
    const item = cart.items.find(i => {
      // Get item identifier from productId, product, or internal _id
      const itemProdId = i.productId ? i.productId.toString() : (i.product ? i.product.toString() : (i._id ? i._id.toString() : null));
      const targetProdId = productId ? productId.toString() : null;
      
      // If we can't determine the ID, skip this item
      if (!itemProdId || !targetProdId) return false;
      
      // Match on ID and optionally color/size
      if (color !== undefined && size !== undefined) {
        return itemProdId === targetProdId && i.color === color && i.size === (size || null);
      }
      return itemProdId === targetProdId;
    });
    
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found in cart' });
    }
    
    // Update quantity
    item.quantity = requestedQuantity;
    
    await cart.save();
    
    res.status(200).json({
      success: true,
      message: 'Quantity updated successfully',
      cart
    });
  } catch (error) {
    console.error('Update quantity error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Remove item from cart
// @route   DELETE /api/cart/remove
export const removeFromCart = async (req, res) => {
  try {
    // SECURITY: Check if user is authenticated
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    
    const { productId } = req.body; // This is the ID passed from the trash icon
    const cart = await Cart.findOne({ userId: req.user._id });
    
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }
    
    // SAFE FILTER: Ensure we don't call .toString() on a null product field
    const initialLength = cart.items.length;
    cart.items = cart.items.filter(item => {
      // Use product field if exists, otherwise fall back to internal _id
      const itemIdentifier = item.product ? item.product.toString() : (item._id ? item._id.toString() : null);
      // Keep item if we can't determine its ID or if IDs don't match
      if (!itemIdentifier) return true;
      return itemIdentifier !== productId;
    });
    
    // Verify item was actually removed
    if (cart.items.length === initialLength) {
      return res.status(404).json({ success: false, message: 'Item not found in cart' });
    }
    
    await cart.save();
    res.status(200).json({ success: true, message: 'Item removed from cart', cart });
  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Clear entire cart
// @route   DELETE /api/cart/clear
export const clearCart = async (req, res) => {
  try {
    // SECURITY: Check if user is authenticated
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    
    // SECURITY: Always use authenticated user's ID from token
    const userId = req.user._id;
    const cart = await Cart.findOne({ userId });
    if (cart) {
      cart.items = [];
      await cart.save();
    }
    res.status(200).json({ success: true, message: 'Cart cleared successfully', cart });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
