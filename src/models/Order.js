import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userEmail: {
    type: String,
    required: true
  },
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    name: String,
    price: Number,
    quantity: Number,
    size: String,
    color: String,
    image: String
  }],
  totalAmount: {
    type: Number,
    required: true
  },
  paymentMethod: {
    type: String,
    enum: ['mpesa', 'card', 'flutterwave'],
    required: true
  },
  paymentReference: {
    type: String
  },
  paymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction'
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'cancelled', 'refunded'],
    default: 'pending'
  },
  shippingAddress: {
    name: String,
    phone: String,
    address: String,
    city: String,
    postalCode: String
  },
  notes: {
    type: String
  }
}, {
  timestamps: true
});

export default mongoose.model('Order', orderSchema);




