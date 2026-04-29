const express = require('express');
const Tuition = require('../models/Tuition');
const TuitionApply = require('../models/TuitionApply');
const Phone = require('../models/Phone');
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

//available tuition
router.get('/available', async (req, res) => {
    try {
        const tuitions = await Tuition.find({ isPublish: true })
            .select('-status -guardianNumber -tutorNumber -createdBy -updatedBy -lastAvailableCheck -lastUpdate -lastUpdateComment -nextUpdateDate -nextUpdateComment -comment1 -comment2 -isPaymentCreated -updatedAt')
            .limit(400)
            .lean();

        res.json(tuitions);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/published-summary', async (req, res) => {
    try {
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

        const publishedTuitions = await Tuition.find({ isPublish: true }).select('createdAt area').lean();

        const total = publishedTuitions.length;

        const newCount = publishedTuitions.filter(tuition =>
            new Date(tuition.createdAt) >= threeDaysAgo
        ).length;

        const areaWiseCount = publishedTuitions.reduce((acc, tuition) => {
            const area = tuition.area || 'Unknown';
            acc[area] = (acc[area] || 0) + 1;
            return acc;
        }, {});

        const areaWiseCountArray = Object.entries(areaWiseCount).map(([area, count]) => ({
            area,
            count
        }));

        res.json({
            total,
            newCount,
            areaWiseCount: areaWiseCountArray
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/all', authMiddleware, async (req, res) => {
    try {
        const tuitions = await Tuition.find()
            .sort({ _id: -1 })
            .limit(100)
            .lean(); // Limit to prevents OOM crashes
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
        status,
        area,
        assignedTo,
        type,
        isReviewDone
    } = req.query;

    const filter = {};

    if (type === 'spam') {
        filter.isSpamGuardian = true;
    } else if (type === 'bestGuardian') {
        filter.isBestGuardian = true;
    }

    if (isReviewDone === 'true' || isReviewDone === 'false') {
        filter.isReviewDone = isReviewDone === 'true';
    }

    if (tuitionCode) {
        filter.tuitionCode = new RegExp(escapeRegex(tuitionCode), 'i');
    }

    if (guardianNumber) {
        const cleanG = guardianNumber.replace(/\D/g, '');
        const searchG = cleanG.length >= 11 ? cleanG.slice(-11) : cleanG;
        filter.guardianNumber = new RegExp(escapeRegex(searchG), 'i');
    }

    if (tutorNumber) {
        const cleanT = tutorNumber.replace(/\D/g, '');
        const searchT = cleanT.length >= 11 ? cleanT.slice(-11) : cleanT;
        filter.tutorNumber = new RegExp(escapeRegex(searchT), 'i');
    }

    if (isPublish === 'true' || isPublish === 'false') {
        filter.isPublish = isPublish === 'true';
    }

    if (isUrgent === 'true' || isUrgent === 'false') {
        filter.isUrgent = isUrgent === 'true';
    }

    if (status) {
        filter.status = status;
    }

    if (area) {
        filter.area = new RegExp(escapeRegex(area), 'i');
    }

    if (assignedTo) {
        filter.assignedTo = assignedTo;
    }

    try {
        const total = await Tuition.countDocuments(filter);
        const tuitions = await Tuition.find(filter)
            .sort({ _id: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        // Optimized way to check for pending applications
        const tuitionCodes = tuitions.map(t => t.tuitionCode);
        const pendingApplies = await TuitionApply.distinct('tuitionCode', {
            tuitionCode: { $in: tuitionCodes },
            status: 'pending'
        });
        
        const pendingSet = new Set(pendingApplies);

        const dataWithPendingFlag = tuitions.map(t => {
            t.hasPendingApply = pendingSet.has(t.tuitionCode);
            return t;
        });

        res.json({
            data: dataWithPendingFlag,
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

        const { assignedTo } = req.query;
        const filter = {
            nextUpdateDate: { $gte: startUTC, $lte: endUTC }
        };

        if (assignedTo) {
            filter.assignedTo = assignedTo;
        }

        const tuitions = await Tuition.find(filter).sort({ nextUpdateDate: 1 }).lean();

        const tuitionCodes = tuitions.map(t => t.tuitionCode);
        const pendingApplies = await TuitionApply.distinct('tuitionCode', {
            tuitionCode: { $in: tuitionCodes },
            status: 'pending'
        });
        const pendingSet = new Set(pendingApplies);

        const dataWithPendingFlag = tuitions.map(t => {
            t.hasPendingApply = pendingSet.has(t.tuitionCode);
            return t;
        });

        res.json(dataWithPendingFlag);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/pending-payment-creation', async (req, res) => {
    try {
        const tuitions = await Tuition.find({
            status: 'confirm',
            isPaymentCreated: false
        }).lean();

        const tuitionCodes = tuitions.map(t => t.tuitionCode);
        const pendingApplies = await TuitionApply.distinct('tuitionCode', {
            tuitionCode: { $in: tuitionCodes },
            status: 'pending'
        });
        const pendingSet = new Set(pendingApplies);

        const dataWithPendingFlag = tuitions.map(t => {
            t.hasPendingApply = pendingSet.has(t.tuitionCode);
            return t;
        });

        res.json(dataWithPendingFlag);
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
        status,
        area,
        assignedTo,
        type,
        isReviewDone
    } = req.query;

    const filter = {};

    if (type === 'spam') {
        filter.isSpamGuardian = true;
    } else if (type === 'bestGuardian') {
        filter.isBestGuardian = true;
    }

    if (isReviewDone === 'true' || isReviewDone === 'false') {
        filter.isReviewDone = isReviewDone === 'true';
    }

    if (tuitionCode) {
        filter.tuitionCode = new RegExp(escapeRegex(tuitionCode), 'i');
    }

    if (guardianNumber) {
        const cleanG = guardianNumber.replace(/\D/g, '');
        const searchG = cleanG.length >= 11 ? cleanG.slice(-11) : cleanG;
        filter.guardianNumber = new RegExp(escapeRegex(searchG), 'i');
    }

    if (tutorNumber) {
        const cleanT = tutorNumber.replace(/\D/g, '');
        const searchT = cleanT.length >= 11 ? cleanT.slice(-11) : cleanT;
        filter.tutorNumber = new RegExp(escapeRegex(searchT), 'i');
    }

    if (isPublish === 'true' || isPublish === 'false') {
        filter.isPublish = isPublish === 'true';
    }

    if (isUrgent === 'true' || isUrgent === 'false') {
        filter.isUrgent = isUrgent === 'true';
    }

    if (status) {
        filter.status = status;
    }

    if (area) {
        filter.area = new RegExp(escapeRegex(area), 'i');
    }

    if (assignedTo) {
        filter.assignedTo = assignedTo;
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
        const isPublishTrueCount = await Tuition.countDocuments({ isPublish: true });

        // Optimized and more informative pending application count
        let pendingApplyCount = 0;
        if (Object.keys(filter).length === 0) {
            // If no filters, count all pending applications directly
            pendingApplyCount = await TuitionApply.countDocuments({ status: 'pending' });
        } else {
            // If filters are applied, count applications for the filtered tuitions
            const pendingApplyResult = await Tuition.aggregate([
                { $match: filter },
                {
                    $lookup: {
                        from: 'tuitionapplies',
                        localField: 'tuitionCode',
                        foreignField: 'tuitionCode',
                        as: 'applies'
                    }
                },
                { $unwind: '$applies' },
                { $match: { 'applies.status': 'pending' } },
                { $count: 'pendingCount' }
            ]);
            pendingApplyCount = pendingApplyResult.length > 0 ? pendingApplyResult[0].pendingCount : 0;
        }

        res.json({
            ...counts,
            total,
            isPublishTrueCount,
            pendingApplyCount: pendingApplyCount
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
        isPaymentCreated,
        assignedTo,
        isReviewDone
    } = req.body;

    try {
        const existingTuition = await Tuition.findOne({ tuitionCode });
        if (existingTuition) {
            return res.status(400).json({ message: 'Tuition code already exists' });
        }

        let isSpamGuardian = false;
        let isBestGuardian = false;

        if (guardianNumber) {
            const inputNumbers = guardianNumber.split('/').map(n => n.trim()).filter(n => n);
            if (inputNumbers.length > 0) {
                const cleanedNumbers = inputNumbers.map(num => {
                    const digits = num.replace(/\D/g, '');
                    return digits.length >= 11 ? digits.slice(-11) : digits;
                });

                const duplicateQuery = {
                    $or: cleanedNumbers.map(num => ({
                        phone: { $regex: num }
                    }))
                };
                const phoneDoc = await Phone.findOne(duplicateQuery);
                if (phoneDoc) {
                    if (phoneDoc.isSpam) isSpamGuardian = true;
                    if (phoneDoc.isBestGuardian) isBestGuardian = true;
                }
            }
        }

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
            isPaymentCreated,
            assignedTo,
            isSpamGuardian,
            isBestGuardian,
            isReviewDone
        });

        await newTuition.save();
        res.status(201).json(newTuition);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.put('/edit/:id', async (req, res) => {
    try {
        if (req.body.tuitionCode) {
            const duplicateTuition = await Tuition.findOne({
                tuitionCode: req.body.tuitionCode,
                _id: { $ne: req.params.id }
            });
            if (duplicateTuition) {
                return res.status(400).json({ message: 'Tuition code already exists' });
            }
        }

        if (req.body.guardianNumber) {
            const inputNumbers = req.body.guardianNumber.split('/').map(n => n.trim()).filter(n => n);
            if (inputNumbers.length > 0) {
                const cleanedNumbers = inputNumbers.map(num => {
                    const digits = num.replace(/\D/g, '');
                    return digits.length >= 11 ? digits.slice(-11) : digits;
                });

                const duplicateQuery = {
                    $or: cleanedNumbers.map(num => ({
                        phone: { $regex: num }
                    }))
                };
                const phoneDoc = await Phone.findOne(duplicateQuery);
                if (phoneDoc) {
                    req.body.isSpamGuardian = !!phoneDoc.isSpam;
                    req.body.isBestGuardian = !!phoneDoc.isBestGuardian;
                } else {
                    req.body.isSpamGuardian = false;
                    req.body.isBestGuardian = false;
                }
            }
        }

        const updatedTuition = await Tuition.findByIdAndUpdate(req.params.id, req.body, { new: true });

        const triggerStatus = req.body.status ? req.body.status.toLowerCase() : null;
        if (triggerStatus && ['confirm', 'cancel', 'suspended', 'suspend'].includes(triggerStatus)) {
            try {
                const targetStatuses = [
                    'pending',
                    'called (interested)',
                    'called (no response)',
                    'called (guardian no response)',
                    'shortlisted',
                    'requested for payment',
                    'refer to bm',
                    'meet to office'
                ];

                let commentForTeacher = 'দুঃখিত, টিউশনটি ক্যান্সেল করা হয়েছে, আমাদের এভেইলবল অন্য টিউশনগুলোতে এপ্লাই করুন।';
                if (triggerStatus === 'confirm') {
                    commentForTeacher = 'আলহামদুলিল্লাহ, আমাদের একজন টিচার কনফার্ম হয়েছে। আমাদের এভেইলেবল টিউশনগুলো এপ্লাই করুন।';
                }

                await TuitionApply.updateMany(
                    {
                        tuitionCode: updatedTuition.tuitionCode,
                        status: { $in: targetStatuses }
                    },
                    {
                        status: 'cancelled',
                        commentForTeacher: commentForTeacher,
                        comment: 'auto updated',
                        updatedBy: 'System'
                    }
                );
            } catch (applyErr) {
                console.error('Error updating tuition applications:', applyErr);
            }
        }

        res.json(updatedTuition);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/export', async (req, res) => {
    try {
        const { status } = req.query;

        // Build filter based on status
        const filter = {};
        if (status && status !== 'all') {
            filter.status = status;
        }

        // Set headers for CSV download
        res.setHeader(
            'Content-Type',
            'text/csv'
        );

        // Generate filename based on status
        const fileName = status && status !== 'all'
            ? `tuitions_${status.replace(/\s+/g, '_').toLowerCase()}.csv`
            : 'tuitions_all.csv';

        res.setHeader(
            'Content-Disposition',
            `attachment; filename=${fileName}`
        );

        // Write CSV header
        const header = 'Tuition Code,Is Publish,Wanted Teacher,Student,Created By,Class,Medium,Institute,Subject,Day,Time,Salary,Location,City,Area,Guardian Number,Status,Joining,Note,Tutor Number,Is Urgent,Task Assigned To,Is Whatsapp Apply,Updated By,Last Available Check,Last Update,Last Update Comment,Next Update Date,Next Update Comment,Comment 1,Comment 2,Is Payment Created,Assigned To\n';
        res.write(header);

        // Process documents in batches to avoid memory issues
        const batchSize = 1000; // Process 1000 records at a time
        let skip = 0;

        while (true) {
            const batch = await Tuition.find(filter).skip(skip).limit(batchSize).lean();

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
                    escapeCsvField(doc.isPaymentCreated ? 'Yes' : 'No'),
                    escapeCsvField(doc.assignedTo || '')
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

router.get('/exportData', async (req, res) => {
    try {
        const { status } = req.query;

        // Build filter
        const filter = {};
        if (status && status !== 'all') {
            filter.status = status;
        }

        // Set headers for CSV download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader(
            'Content-Disposition',
            'attachment; filename=tuitions_export.csv'
        );

        // CSV header
        const header =
            'Tuition Code,Is Publish,Wanted Teacher,Student,Created By,Class,Medium,Institute,Subject,Day,Time,Salary,Location,City,Area,Guardian Number,Status,Joining,Note,Tutor Number,Is Urgent,Task Assigned To,Is Whatsapp Apply,Updated By,Last Available Check,Last Update,Last Update Comment,Next Update Date,Next Update Comment,Comment 1,Comment 2,Is Payment Created,Assigned To\n';

        res.write(header);

        const batchSize = 1000;
        let skip = 0;

        const escapeCsvField = (field) => {
            if (field === null || field === undefined) return '';
            field = String(field);
            if (field.includes(',') || field.includes('"') || field.includes('\n') || field.includes('\r')) {
                return `"${field.replace(/"/g, '""')}"`;
            }
            return field;
        };

        while (true) {
            const batch = await Tuition.find(filter)
                .skip(skip)
                .limit(batchSize)
                .lean();

            if (batch.length === 0) break;

            for (const doc of batch) {
                const row = [
                    escapeCsvField(doc.tuitionCode),
                    escapeCsvField(doc.isPublish ? 'Yes' : 'No'),
                    escapeCsvField(doc.wantedTeacher),
                    escapeCsvField(doc.student),
                    escapeCsvField(doc.createdBy),
                    escapeCsvField(doc.class),
                    escapeCsvField(doc.medium),
                    escapeCsvField(doc.institute),
                    escapeCsvField(doc.subject),
                    escapeCsvField(doc.day),
                    escapeCsvField(doc.time),
                    escapeCsvField(doc.salary),
                    escapeCsvField(doc.location),
                    escapeCsvField(doc.city),
                    escapeCsvField(doc.area),
                    escapeCsvField(doc.guardianNumber),
                    escapeCsvField(doc.status),
                    escapeCsvField(doc.joining),
                    escapeCsvField(doc.note),
                    escapeCsvField(doc.tutorNumber),
                    escapeCsvField(doc.isUrgent ? 'Yes' : 'No'),
                    escapeCsvField(doc.taskAssignedTo),
                    escapeCsvField(doc.isWhatsappApply ? 'Yes' : 'No'),
                    escapeCsvField(doc.updatedBy),
                    escapeCsvField(doc.lastAvailableCheck
                        ? doc.lastAvailableCheck.toISOString().replace('T', ' ').slice(0, 19)
                        : ''),
                    escapeCsvField(doc.lastUpdate
                        ? doc.lastUpdate.toISOString().replace('T', ' ').slice(0, 19)
                        : ''),
                    escapeCsvField(doc.lastUpdateComment),
                    escapeCsvField(doc.nextUpdateDate
                        ? doc.nextUpdateDate.toISOString().replace('T', ' ').slice(0, 19)
                        : ''),
                    escapeCsvField(doc.nextUpdateComment),
                    escapeCsvField(doc.comment1),
                    escapeCsvField(doc.comment2),
                    escapeCsvField(doc.isPaymentCreated ? 'Yes' : 'No'),
                    escapeCsvField(doc.assignedTo)
                ].join(',') + '\n';

                res.write(row);
            }

            skip += batchSize;
        }

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
