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

        res.json({
            total,
            spam,
            best,
            express,
            bestGuardian
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
        }

        const data = await Phone.find(query).sort({ createdAt: -1 });
        res.json(data);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

//add
router.post('/add', async (req, res) => {
    const { phone, note, isActive, isBest, isSpam, isExpress, isBestGuardian } = req.body;

    try {
        if (phone) {
            const inputNumbers = phone.split('/').map(n => n.trim()).filter(n => n);
            if (inputNumbers.length > 0) {
                const duplicateQuery = {
                    $or: inputNumbers.map(num => ({
                        phone: { $regex: `(^|/)${num.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|/)` }
                    }))
                };
                const existingPhone = await Phone.findOne(duplicateQuery);
                if (existingPhone) {
                    return res.status(400).json({ message: `Phone number ${existingPhone.phone} already exists (or contains a duplicate number)` });
                }
            }
        }

        const localTime = moment().utcOffset(6 * 60).format("YYYY-MM-DD HH:mm:ss");
        const newPhone = new Phone({ phone, note, isActive, isBest, isSpam, isExpress, isBestGuardian, createdAt: localTime });
        await newPhone.save();
        res.status(201).json(newPhone);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

//for edit
router.put('/edit/:id', async (req, res) => {
    try {
        if (req.body.phone) {
            const inputNumbers = req.body.phone.split('/').map(n => n.trim()).filter(n => n);
            if (inputNumbers.length > 0) {
                const duplicateQuery = {
                    _id: { $ne: req.params.id },
                    $or: inputNumbers.map(num => ({
                        phone: { $regex: `(^|/)${num.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|/)` }
                    }))
                };
                const existingPhone = await Phone.findOne(duplicateQuery);
                if (existingPhone) {
                    return res.status(400).json({ message: `Phone number ${existingPhone.phone} already exists (or contains a duplicate number)` });
                }
            }
        }

        const updatedData = await Phone.findByIdAndUpdate(req.params.id, req.body, { new: true });
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

module.exports = router;
