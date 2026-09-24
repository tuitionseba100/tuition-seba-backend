const express = require('express');
const Phone = require('../models/Phone');
const router = express.Router();
const moment = require('moment-timezone');

router.get('/all', async (req, res) => {
    try {
        const { page = 1, limit = 10, phone, type } = req.query;
        const query = {};

        if (phone) {
            query.phone = { $regex: phone, $options: 'i' };
        }

        if (type === 'spam') {
            query.isSpam = true;
        } else if (type === 'best') {
            query.isBest = true;
        } else if (type === 'express') {
            query.isExpress = true;
        } else if (type === 'bestGuardian') {
            query.isBestGuardian = true;
        } else if (type === 'banned') {
            query.isBanned = true;
        }

        const totalRecords = await Phone.countDocuments(query);
        const data = await Phone.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        res.json({
            data,
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalRecords / limit),
            totalRecords
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/summary', async (req, res) => {
    try {
        const total = await Phone.countDocuments();
        const spam = await Phone.countDocuments({ isSpam: true });
        const best = await Phone.countDocuments({ isBest: true });
        const express = await Phone.countDocuments({ isExpress: true });
        const bestGuardian = await Phone.countDocuments({ isBestGuardian: true });
        const banned = await Phone.countDocuments({ isBanned: true });

        res.json({
            total,
            spam,
            best,
            express,
            bestGuardian,
            banned
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/export', async (req, res) => {
    try {
        const { phone, type } = req.query;
        const query = {};

        if (phone) {
            query.phone = { $regex: phone, $options: 'i' };
        }

        if (type === 'spam') {
            query.isSpam = true;
        } else if (type === 'best') {
            query.isBest = true;
        } else if (type === 'express') {
            query.isExpress = true;
        } else if (type === 'bestGuardian') {
            query.isBestGuardian = true;
        } else if (type === 'banned') {
            query.isBanned = true;
        }

        const data = await Phone.find(query).sort({ createdAt: -1 });
        res.json(data);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

//add
router.post('/add', async (req, res) => {
    const { phone, note, isActive, isBest, isSpam, isExpress, isBestGuardian, isBanned, createdBy } = req.body;

    try {
        let normalizedPhone = phone;
        if (phone) {
            // Validation: Only digits and / are allowed
            if (!/^[0-9/]+$/.test(phone)) {
                return res.status(400).json({ message: "Only numbers (0-9) and '/' are allowed in phone field." });
            }

            const inputNumbers = phone.split('/').map(n => n.trim()).filter(n => n);

            // Check for self-duplicates in the input
            const uniqueNumbers = new Set(inputNumbers);
            if (uniqueNumbers.size !== inputNumbers.length) {
                return res.status(400).json({ message: "Duplicate phone number entered in the same record." });
            }

            // Validation: Each number must start with 0
            for (const num of inputNumbers) {
                if (!num.startsWith('0')) {
                    return res.status(400).json({ message: `Each phone number must start with '0'. Invalid number: ${num}` });
                }
            }

            if (inputNumbers.length > 0) {
                const duplicateQuery = {
                    $or: inputNumbers.map(num => ({
                        phone: { $regex: `(^|[/\\s])${num.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([/\\s]|$)` }
                    }))
                };
                const existingPhone = await Phone.findOne(duplicateQuery);
                if (existingPhone) {
                    return res.status(400).json({ message: `Phone number '${existingPhone.phone}' already exists with duplicate number.` });
                }
            }
            normalizedPhone = inputNumbers.join('/');
        }

        const localTime = moment().utcOffset(6 * 60).format("YYYY-MM-DD HH:mm:ss");
        const newPhone = new Phone({ phone: normalizedPhone, note, isActive, isBest, isSpam, isExpress, isBestGuardian, isBanned, createdBy, createdAt: localTime });
        await newPhone.save();
        res.status(201).json(newPhone);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

//for edit
router.put('/edit/:id', async (req, res) => {
    try {
        const { phone } = req.body;
        let normalizedPhone = phone;
        if (phone) {
            // Validation: Only digits and / are allowed
            if (!/^[0-9/]+$/.test(phone)) {
                return res.status(400).json({ message: "Only numbers (0-9) and '/' are allowed in phone field." });
            }

            const inputNumbers = phone.split('/').map(n => n.trim()).filter(n => n);

            // Check for self-duplicates in the input
            const uniqueNumbers = new Set(inputNumbers);
            if (uniqueNumbers.size !== inputNumbers.length) {
                return res.status(400).json({ message: "Duplicate phone number entered in the same record." });
            }

            // Validation: Each number must start with 0
            for (const num of inputNumbers) {
                if (!num.startsWith('0')) {
                    return res.status(400).json({ message: `Each phone number must start with '0'. Invalid number: ${num}` });
                }
            }

            if (inputNumbers.length > 0) {
                const duplicateQuery = {
                    _id: { $ne: req.params.id },
                    $or: inputNumbers.map(num => ({
                        phone: { $regex: `(^|[/\\s])${num.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([/\\s]|$)` }
                    }))
                };
                const existingPhone = await Phone.findOne(duplicateQuery);
                if (existingPhone) {
                    return res.status(400).json({ message: `Phone number '${existingPhone.phone}' already exists with duplicate number.` });
                }
            }
            normalizedPhone = inputNumbers.join('/');
        }

        const updatedData = await Phone.findByIdAndUpdate(req.params.id, { ...req.body, ...(phone ? { phone: normalizedPhone } : {}) }, { new: true });
        res.json(updatedData);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.delete('/delete/:id', async (req, res) => {
    try {
        await Phone.findByIdAndDelete(req.params.id);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Follow-up today alert
router.get('/alert-today', async (req, res) => {
    try {
        const nowBD = new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' });
        const todayBD = new Date(nowBD);

        const startOfDayBD = new Date(todayBD);
        startOfDayBD.setHours(0, 0, 0, 0);

        const endOfDayBD = new Date(todayBD);
        endOfDayBD.setHours(23, 59, 59, 999);

        const startUTC = new Date(startOfDayBD.toLocaleString('en-US', { timeZone: 'UTC' }));
        const endUTC = new Date(endOfDayBD.toLocaleString('en-US', { timeZone: 'UTC' }));

        const data = await Phone.find({
            nextFollowUpDate: { $gte: startUTC, $lte: endUTC }
        }).sort({ nextFollowUpDate: 1 }).lean();

        res.json(data);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
