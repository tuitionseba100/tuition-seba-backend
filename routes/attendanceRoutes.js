const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
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


router.post('/start', authMiddleware, async (req, res) => {
    try {
        const { userId, role } = req.user;
        const existingRecord = await Attendance.findOne({ userId, endTime: null });

        if (existingRecord) {
            return res.status(400).json({ message: 'You already started your day' });
        }

        const attendance = new Attendance({ userId, role, startTime: new Date() });
        await attendance.save();
        res.json({ message: 'Attendance started' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.put('/end', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.user;
        const attendance = await Attendance.findOne({ userId, endTime: null });

        if (!attendance) {
            return res.status(400).json({ message: 'No active session found' });
        }

        attendance.endTime = new Date();
        await attendance.save();
        res.json({ message: 'Attendance ended' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.get('/', authMiddleware, async (req, res) => {
    try {
        const { userId, role } = req.user;

        let attendance;
        if (role === 'superadmin') {
            attendance = await Attendance.find();
        } else {
            attendance = await Attendance.find({ userId });
        }

        res.json(attendance);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
