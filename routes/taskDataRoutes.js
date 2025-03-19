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


router.get('/all', authMiddleware, async (req, res) => {
    try {
        const { userId, role } = req.user;
        let tasks;

        if (role === 'superadmin') {
            tasks = await TaskData.find();
        } else {
            tasks = await TaskData.find({ employeeId: userId });
        }

        res.json(tasks);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.post('/add', async (req, res) => {
    const {
        tuitionCode,
        tuitionId,
        employeeName,
        employeeId,
        employeeRole,
        task,
        status,
        comment,
    } = req.body;

    try {
        const localTime = moment().utcOffset(6 * 60).format("YYYY-MM-DD HH:mm:ss");

        const newTask = new TaskData({
            tuitionCode,
            tuitionId,
            employeeName,
            employeeId,
            employeeRole,
            task,
            createdAt: localTime,
            status,
            comment,
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
