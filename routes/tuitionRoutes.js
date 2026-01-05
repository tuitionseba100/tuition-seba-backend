const express = require('express');
const Tuition = require('../models/Tuition');
const router = express.Router();
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

router.get('/getTableData', async (req, res) => {
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

        const tuitions = await Tuition.find({
            nextUpdateDate: { $gte: startUTC, $lte: endUTC }
        }).sort({ nextUpdateDate: 1 });

        res.json(tuitions);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/pending-payment-creation', async (req, res) => {
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
        const countsAggregation = await Tuition.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        const counts = {
            available: 0,
            givenNumber: 0,
            guardianMeet: 0,
            demoClassRunning: 0,
            confirm: 0,
            cancel: 0
        };

        countsAggregation.forEach(item => {
            const stat = item._id?.toLowerCase();
            if (stat === 'available') counts.available = item.count;
            else if (stat === 'given number') counts.givenNumber = item.count;
            else if (stat === 'guardian meet') counts.guardianMeet = item.count;
            else if (stat === 'demo class running') counts.demoClassRunning = item.count;
            else if (stat === 'confirm') counts.confirm = item.count;
            else if (stat === 'cancel') counts.cancel = item.count;
        });

        const total = await Tuition.countDocuments(filter);

        res.json({
            ...counts,
            total
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message });
    }
});

router.post('/add', async (req, res) => {
    const {
        tuitionCode,
        isPublish,
        wantedTeacher,
        student,
        createdBy,
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
            createdBy,
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

router.put('/edit/:id', async (req, res) => {
    try {
        const updatedTuition = await Tuition.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedTuition);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/exportAll', async (req, res) => {
    try {
        // Set headers for CSV download
        res.setHeader(
            'Content-Type',
            'text/csv'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename=tuitions_all.csv'
        );

        // Create a writable stream to send data directly to response
        const { Transform } = require('stream');

        // Write CSV header
        const header = 'Tuition Code,Is Publish,Wanted Teacher,Student,Created By,Class,Medium,Institute,Subject,Day,Time,Salary,Location,City,Area,Guardian Number,Status,Joining,Note,Tutor Number,Is Urgent,Task Assigned To,Is Whatsapp Apply,Updated By,Last Available Check,Last Update,Last Update Comment,Next Update Date,Next Update Comment,Comment 1,Comment 2,Is Payment Created\n';
        res.write(header);

        // Process documents in batches to avoid memory issues
        const batchSize = 1000; // Process 1000 records at a time
        let skip = 0;

        while (true) {
            const batch = await Tuition.find().skip(skip).limit(batchSize).lean();

            if (batch.length === 0) {
                break; // No more records
            }

            // Process each document in the batch
            for (const doc of batch) {
                // Escape CSV fields that might contain commas, quotes, or newlines
                const escapeCsvField = (field) => {
                    if (field === null || field === undefined) return '';
                    field = String(field);
                    if (field.includes(',') || field.includes('"') || field.includes('\n') || field.includes('\r')) {
                        return '"' + field.replace(/"/g, '""') + '"';
                    }
                    return field;
                };

                const row = [
                    escapeCsvField(doc.tuitionCode || ''),
                    escapeCsvField(doc.isPublish ? 'Yes' : 'No'),
                    escapeCsvField(doc.wantedTeacher || ''),
                    escapeCsvField(doc.student || ''),
                    escapeCsvField(doc.createdBy || ''),
                    escapeCsvField(doc.class || ''),
                    escapeCsvField(doc.medium || ''),
                    escapeCsvField(doc.institute || ''),
                    escapeCsvField(doc.subject || ''),
                    escapeCsvField(doc.day || ''),
                    escapeCsvField(doc.time || ''),
                    escapeCsvField(doc.salary || ''),
                    escapeCsvField(doc.location || ''),
                    escapeCsvField(doc.city || ''),
                    escapeCsvField(doc.area || ''),
                    escapeCsvField(doc.guardianNumber || ''),
                    escapeCsvField(doc.status || ''),
                    escapeCsvField(doc.joining || ''),
                    escapeCsvField(doc.note || ''),
                    escapeCsvField(doc.tutorNumber || ''),
                    escapeCsvField(doc.isUrgent ? 'Yes' : 'No'),
                    escapeCsvField(doc.taskAssignedTo || ''),
                    escapeCsvField(doc.isWhatsappApply ? 'Yes' : 'No'),
                    escapeCsvField(doc.updatedBy || ''),
                    escapeCsvField(doc.lastAvailableCheck
                        ? doc.lastAvailableCheck.toISOString().replace('T', ' ').slice(0, 19)
                        : ''),
                    escapeCsvField(doc.lastUpdate
                        ? doc.lastUpdate.toISOString().replace('T', ' ').slice(0, 19)
                        : ''),
                    escapeCsvField(doc.lastUpdateComment || ''),
                    escapeCsvField(doc.nextUpdateDate
                        ? doc.nextUpdateDate.toISOString().replace('T', ' ').slice(0, 19)
                        : ''),
                    escapeCsvField(doc.nextUpdateComment || ''),
                    escapeCsvField(doc.comment1 || ''),
                    escapeCsvField(doc.comment2 || ''),
                    escapeCsvField(doc.isPaymentCreated ? 'Yes' : 'No')
                ].join(',') + '\n';

                res.write(row);
            }

            skip += batchSize;
        }

        // End the response
        res.end();

    } catch (err) {
        console.error('Export failed:', err);
        res.status(500).json({ message: 'Export failed' });
    }
});

router.get('/:id', async (req, res) => {
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

router.delete('/delete/:id', async (req, res) => {
    try {
        await Tuition.findByIdAndDelete(req.params.id);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
