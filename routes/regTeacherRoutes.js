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

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/getTableData', authMiddleware, async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 50;

    const {
        premiumCode = '',
        phone = '',
        status,
        gender,
        name,
        currentArea,
    } = req.query;

    const filter = {};

    if (premiumCode) {
        filter.premiumCode = new RegExp(escapeRegex(premiumCode), 'i');
    }

    if (phone) {
        filter.$or = [
            { phone: new RegExp(escapeRegex(phone), 'i') },
            { alternativePhone: new RegExp(escapeRegex(phone), 'i') },
            { whatsapp: new RegExp(escapeRegex(phone), 'i') }
        ];
    }

    if (status) {
        filter.status = status;
    }

    if (gender) {
        filter.gender = gender;
    }

    if (name) {
        filter.name = new RegExp(escapeRegex(name), 'i');
    }

    if (currentArea) {
        filter.currentArea = new RegExp(escapeRegex(currentArea), 'i');
    }

    try {
        const total = await RegTeacher.countDocuments(filter);
        const data = await RegTeacher.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        res.json({
            data,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalRecords: total
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/summary', authMiddleware, async (req, res) => {
    const {
        premiumCode = '',
        phone = '',
        status,
        gender,
        name,
        currentArea
    } = req.query;

    const filter = {};

    if (premiumCode) {
        filter.premiumCode = new RegExp(escapeRegex(premiumCode), 'i');
    }

    if (phone) {
        filter.$or = [
            { phone: new RegExp(escapeRegex(phone), 'i') },
            { alternativePhone: new RegExp(escapeRegex(phone), 'i') },
            { whatsapp: new RegExp(escapeRegex(phone), 'i') }
        ];
    }

    if (status) {
        filter.status = status;
    }

    if (gender) {
        filter.gender = gender;
    }

    if (name) {
        filter.name = new RegExp(escapeRegex(name), 'i');
    }

    if (currentArea) {
        filter.currentArea = new RegExp(escapeRegex(currentArea), 'i');
    }

    try {
        const records = await RegTeacher.find(filter).lean();

        const counts = {
            pending: 0,
            under_review: 0,
            pending_payment: 0,
            rejected: 0,
            verified: 0
        };

        records.forEach(teacher => {
            const stat = teacher.status?.toLowerCase();

            if (stat === 'pending') counts.pending++;
            else if (stat === 'under review') counts.under_review++;
            else if (stat === 'pending payment') counts.pending_payment++;
            else if (stat === 'rejected') counts.rejected++;
            else if (stat === 'verified') counts.verified++;
        });

        res.json({
            ...counts,
            total: records.length,
            allData: records
        });
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
        const { phone, alternativePhone, whatsapp } = req.body;

        const allInputValues = [phone, alternativePhone, whatsapp];

        const existing = await RegTeacher.find({
            $or: [
                { phone: { $in: allInputValues } },
                { alternativePhone: { $in: allInputValues } },
                { whatsapp: { $in: allInputValues } }
            ]
        });

        if (existing.length > 0) {
            const matchedInputs = new Set();

            existing.forEach(entry => {
                if (entry.phone === phone) matchedInputs.add('phone');
                if (entry.phone === alternativePhone) matchedInputs.add('alternativePhone');
                if (entry.phone === whatsapp) matchedInputs.add('whatsapp');

                if (entry.alternativePhone === phone) matchedInputs.add('phone');
                if (entry.alternativePhone === alternativePhone) matchedInputs.add('alternativePhone');
                if (entry.alternativePhone === whatsapp) matchedInputs.add('whatsapp');

                if (entry.whatsapp === phone) matchedInputs.add('phone');
                if (entry.whatsapp === alternativePhone) matchedInputs.add('alternativePhone');
                if (entry.whatsapp === whatsapp) matchedInputs.add('whatsapp');
            });

            return res.status(400).json({
                message: 'একই তথ্য দিয়ে ইতোমধ্যে আবেদন করা হয়েছে।',
                duplicates: Array.from(matchedInputs)
            });
        }

        const localTime = moment().utcOffset(6 * 60).format("YYYY-MM-DD HH:mm:ss");

        const newTeacher = new RegTeacher({
            ...req.body,
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
