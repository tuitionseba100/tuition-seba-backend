const express = require('express');
const router = express.Router();
const ChatMessage = require('../models/ChatMessage');
const RegTeacher = require('../models/RegTeacher');
const ChatSession = require('../models/ChatSession');
const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ message: 'Access Denied' });

    try {
        const verified = jwt.verify(token, 'mahedi1000abcdefgh100');
        req.user = verified;
        next();
    } catch (err) {
        res.status(400).json({ message: 'Invalid Token' });
    }
};

// Fetch past messages for a chat session (with pagination)
router.get('/history/:phone', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const before = req.query.before;
        
        const query = { phone: req.params.phone };
        if (before) {
            query.createdAt = { $lt: new Date(before) };
        }

        const messages = await ChatMessage.find(query)
            .sort({ createdAt: -1 })
            .limit(limit);
        
        // Reverse to return in chronological order
        res.json(messages.reverse());
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Fetch all active chat sessions (for the Agent console, with search)
router.get('/sessions', async (req, res) => {
    try {
        const { search } = req.query;
        let query = {};
        if (search && search.trim() !== '') {
            // Escape special characters to prevent invalid regex errors
            const escapedSearch = search.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            query = {
                $or: [
                    { phone: { $regex: escapedSearch, $options: 'i' } },
                    { premiumCode: { $regex: escapedSearch, $options: 'i' } },
                    { name: { $regex: escapedSearch, $options: 'i' } }
                ]
            };
        }
        const sessions = await ChatSession.find(query).sort({ lastMessageAt: -1 });
        res.json(sessions);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Assign a session to an admin
router.post('/assign', async (req, res) => {
    try {
        const { phone, assignedTo } = req.body;
        if (!phone) {
            return res.status(400).json({ success: false, message: 'Phone is required' });
        }
        await ChatSession.findOneAndUpdate({ phone }, { assignedTo });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Mark session as read
router.post('/read/:phone', async (req, res) => {
    try {
        await ChatMessage.updateMany({ phone: req.params.phone, sender: 'member', isRead: false }, { isRead: true });
        await ChatSession.findOneAndUpdate({ phone: req.params.phone }, { unreadCount: 0 });
        
        const io = req.app.get('socketio');
        if (io) {
            io.emit('session_updated');
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Clear/delete a specific chat session and its history (Superadmin only)
router.delete('/session/:phone', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'superadmin') {
            return res.status(403).json({ success: false, message: 'Only Superadmins can delete chats' });
        }

        const { phone } = req.params;
        
        // Delete messages
        await ChatMessage.deleteMany({ phone });
        
        // Delete session
        await ChatSession.deleteOne({ phone });

        const io = req.app.get('socketio');
        if (io) {
            io.emit('session_updated');
        }

        res.json({ success: true, message: 'Chat session deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Unsend/delete a specific message (Admin only - agent messages only)
router.patch('/message/:messageId/unsend', authMiddleware, async (req, res) => {
    try {
        const message = await ChatMessage.findById(req.params.messageId);
        if (!message) {
            return res.status(404).json({ success: false, message: 'Message not found' });
        }

        if (message.sender !== 'agent' && message.sender !== 'bot') {
            return res.status(400).json({ success: false, message: 'Only agent/bot messages can be unsent' });
        }

        const { username } = req.body;
        message.isUnsent = true;
        message.deletedBy = username || 'Admin';
        await message.save();

        // Notify all connected clients about the unsent message
        const io = req.app.get('socketio');
        if (io) {
            io.emit('message_unsent', { messageId: message._id, phone: message.phone, deletedBy: message.deletedBy });
        }

        res.json({ success: true, message: 'Message unsent successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
