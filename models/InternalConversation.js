const mongoose = require('mongoose');

const chatDB = mongoose.createConnection(process.env.CHAT_DB_URI);

chatDB.on('connected', () => console.log('InternalConversation DB connected'));
chatDB.on('error', (err) => console.error('InternalConversation DB error:', err));

const internalConversationSchema = new mongoose.Schema({
    // 'dm' = direct message between two employees, 'group' = group created by superadmin
    type: { type: String, enum: ['dm', 'group'], required: true },

    // For DMs: sorted [usernameA, usernameB]; for groups: all members
    participants: [{ type: String }], // array of usernames

    // Group fields
    name: { type: String, default: '' },       // group display name
    createdBy: { type: String, default: '' },  // username of superadmin who created it

    // For DMs: a stable unique key so we can upsert without duplication
    // Computed as participants.sort().join('__') before saving
    dmKey: { type: String, default: null, sparse: true },

    // Preview / badge info
    lastMessage: { type: String, default: '' },
    lastSenderName: { type: String, default: '' },
    lastMessageAt: { type: Date, default: Date.now },

    // Per-user unread counts: { username: count }
    unreadCounts: { type: Map, of: Number, default: {} },
}, { timestamps: true });

internalConversationSchema.index({ participants: 1 });
internalConversationSchema.index({ lastMessageAt: -1 });

module.exports = chatDB.model('InternalConversation', internalConversationSchema);
