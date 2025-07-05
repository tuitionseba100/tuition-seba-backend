const express = require('express');
const jwt = require('jsonwebtoken');
const RegTeacher = require('../models/RegTeacher');
const router = express.Router();
const moment = require('moment-timezone');
const path = require('path');

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
        const allTeachers = await RegTeacher.find();
        res.json(allTeachers);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/check-exists', async (req, res) => {
    const { premiumCode, phone } = req.query;

    if (!premiumCode || !phone) {
        return res.status(400).json({ message: 'Both premiumCode and phone query parameters are required' });
    }

    try {
        const existing = await RegTeacher.findOne({ premiumCode, phone }).lean();

        res.json({ exists: Boolean(existing) });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/check-exists-with-phone', async (req, res) => {
    const { phone } = req.query;

    if (!phone) {
        return res.status(400).json({ message: 'Phone is required' });
    }

    try {
        const existing = await RegTeacher.findOne({ phone }).lean();

        res.json({ exists: Boolean(existing) });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.post('/add', async (req, res) => {
    try {
        const localTime = moment().utcOffset(6 * 60).format("YYYY-MM-DD HH:mm:ss");

        const newTeacher = new RegTeacher({
            ...req.body,
            photo: req.file ? req.file.filename : null,
            createdAt: localTime,
            status: 'pending'
        });

        await newTeacher.save();
        res.status(201).json(newTeacher);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.put('/edit/:id', authMiddleware, async (req, res) => {
    try {
        const updatedTeacher = await RegTeacher.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        res.json(updatedTeacher);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.put('/update-status/:id', async (req, res) => {
    const { status, comment } = req.body;

    if (!status) {
        return res.status(400).json({ message: "Status is required" });
    }

    try {
        const updatedTeacher = await RegTeacher.findByIdAndUpdate(
            req.params.id,
            { status, comment },
            { new: true }
        );

        if (!updatedTeacher) {
            return res.status(404).json({ message: "Record not found" });
        }

        res.json(updatedTeacher);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.delete('/delete/:id', authMiddleware, async (req, res) => {
    try {
        await RegTeacher.findByIdAndDelete(req.params.id);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
