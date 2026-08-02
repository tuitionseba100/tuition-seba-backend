const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
    phone: { type: String, required: true },
    premiumCode: { type: String, required: true },
    sender: { type: String, enum: ['member', 'agent', 'bot'], required: true },
    senderName: { type: String, required: true },
    text: { type: String, required: true },
    isRead: { type: Boolean, default: false }
}, { timestamps: true });

// Performance indexes for scaling to 100+ concurrent chats
chatMessageSchema.index({ phone: 1 });
chatMessageSchema.index({ phone: 1, createdAt: 1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
