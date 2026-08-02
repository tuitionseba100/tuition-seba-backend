const mongoose = require('mongoose');

const chatDB = mongoose.createConnection(process.env.CHAT_DB_URI);

chatDB.on('connected', () => console.log('Chat Database connected successfully'));
chatDB.on('error', (err) => console.error('Chat Database connection error:', err));

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

module.exports = chatDB.model('ChatMessage', chatMessageSchema);
