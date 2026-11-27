const mongoose = require('mongoose');
const chatDB = require('../config/chatDb');

const chatSessionSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    premiumCode: { type: String, required: true },
    assignedTo: { type: String, default: null }, // Store username or userId of the assigned admin
    lastSender: { type: String, default: '' },
    lastMessage: { type: String, default: '' },
    lastMessageAt: { type: Date, default: Date.now },
    unreadCount: { type: Number, default: 0 }
}, { timestamps: true });

chatSessionSchema.index({ lastMessageAt: -1 });
chatSessionSchema.index({ unreadCount: 1 });

module.exports = chatDB.model('ChatSession', chatSessionSchema);
