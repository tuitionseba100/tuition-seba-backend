const mongoose = require('mongoose');

const chatSessionSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    premiumCode: { type: String, required: true },
    assignedTo: { type: String, default: null }, // Store username or userId of the assigned admin
    lastMessage: { type: String, default: '' },
    lastMessageAt: { type: Date, default: Date.now },
    unreadCount: { type: Number, default: 0 }
}, { timestamps: true });

chatSessionSchema.index({ phone: 1 });
chatSessionSchema.index({ lastMessageAt: -1 });

module.exports = mongoose.model('ChatSession', chatSessionSchema);
