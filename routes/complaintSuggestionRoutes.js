const express = require('express');
const router = express.Router();
const ComplaintSuggestion = require('../models/ComplaintSuggestion');
const Phone = require('../models/Phone');
const jwt = require('jsonwebtoken');

// Helper to normalize phone number digits
const normalizePhone = (num) => {
    if (!num) return '';
    let digits = num.replace(/\D/g, '');
    if (digits.startsWith('880')) digits = digits.slice(3);
    while (digits.startsWith('0')) digits = digits.slice(1);
    return digits;
};

// Helper to format phone number for storage
function normalizePhoneForSave(phone) {
    let digits = phone.replace(/\D/g, '');
    if (digits.startsWith('880')) {
        digits = digits.slice(3);
    }
    if (!digits.startsWith('0') && digits.length > 0) {
        digits = '0' + digits;
    }
    return digits;
}

// Authentication middleware
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

// Superadmin middleware
const superadminMiddleware = (req, res, next) => {
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Superadmin access required' });
    }
    next();
};

// POST /submit (Public submission endpoint)
router.post('/submit', async (req, res) => {
    try {
        const { type, category, name, phone, teacherCode, description } = req.body;

        if (!type || !category || !name || !phone || !description) {
            return res.status(400).json({ message: 'Required fields missing' });
        }

        const normalizedInputPhone = normalizePhone(phone);
        const savedPhone = normalizePhoneForSave(phone);

        // Fetch active phone records to check spam and best status
        const phoneList = await Phone.find({ isActive: true });

        let isSpam = false;
        let isBest = false;

        for (const entry of phoneList) {
            const normalizedDbPhone = normalizePhone(entry.phone);
            if (normalizedDbPhone === normalizedInputPhone) {
                if (entry.isSpam) {
                    isSpam = true;
                }
                if (entry.isBest) {
                    isBest = true;
                }
                break;
            }
        }

        const newRecord = new ComplaintSuggestion({
            type,
            category,
            name,
            phone: savedPhone,
            teacherCode: teacherCode || '',
            description,
            isSpam,
            isBest
        });

        await newRecord.save();
        res.status(201).json({ message: 'Submitted successfully', data: newRecord });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET /summary (Authenticated admins)
router.get('/summary', authMiddleware, async (req, res) => {
    try {
        const total = await ComplaintSuggestion.countDocuments();
        const pending = await ComplaintSuggestion.countDocuments({ status: 'Pending' });
        const inProgress = await ComplaintSuggestion.countDocuments({ status: 'In Progress' });
        const resolved = await ComplaintSuggestion.countDocuments({ status: 'Resolved' });
        const dismissed = await ComplaintSuggestion.countDocuments({ status: 'Dismissed' });
        const spam = await ComplaintSuggestion.countDocuments({ isSpam: true });

        res.json({
            total,
            pending,
            inProgress,
            resolved,
            dismissed,
            spam
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET /list (Authenticated admins)
router.get('/list', authMiddleware, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 25;
        const { type, status, isSpam, search } = req.query;

        const filter = {};
        if (type) filter.type = type;
        if (status) filter.status = status;
        if (isSpam) filter.isSpam = isSpam === 'true';

        if (search) {
            filter.$or = [
                { phone: new RegExp(search.trim(), 'i') },
                { name: new RegExp(search.trim(), 'i') },
                { teacherCode: new RegExp(search.trim(), 'i') }
            ];
        }

        const total = await ComplaintSuggestion.countDocuments(filter);
        const data = await ComplaintSuggestion.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        // Calculate spam count for each phone number
        const dataWithSpamCount = await Promise.all(data.map(async (doc) => {
            const spamCount = await ComplaintSuggestion.countDocuments({
                phone: doc.phone,
                status: 'Spam (Dismissed)'
            });
            return { ...doc, spamCount };
        }));

        res.json({
            data: dataWithSpamCount,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalRecords: total
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// PUT /:id/status (Authenticated admins)
router.put('/:id/status', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, adminComment } = req.body;

        if (!status) {
            return res.status(400).json({ message: 'Status is required' });
        }

        const record = await ComplaintSuggestion.findByIdAndUpdate(
            id,
            { status, adminComment },
            { new: true }
        );

        if (!record) {
            return res.status(404).json({ message: 'Record not found' });
        }

        res.json({ message: 'Updated successfully', data: record });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// DELETE /:id (Superadmins only)
router.delete('/:id', authMiddleware, superadminMiddleware, async (req, res) => {
    try {
        const record = await ComplaintSuggestion.findByIdAndDelete(req.params.id);
        if (!record) {
            return res.status(404).json({ message: 'Record not found' });
        }
        res.json({ message: 'Deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
