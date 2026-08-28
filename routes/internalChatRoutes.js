const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const InternalConversation = require('../models/InternalConversation');
const InternalChatMessage = require('../models/InternalChatMessage');

const JWT_SECRET = 'mahedi1000abcdefgh100';

const authMiddleware = (req, res, next) => {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ message: 'Access Denied' });
    try {
        const verified = jwt.verify(token, JWT_SECRET);
        req.user = verified;
        next();
    } catch (err) {
        res.status(400).json({ message: 'Invalid Token' });
    }
};

// ─── Users ───────────────────────────────────────────────────────────────────

// GET /api/internal-chat/users
// Returns all employees for the sidebar (excluding password)
router.get('/users', authMiddleware, async (req, res) => {
    try {
        const isSuperadmin = req.user.role === 'superadmin';
        // Admins cannot see locked users; superadmin sees everyone
        const filter = isSuperadmin ? {} : { isLocked: { $ne: true } };
        const users = await User.find(filter, 'username name role isLocked').lean();
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ─── Conversations ────────────────────────────────────────────────────────────

// GET /api/internal-chat/conversations
// Returns all conversations the current user is part of
router.get('/conversations', authMiddleware, async (req, res) => {
    try {
        const username = req.headers['x-user-name'];
        const conversations = await InternalConversation.find({
            participants: username
        }).sort({ lastMessageAt: -1 }).lean();
        res.json(conversations);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/internal-chat/conversations/dm
// Get or create a DM conversation between current user and another user
router.post('/conversations/dm', authMiddleware, async (req, res) => {
    try {
        const myUsername = req.headers['x-user-name'];
        const { targetUsername } = req.body;
        if (!targetUsername) return res.status(400).json({ message: 'targetUsername is required' });

        const dmKey = [myUsername, targetUsername].sort().join('__');

        let conversation = await InternalConversation.findOne({ dmKey });
        if (!conversation) {
            conversation = await InternalConversation.create({
                type: 'dm',
                participants: [myUsername, targetUsername],
                dmKey,
            });
        }
        res.json(conversation);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/internal-chat/conversations/group
// Create a new group conversation (superadmin only)
router.post('/conversations/group', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'Only Superadmins can create group chats' });
        }
        const { name, participants } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ message: 'Group name is required' });
        if (!participants || participants.length < 2) {
            return res.status(400).json({ message: 'At least 2 participants are required' });
        }

        const myUsername = req.headers['x-user-name'];
        const uniqueParticipants = [...new Set([...participants, myUsername])];

        const conversation = await InternalConversation.create({
            type: 'group',
            name: name.trim(),
            participants: uniqueParticipants,
            createdBy: myUsername,
        });

        // Notify all clients so they refresh their conversation list
        const io = req.app.get('socketio');
        if (io) {
            io.emit('internal_conversation_created', conversation);
        }

        res.status(201).json(conversation);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// PATCH /api/internal-chat/conversations/:id/participants
// Add/remove participants from a group (superadmin only)
router.patch('/conversations/:id/participants', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'Only Superadmins can manage group participants' });
        }
        const { participants } = req.body;
        const conversation = await InternalConversation.findById(req.params.id);
        if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
        if (conversation.type !== 'group') return res.status(400).json({ message: 'Not a group conversation' });

        conversation.participants = participants;
        await conversation.save();

        const io = req.app.get('socketio');
        if (io) io.emit('internal_conversation_updated', conversation);

        res.json(conversation);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// DELETE /api/internal-chat/conversations/:id
// Delete a group (superadmin only)
router.delete('/conversations/:id', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'Only Superadmins can delete group chats' });
        }
        await InternalConversation.findByIdAndDelete(req.params.id);
        await InternalChatMessage.deleteMany({ conversationId: req.params.id });

        const io = req.app.get('socketio');
        if (io) io.emit('internal_conversation_deleted', { conversationId: req.params.id });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ─── Messages ─────────────────────────────────────────────────────────────────

// GET /api/internal-chat/messages/:conversationId
// Paginated message history
router.get('/messages/:conversationId', authMiddleware, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 30;
        const before = req.query.before;
        const query = { conversationId: req.params.conversationId };
        if (before) query.createdAt = { $lt: new Date(before) };

        const messages = await InternalChatMessage.find(query)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        res.json(messages.reverse());
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/internal-chat/read/:conversationId
// Mark all messages in a conversation as read for the current user (clear unread count)
router.post('/read/:conversationId', authMiddleware, async (req, res) => {
    try {
        const username = req.headers['x-user-name'];
        const conversation = await InternalConversation.findById(req.params.conversationId);
        if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

        conversation.unreadCounts.set(username, 0);
        await conversation.save();

        const io = req.app.get('socketio');
        if (io) {
            io.to(`internal_user_${username}`).emit('internal_unread_updated', {
                conversationId: req.params.conversationId,
                count: 0,
            });
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// PATCH /api/internal-chat/message/:id/unsend
// Unsend a message (only the sender can unsend their own messages)
router.patch('/message/:id/unsend', authMiddleware, async (req, res) => {
    try {
        const username = req.headers['x-user-name'];
        const message = await InternalChatMessage.findById(req.params.id);
        if (!message) return res.status(404).json({ message: 'Message not found' });

        if (message.senderId !== username && req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'You can only unsend your own messages' });
        }

        message.isUnsent = true;
        message.deletedBy = username;
        await message.save();

        const io = req.app.get('socketio');
        if (io) {
            io.emit('internal_message_unsent', {
                messageId: message._id,
                conversationId: message.conversationId,
                deletedBy: message.deletedBy,
            });
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/internal-chat/unread-summary
// Returns total unread count across all conversations for the current user
router.get('/unread-summary', authMiddleware, async (req, res) => {
    try {
        const username = req.headers['x-user-name'];
        const conversations = await InternalConversation.find({ participants: username }).lean();

        let total = 0;
        const perConversation = {};
        for (const conv of conversations) {
            const count = (conv.unreadCounts && conv.unreadCounts[username]) ? conv.unreadCounts[username] : 0;
            perConversation[conv._id.toString()] = count;
            total += count;
        }

        res.json({ total, perConversation });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
