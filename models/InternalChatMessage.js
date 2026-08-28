const mongoose = require('mongoose');

const chatDB = mongoose.createConnection(process.env.CHAT_DB_URI);

chatDB.on('connected', () => console.log('InternalChatMessage DB connected'));
chatDB.on('error', (err) => console.error('InternalChatMessage DB error:', err));

const internalChatMessageSchema = new mongoose.Schema({
    conversationId: { type: String, required: true },  // InternalConversation._id as string
    senderId: { type: String, required: true },         // username
    senderName: { type: String, required: true },       // display name
    text: { type: String, default: '' },               // empty for task messages
    type: { type: String, enum: ['text', 'task'], default: 'text' },
    taskId: { type: String, default: null },            // references ChatTask._id
    isUnsent: { type: Boolean, default: false },
    deletedBy: { type: String, default: null },
}, { timestamps: true });


internalChatMessageSchema.index({ conversationId: 1 });
internalChatMessageSchema.index({ conversationId: 1, createdAt: 1 });

module.exports = chatDB.model('InternalChatMessage', internalChatMessageSchema);
