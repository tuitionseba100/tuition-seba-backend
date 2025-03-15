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


const calculateDuration = (start, end) => {
    const diffMs = end - start;
    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
};


router.post('/start', authMiddleware, async (req, res) => {
    try {
        const { userId, role } = req.user;

        const user = await User.findById(userId);

        if (!user) {
            return res.status(400).json({ message: 'User not found' });
        }

        const existingRecord = await Attendance.findOne({ userId, endTime: null });

        if (existingRecord) {
            return res.status(400).json({ message: 'You already started your day' });
        }

        const attendance = new Attendance({
            userId,
            userName: user.username,
            role,
            startTime: new Date(),
        });

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
        attendance.duration = calculateDuration(attendance.startTime, attendance.endTime);
        await attendance.save();
        res.json({ message: 'Attendance ended', duration: attendance.duration });
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

router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.user;

        if (role !== 'superadmin') {
            return res.status(403).json({ message: 'Access denied. Only superadmins can delete records.' });
        }

        const attendance = await Attendance.findById(id);
        if (!attendance) {
            return res.status(404).json({ message: 'Attendance record not found' });
        }

        await Attendance.findByIdAndDelete(id);
        res.json({ message: 'Attendance record deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


module.exports = router;
