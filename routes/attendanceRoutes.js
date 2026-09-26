const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const jwt = require('jsonwebtoken');
const User = require('../models/User')


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
            name: user.name,
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

const moment = require('moment-timezone');

const getDateRange = (filter, customYear) => {
    const tz = 'Asia/Dhaka';
    const now = moment.tz(tz);
    const year = customYear ? parseInt(customYear) : now.year();

    if (!filter || filter === 'today') {
        return {
            $gte: now.clone().startOf('day').toDate(),
            $lte: now.clone().endOf('day').toDate()
        };
    } else if (filter === 'last7days') {
        return {
            $gte: now.clone().subtract(6, 'days').startOf('day').toDate(),
            $lte: now.clone().endOf('day').toDate()
        };
    } else if (filter === 'runningMonth') {
        return {
            $gte: now.clone().startOf('month').toDate(),
            $lte: now.clone().endOf('day').toDate()
        };
    } else if (filter === 'lastMonth') {
        const lastMonth = now.clone().subtract(1, 'month');
        return {
            $gte: lastMonth.clone().startOf('month').toDate(),
            $lte: lastMonth.clone().endOf('month').toDate()
        };
    } else if (filter === 'all') {
        return null;
    } else {
        // Specific month name (e.g., 'january', 'february'...)
        const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
        const mIndex = monthNames.indexOf(String(filter).toLowerCase());
        if (mIndex !== -1) {
            const start = moment.tz({ year, month: mIndex, day: 1 }, tz).startOf('day').toDate();
            const end = moment.tz({ year, month: mIndex, day: 1 }, tz).endOf('month').toDate();
            return { $gte: start, $lte: end };
        }
    }
    return null;
};

router.get('/', authMiddleware, async (req, res) => {
    try {
        const { userId, role } = req.user;
        const { filter = 'today', userFilter, year } = req.query;

        const query = {};

        if (role === 'superadmin') {
            if (userFilter) {
                query.userId = userFilter;
            }
        } else {
            query.userId = userId;
        }

        const dateRange = getDateRange(filter, year);
        if (dateRange) {
            query.startTime = dateRange;
        }

        const attendance = await Attendance.find(query).sort({ startTime: -1 }).lean();
        res.json(attendance);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/summary', authMiddleware, async (req, res) => {
    try {
        const { userId, role } = req.user;
        const { filter = 'runningMonth', userFilter, year } = req.query;

        const query = {};
        if (role === 'superadmin') {
            if (userFilter) {
                query.userId = userFilter;
            }
        } else {
            query.userId = userId;
        }

        const dateRange = getDateRange(filter || 'runningMonth', year);
        if (dateRange) {
            query.startTime = dateRange;
        }

        const records = await Attendance.find(query).sort({ startTime: -1 }).lean();

        const summaryMap = {};

        records.forEach(entry => {
            const uName = entry.userName || 'Unknown';
            if (!summaryMap[uName]) {
                summaryMap[uName] = {
                    name: entry.name || uName,
                    userName: uName,
                    totalSessions: 0,
                    runningSessions: 0,
                    totalHours: 0,
                    presentDays: new Set()
                };
            }

            summaryMap[uName].totalSessions += 1;

            if (!entry.endTime) {
                summaryMap[uName].runningSessions += 1;
            } else if (entry.startTime) {
                const duration = (new Date(entry.endTime) - new Date(entry.startTime)) / 3600000;
                summaryMap[uName].totalHours += duration;
            }

            const sessionDate = moment(entry.startTime).tz('Asia/Dhaka').format('YYYY-MM-DD');
            summaryMap[uName].presentDays.add(sessionDate);
        });

        const summaries = Object.values(summaryMap).map(s => {
            const daysCount = s.presentDays.size;
            return {
                name: s.name,
                userName: s.userName,
                totalSessions: s.totalSessions,
                runningSessions: s.runningSessions,
                totalDaysPresent: daysCount,
                avgHours: s.totalSessions > 0 ? (s.totalHours / s.totalSessions).toFixed(1) : '0.0',
                avgHoursPerDay: daysCount > 0 ? (s.totalHours / daysCount).toFixed(1) : '0.0',
                totalHours: s.totalHours.toFixed(1)
            };
        });

        res.json(summaries);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.put('/edit/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.user;

        if (role !== 'superadmin') {
            return res.status(403).json({ message: 'Access denied. Only superadmins can edit records.' });
        }

        const attendance = await Attendance.findById(id);
        if (!attendance) {
            return res.status(404).json({ message: 'Attendance record not found' });
        }

        const { startTime, endTime } = req.body;

        if (startTime) attendance.startTime = new Date(startTime);
        if (endTime) attendance.endTime = new Date(endTime);

        if (attendance.startTime && attendance.endTime) {
            attendance.duration = calculateDuration(attendance.startTime, attendance.endTime);
        } else {
            attendance.duration = undefined;
        }

        await attendance.save();

        res.json({ message: 'Attendance record edited successfully', attendance });
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

router.get('/is-day-started', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.user;

        const existingRecord = await Attendance.findOne({ userId, endTime: null }).select('_id').lean();

        if (existingRecord) {
            return res.json({ isDayStarted: true, message: 'Day already started' });
        } else {
            return res.json({ isDayStarted: false, message: 'Day not started yet' });
        }
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
