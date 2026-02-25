import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['order', 'payment', 'user', 'system', 'stock'],
    default: 'system'
  },
  isRead: {
    type: Boolean,
    default: false
  },
  relatedId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'type'
  }
}, {
  timestamps: true
});

// Static method to create notification and return all unread
notificationSchema.statics.createNotification = async function(data) {
  const notification = await this.create(data);
  return notification;
};

// Static method to get unread count
notificationSchema.statics.getUnreadCount = async function() {
  return this.countDocuments({ isRead: false });
};

export default mongoose.model('Notification', notificationSchema);
