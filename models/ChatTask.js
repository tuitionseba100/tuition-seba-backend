const mongoose = require('mongoose');

const chatDB = mongoose.createConnection(process.env.CHAT_DB_URI);

chatDB.on('connected', () => console.log('ChatTask DB connected'));
chatDB.on('error', (err) => console.error('ChatTask DB error:', err));

const chatTaskSchema = new mongoose.Schema({
    conversationId: { type: String, required: true },
    messageId:      { type: String, default: null },       // set after message is created
    title:          { type: String, required: true },
    description:    { type: String, default: '' },
    assignedTo:     { type: String, required: true },      // username of employee
    assignedBy:     { type: String, required: true },      // username of superadmin
    status:         { type: String, enum: ['pending', 'in_review', 'done'], default: 'pending' },
    dueDate:        { type: Date, default: null },
}, { timestamps: true });

chatTaskSchema.index({ conversationId: 1 });
chatTaskSchema.index({ assignedTo: 1 });

module.exports = chatDB.model('ChatTask', chatTaskSchema);
