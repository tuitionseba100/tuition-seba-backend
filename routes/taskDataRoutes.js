const express = require('express');
const TaskData = require('../models/TaskData');
const router = express.Router();
const moment = require('moment-timezone');
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


function escapeRegex(str) {
    if (typeof str !== 'string') {
        str = String(str ?? '');
    }
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/all', authMiddleware, async (req, res) => {
    try {
        const { userId, role } = req.user;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const { tuitionCode, employeeName, status } = req.query;

        const filter = {};
        if (role !== 'superadmin') {
            filter.employeeId = userId;
        }

        if (tuitionCode) {
            filter.tuitionCode = new RegExp(escapeRegex(tuitionCode), 'i');
        }

        if (employeeName) {
            filter.employeeName = new RegExp(escapeRegex(employeeName), 'i');
        }

        if (status) {
            filter.status = status;
        }

        const total = await TaskData.countDocuments(filter);
        const tasks = await TaskData.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        res.json({
            data: tasks,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalRecords: total
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/summary', authMiddleware, async (req, res) => {
    try {
        const { userId, role } = req.user;
        const { tuitionCode, employeeName } = req.query;

        const filter = {};
        if (role !== 'superadmin') {
            filter.employeeId = userId;
        }

        if (tuitionCode) {
            filter.tuitionCode = new RegExp(escapeRegex(tuitionCode), 'i');
        }

        if (employeeName) {
            filter.employeeName = new RegExp(escapeRegex(employeeName), 'i');
        }

        const tasks = await TaskData.find(filter);

        const todayDate = moment().tz('Asia/Dhaka').format('YYYY-MM-DD');

        const counts = {
            total: tasks.length,
            todayAssigned: 0,
            todayPending: 0,
            todayOngoing: 0,
            todayCompleted: 0,
            totalCompleted: 0,
            totalPending: 0,
            totalOngoing: 0
        };

        tasks.forEach(task => {
            const taskDate = moment(task.createdAt).tz('Asia/Dhaka').format('YYYY-MM-DD');
            const isToday = taskDate === todayDate;

            if (isToday) counts.todayAssigned++;
            if (isToday && task.status === 'pending') counts.todayPending++;
            if (isToday && task.status === 'ongoing') counts.todayOngoing++;
            if (isToday && task.status === 'completed') counts.todayCompleted++;
            if (task.status === 'completed') counts.totalCompleted++;
            if (task.status === 'pending') counts.totalPending++;
            if (task.status === 'ongoing') counts.totalOngoing++;
        });

        res.json(counts);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.post('/add', async (req, res) => {
    const {
        tuitionCode,
        employeeName,
        employeeId,
        employeeRole,
        task,
        status,
        comment,
        deadline,
    } = req.body;

    try {
        const localTime = moment().utcOffset(6 * 60).format("YYYY-MM-DD HH:mm:ss");

        const newTask = new TaskData({
            tuitionCode,
            employeeName,
            employeeId,
            employeeRole,
            task,
            createdAt: localTime,
            status,
            comment,
            deadline,
        });

        await newTask.save();
        res.status(201).json(newTask);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.put('/edit/:id', async (req, res) => {
    try {
        const updatedTask = await TaskData.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedTask);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.delete('/delete/:id', async (req, res) => {
    try {
        await TaskData.findByIdAndDelete(req.params.id);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
