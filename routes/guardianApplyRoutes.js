const express = require('express');
const GuardianApply = require('../models/GuardianApply');
const router = express.Router();
const moment = require('moment-timezone');

router.get('/all', async (req, res) => {
    try {
        const allApply = await GuardianApply.find();
        res.json(allApply);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/getTableData', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 50;

    const {
        phone = '',
        address = '',
        status
    } = req.query;

    const filter = {};

    if (phone) {
        filter.phone = new RegExp(escapeRegex(phone), 'i');
    }

    if (address) {
        filter.address = address;
    }

    if (status) {
        filter.status = status;
    }

    try {
        const total = await GuardianApply.countDocuments(filter);
        const applies = await GuardianApply.find(filter)
            .sort({ _id: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        res.json({
            data: applies,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalRecords: total
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/summary', async (req, res) => {
    const {
        phone = '',
        address = '',
        status
    } = req.query;

    const filter = {};

    if (phone) {
        filter.phone = new RegExp(escapeRegex(phone), 'i');
    }

    if (address) {
        const trimmed = address.trim();
        if (trimmed.length) {
            filter.address = new RegExp(escapeRegex(trimmed), 'i');
        }
    }

    if (status) {
        filter.status = status;
    }

    try {
        const records = await GuardianApply.find(filter).lean();
        const counts = {
            pending: 0,
            no_response: 0,
            meeting_scheduled: 0,
            confirmed: 0,
            not_interested: 0
        };

        records.forEach(tuition => {
            const stat = tuition.status?.toLowerCase();

            if (stat === 'pending') counts.pending++;
            else if (stat === 'called (no response)') counts.no_response++;
            else if (stat === 'meeting scheduled') counts.meeting_scheduled++;
            else if (stat === 'confirmed') counts.confirmed++;
            else if (stat === 'not interested') counts.not_interested++;
        });

        res.json({
            ...counts,
            total: records.length,
            data: records
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/add', async (req, res) => {
    const {
        name,
        phone,
        address,
        studentClass,
        teacherGender,
        characteristics,
    } = req.body;

    try {
        const localTime = moment().utcOffset(6 * 60).format("YYYY-MM-DD HH:mm:ss");

        const newData = new GuardianApply({
            name,
            phone,
            address,
            studentClass,
            teacherGender,
            characteristics,
            appliedAt: localTime,
            status: "pending"
        });

        await newData.save();
        res.status(201).json(newData);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.put('/edit/:id', async (req, res) => {
    try {
        const updatedData = await GuardianApply.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedData);
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
        const updatedData = await GuardianApply.findByIdAndUpdate(
            req.params.id,
            { status, comment },
            { new: true }
        );

        if (!updatedData) {
            return res.status(404).json({ message: "Record not found" });
        }

        res.json(updatedData);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.delete('/delete/:id', async (req, res) => {
    try {
        await GuardianApply.findByIdAndDelete(req.params.id);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;