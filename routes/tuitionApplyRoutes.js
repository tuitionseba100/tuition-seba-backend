const express = require('express');
const TuitionApply = require('../models/TuitionApply');
const router = express.Router();
const moment = require('moment-timezone');
const RegTeacher = require('../models/RegTeacher');
const Phone = require('../models/Phone');

router.get('/all', async (req, res) => {
    try {
        const allApply = await TuitionApply.find();
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
    const { tuitionCode = '', phone = '', status } = req.query;

    const filter = {};

    if (tuitionCode) {
        filter.tuitionCode = new RegExp(escapeRegex(tuitionCode), 'i');
    }

    if (phone) {
        filter.phone = new RegExp(escapeRegex(phone), 'i');
    }

    if (status) {
        filter.status = status;
    }

    try {
        const total = await TuitionApply.countDocuments(filter);
        const data = await TuitionApply.find(filter)
            .sort({ appliedAt: -1 })
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

router.get('/summary', async (req, res) => {
    const { tuitionCode = '', phone = '', status } = req.query;

    const filter = {};

    if (tuitionCode) {
        filter.tuitionCode = new RegExp(escapeRegex(tuitionCode), 'i');
    }

    if (phone) {
        filter.phone = new RegExp(escapeRegex(phone), 'i');
    }

    if (status) {
        filter.status = status;
    }

    try {
        const records = await TuitionApply.find(filter).select('status').lean();

        const counts = {
            pending: 0,
            calledInterested: 0,
            calledNoResponse: 0,
            refertoBM: 0,
            shortlisted: 0,
            requestedForPayment: 0
        };

        records.forEach(tuition => {
            const stat = tuition.status?.toLowerCase();

            if (stat === 'pending') counts.pending++;
            else if (stat === 'called (interested)') counts.calledInterested++;
            else if (stat === 'called (no response)') counts.calledNoResponse++;
            else if (stat === 'refer to bm') counts.refertoBM++;
            else if (stat === 'shortlisted') counts.shortlisted++;
            else if (stat === 'requested for payment') counts.requestedForPayment++;
        });

        res.json({
            ...counts,
            total: records.length
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

/*
router.post('/add', async (req, res) => {
    const {
        premiumCode,
        tuitionCode,
        tuitionId,
        name,
        phone,
        institute,
        department,
        address,
        status,
        comment,
        commentForTeacher,
    } = req.body;

    try {
        const regTeacherExists = await RegTeacher.findOne({ premiumCode, phone }).lean();

        if (!regTeacherExists) {
            return res.status(404).json({ message: "No registered teacher found with provided premiumCode and phone" });
        }

        const localTime = moment().utcOffset(6 * 60).format("YYYY-MM-DD HH:mm:ss");

        const newApply = new TuitionApply({
            premiumCode,
            tuitionCode,
            tuitionId,
            name,
            phone,
            institute,
            department,
            address,
            comment,
            commentForTeacher,
            appliedAt: localTime,
            status: status || 'pending'
        });

        await newApply.save();
        res.status(201).json(newApply);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});
*/

const normalizePhone = (num) => {
    if (!num) return '';
    let digits = num.replace(/\D/g, '');
    if (digits.startsWith('880')) digits = digits.slice(3);
    while (digits.startsWith('0')) digits = digits.slice(1);
    return digits;
};

router.post('/add', async (req, res) => {
    const {
        premiumCode,
        tuitionCode,
        tuitionId,
        name,
        phone,
        institute,
        department,
        address,
        status,
        comment,
        commentForTeacher,
    } = req.body;

    try {
        const normalizedInputPhone = normalizePhone(phone);

        const spamPhones = await Phone.find({ isSpam: true });

        let isSpam = false;
        for (const spamPhoneEntry of spamPhones) {
            const normalizedSpamPhone = normalizePhone(spamPhoneEntry.phone);
            if (normalizedSpamPhone === normalizedInputPhone) {
                isSpam = true;
                break;
            }
        }

        const localTime = moment().utcOffset(6 * 60).format("YYYY-MM-DD HH:mm:ss");

        const newApply = new TuitionApply({
            premiumCode,
            tuitionCode,
            tuitionId,
            name,
            phone,
            institute,
            department,
            address,
            comment,
            commentForTeacher,
            appliedAt: localTime,
            status: status || 'pending',
            isSpam,
        });

        await newApply.save();
        res.status(201).json(newApply);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/getTuitionStatuses', async (req, res) => {
    try {
        const summary = await TuitionApply.find({}, 'tuitionCode appliedAt status commentForTeacher phone');
        res.json(summary);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.put('/edit/:id', async (req, res) => {
    try {
        const updatedData = await TuitionApply.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedData);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.delete('/delete/:id', async (req, res) => {
    try {
        await TuitionApply.findByIdAndDelete(req.params.id);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;


