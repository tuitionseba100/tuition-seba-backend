const express = require('express');
const TuitionApply = require('../models/TuitionApply');
const router = express.Router();
const moment = require('moment-timezone');
const RegTeacher = require('../models/RegTeacher');

router.get('/all', async (req, res) => {
    try {
        const allApply = await TuitionApply.find();
        res.json(allApply);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 50;
    const { search = '', status } = req.query;

    const filter = {};

    if (search) {
        const regex = new RegExp(search, 'i');
        filter.$or = [
            { tuitionCode: regex },
            { phone: regex },
            { address: regex },
            { name: regex }
        ];
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

        const statusBaseFilter = (search || status) ? filter : {};
        const allForCard = await TuitionApply.find(statusBaseFilter).select('status');

        const cardData = {
            pending: 0,
            calledInterested: 0,
            calledNoResponse: 0,
            refertoBM: 0,
            shortlisted: 0,
            requestedForPayment: 0
        };

        allForCard.forEach(t => {
            if (t.status === 'pending') cardData.pending++;
            if (t.status === 'called (interested)') cardData.calledInterested++;
            if (t.status === 'called (no response)') cardData.calledNoResponse++;
            if (t.status === 'refer to bm') cardData.refertoBM++;
            if (t.status === 'shortlisted') cardData.shortlisted++;
            if (t.status === 'requested for payment') cardData.requestedForPayment++;
        });

        res.json({
            data,
            cardData,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalRecords: total
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


