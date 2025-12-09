const express = require('express');
const Lead = require('../models/Lead');
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
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/all', authMiddleware, async (req, res) => {
    try {
        const leads = await Lead.find();
        res.json(leads);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/getTableData', authMiddleware, async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 50;

    const {
        phone = '',
        name = '',
        number = '',
        status = '',
        employeeId = '',
        employeeName = '',
        createdBy = '',
        tuitionCode = ''
    } = req.query;

    const filter = {};

    if (phone) filter.phone = new RegExp(escapeRegex(phone), 'i');
    if (name) filter.name = new RegExp(escapeRegex(name), 'i');
    if (number) filter.number = new RegExp(escapeRegex(number), 'i');
    if (employeeId) filter.employeeId = new RegExp(escapeRegex(employeeId), 'i');
    if (employeeName) filter.employeeName = new RegExp(escapeRegex(employeeName), 'i');
    if (createdBy) filter.createdBy = new RegExp(escapeRegex(createdBy), 'i');
    if (status) filter.status = status;
    if (tuitionCode) filter.tuitionCode = new RegExp(escapeRegex(tuitionCode), 'i');

    try {
        const total = await Lead.countDocuments(filter);

        const leads = await Lead.find(filter)
            .sort({ _id: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        res.json({
            data: leads,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalRecords: total
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.get('/today-followups', authMiddleware, async (req, res) => {
    try {
        const nowBD = new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' });
        const today = new Date(nowBD);

        const start = new Date(today);
        start.setHours(0, 0, 0, 0);

        const end = new Date(today);
        end.setHours(23, 59, 59, 999);

        const startUTC = new Date(start.toLocaleString('en-US', { timeZone: 'UTC' }));
        const endUTC = new Date(end.toLocaleString('en-US', { timeZone: 'UTC' }));

        const leads = await Lead.find({
            followUpDate: { $gte: startUTC, $lte: endUTC }
        }).sort({ followUpDate: 1 });

        res.json(leads);

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.get('/summary', authMiddleware, async (req, res) => {
    const {
        phone = '',
        name = '',
        number = '',
        status = '',
        employeeId = '',
        employeeName = '',
        createdBy = '',
        tuitionCode = ''
    } = req.query;

    const filter = {};

    if (phone) filter.phone = new RegExp(escapeRegex(phone), 'i');
    if (name) filter.name = new RegExp(escapeRegex(name), 'i');
    if (number) filter.number = new RegExp(escapeRegex(number), 'i');
    if (employeeId) filter.employeeId = new RegExp(escapeRegex(employeeId), 'i');
    if (employeeName) filter.employeeName = new RegExp(escapeRegex(employeeName), 'i');
    if (createdBy) filter.createdBy = new RegExp(escapeRegex(createdBy), 'i');
    if (status) filter.status = status;
    if (tuitionCode) filter.tuitionCode = new RegExp(escapeRegex(tuitionCode), 'i');

    try {
        const records = await Lead.find(filter).lean();

        const counts = {
            pending: 0,
            employeeAssigned: 0,
            underReview: 0,
            confirmed: 0,
            cancel: 0,
            suspended: 0
        };

        records.forEach(lead => {
            const s = lead.status?.toLowerCase();

            if (s === 'pending') counts.pending++;
            else if (s === 'employee assigned') counts.employeeAssigned++;
            else if (s === 'under review') counts.underReview++;
            else if (s === 'confirmed') counts.confirmed++;
            else if (s === 'cancel') counts.cancel++;
            else if (s === 'suspended') counts.suspended++;
        });

        res.json({
            total: records.length,
            ...counts,
            data: records
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/add', authMiddleware, async (req, res) => {
    try {
        const newLead = new Lead({
            ...req.body,
            followUpDate: req.body.followUpDate ? new Date(req.body.followUpDate) : null
        });

        await newLead.save();
        res.status(201).json(newLead);

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.put('/edit/:id', authMiddleware, async (req, res) => {
    try {
        const updated = await Lead.findByIdAndUpdate(
            req.params.id,
            {
                ...req.body,
                followUpDate: req.body.followUpDate ? new Date(req.body.followUpDate) : null
            },
            { new: true }
        );

        res.json(updated);

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id);
        if (!lead) return res.status(404).json({ message: 'Lead not found' });
        res.json(lead);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.delete('/delete/:id', authMiddleware, async (req, res) => {
    try {
        await Lead.findByIdAndDelete(req.params.id);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
