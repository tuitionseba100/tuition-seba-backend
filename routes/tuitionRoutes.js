const express = require('express');
const Tuition = require('../models/Tuition');
const router = express.Router();

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

router.get('/available', async (req, res) => {
    try {
        const tuitions = await Tuition.find({ isPublish: true }).select('-status -guardianNumber');
        res.json(tuitions);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/all', authMiddleware, async (req, res) => {
    try {
        const tuitions = await Tuition.find();
        res.json(tuitions);
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
        tuitionCode = '',
        guardianNumber = '',
        tutorNumber = '',
        isPublish,
        isUrgent,
        status
    } = req.query;

    const filter = {};

    if (tuitionCode) {
        filter.tuitionCode = new RegExp(escapeRegex(tuitionCode), 'i');
    }

    if (guardianNumber) {
        filter.guardianNumber = new RegExp(escapeRegex(guardianNumber), 'i');
    }

    if (tutorNumber) {
        filter.tutorNumber = new RegExp(escapeRegex(tutorNumber), 'i');
    }

    if (isPublish !== undefined) {
        filter.isPublish = isPublish === 'true';
    }

    if (isUrgent !== undefined) {
        filter.isUrgent = isUrgent === 'true';
    }

    if (status) {
        filter.status = status;
    }

    try {
        const total = await Tuition.countDocuments(filter);
        const tuitions = await Tuition.find(filter)
            .sort({ _id: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        res.json({
            data: tuitions,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalRecords: total
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/alert-today', authMiddleware, async (req, res) => {
    try {
        const nowBD = new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' });
        const todayBD = new Date(nowBD);

        const startOfDayBD = new Date(todayBD);
        startOfDayBD.setHours(0, 0, 0, 0);

        const endOfDayBD = new Date(todayBD);
        endOfDayBD.setHours(23, 59, 59, 999);

        const startUTC = new Date(startOfDayBD.toLocaleString('en-US', { timeZone: 'UTC' }));
        const endUTC = new Date(endOfDayBD.toLocaleString('en-US', { timeZone: 'UTC' }));

        const tuitions = await Tuition.find({
            nextUpdateDate: { $gte: startUTC, $lte: endUTC }
        }).sort({ nextUpdateDate: 1 });

        res.json(tuitions);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/pending-payment-creation', authMiddleware, async (req, res) => {
    try {
        const tuitions = await Tuition.find({
            status: 'confirm',
            isPaymentCreated: false
        });

        res.json(tuitions);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/summary', async (req, res) => {
    const {
        tuitionCode = '',
        guardianNumber = '',
        tutorNumber = '',
        isPublish,
        isUrgent,
        status
    } = req.query;

    const filter = {};

    if (tuitionCode) {
        filter.tuitionCode = new RegExp(escapeRegex(tuitionCode), 'i');
    }

    if (guardianNumber) {
        filter.guardianNumber = new RegExp(escapeRegex(guardianNumber), 'i');
    }

    if (tutorNumber) {
        filter.tutorNumber = new RegExp(escapeRegex(tutorNumber), 'i');
    }

    if (isPublish !== undefined) {
        filter.isPublish = isPublish === 'true';
    }

    if (isUrgent !== undefined) {
        filter.isUrgent = isUrgent === 'true';
    }

    if (status) {
        filter.status = status;
    }

    try {
        const records = await Tuition.find(filter).lean();
        const isPublishTrueCount = await Tuition.countDocuments({ isPublish: true });

        const counts = {
            available: 0,
            givenNumber: 0,
            guardianMeet: 0,
            demoClassRunning: 0,
            confirm: 0,
            cancel: 0
        };

        records.forEach(tuition => {
            const stat = tuition.status?.toLowerCase();

            if (stat === 'available') counts.available++;
            else if (stat === 'given number') counts.givenNumber++;
            else if (stat === 'guardian meet') counts.guardianMeet++;
            else if (stat === 'demo class running') counts.demoClassRunning++;
            else if (stat === 'confirm') counts.confirm++;
            else if (stat === 'cancel') counts.cancel++;
        });

        res.json({
            ...counts,
            total: records.length,
            isPublishTrueCount,
            data: records
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/add', authMiddleware, async (req, res) => {
    const {
        tuitionCode,
        isPublish,
        wantedTeacher,
        student,
        class: className,
        medium,
        institute,
        subject,
        day,
        time,
        salary,
        location,
        city,
        area,
        guardianNumber,
        status,
        joining,
        note,
        tutorNumber,
        isUrgent,
        taskAssignedTo,
        isWhatsappApply,
        updatedBy,
        lastAvailableCheck,
        lastUpdate,
        lastUpdateComment,
        nextUpdateDate,
        nextUpdateComment,
        comment1,
        comment2,
        isPaymentCreated
    } = req.body;

    try {
        const newTuition = new Tuition({
            tuitionCode,
            isPublish,
            wantedTeacher,
            student,
            class: className,
            medium,
            institute,
            subject,
            day,
            time,
            salary,
            city,
            location,
            area,
            guardianNumber,
            status,
            joining,
            note,
            tutorNumber,
            isUrgent,
            taskAssignedTo,
            isWhatsappApply,
            updatedBy,
            lastAvailableCheck: lastAvailableCheck ? new Date(lastAvailableCheck) : null,
            lastUpdate: lastUpdate ? new Date(lastUpdate) : null,
            lastUpdateComment,
            nextUpdateDate: nextUpdateDate ? new Date(nextUpdateDate) : null,
            nextUpdateComment,
            comment1,
            comment2,
            isPaymentCreated
        });

        await newTuition.save();
        res.status(201).json(newTuition);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.put('/edit/:id', authMiddleware, async (req, res) => {
    try {
        const updatedTuition = await Tuition.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedTuition);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const tuition = await Tuition.findById(req.params.id);
        if (!tuition) {
            return res.status(404).json({ message: 'Tuition not found' });
        }
        res.json(tuition);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.delete('/delete/:id', authMiddleware, async (req, res) => {
    try {
        await Tuition.findByIdAndDelete(req.params.id);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
