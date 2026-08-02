const express = require('express');
const router = express.Router();
const ChatMessage = require('../models/ChatMessage');
const RegTeacher = require('../models/RegTeacher');
const ChatSession = require('../models/ChatSession');

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

// Fetch all active chat sessions (for the Agent console)
router.get('/sessions', async (req, res) => {
    try {
        const sessions = await ChatSession.find().sort({ lastMessageAt: -1 });
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
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
