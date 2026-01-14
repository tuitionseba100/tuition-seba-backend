const express = require('express');
const ExcelJS = require('exceljs');
const TuitionApply = require('../models/TuitionApply');
const Payment = require('../models/Payment');
const router = express.Router();
const moment = require('moment-timezone');
const RegTeacher = require('../models/RegTeacher');
const Phone = require('../models/Phone');

function escapeRegex(str) {
    if (typeof str !== 'string') {
        str = String(str ?? '');
    }
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
        const paymentsWithDue = await Payment.find({
            duePayment: { $nin: [null, undefined, '', '0'] }
        }).select('tutorNumber paymentNumber');

        const dueTutorSet = new Set(
            paymentsWithDue.map(p => escapeRegex(p.tutorNumber))
        );
        const duePaymentSet = new Set(
            paymentsWithDue.map(p => escapeRegex(p.paymentNumber))
        );

        const total = await TuitionApply.countDocuments(filter);
        const applyList = await TuitionApply.find(filter)
            .sort({ appliedAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        const data = applyList.map(apply => {
            const escapedPhone = escapeRegex(apply.phone);
            const hasDue = dueTutorSet.has(escapedPhone) || duePaymentSet.has(escapedPhone);
            return {
                ...apply.toObject(),
                hasDue
            };
        });

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
        const countsAggregation = await TuitionApply.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        const counts = {
            pending: 0,
            calledInterested: 0,
            calledNoResponse: 0,
            selected: 0,
            shortlisted: 0,
            requestedForPayment: 0
        };

        countsAggregation.forEach(item => {
            const stat = item._id?.toLowerCase();
            if (stat === 'pending') counts.pending = item.count;
            else if (stat === 'called (interested)') counts.calledInterested = item.count;
            else if (stat === 'called (no response)') counts.calledNoResponse = item.count;
            else if (stat === 'selected') counts.selected = item.count;
            else if (stat === 'shortlisted') counts.shortlisted = item.count;
            else if (stat === 'requested for payment') counts.requestedForPayment = item.count;
        });

        const total = await TuitionApply.countDocuments(filter);

        res.json({
            ...counts,
            total
        });
    } catch (err) {
        console.error(err);
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

function normalizePhoneForSave(phone) {
    let digits = phone.replace(/\D/g, '');

    if (digits.startsWith('880')) {
        digits = digits.slice(3);
    } else if (digits.startsWith('0')) {
        // do nothing
    } else if (digits.startsWith('8')) {
        digits = '0' + digits;
    }

    if (digits.length === 10 && !digits.startsWith('0')) {
        digits = '0' + digits;
    }

    return digits;
}

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
        agentComment,
    } = req.body;

    try {
        const normalizedInputPhone = normalizePhone(phone);

        const phoneList = await Phone.find({ isActive: true });

        let isSpam = false;
        let isBest = false;
        let isExpress = false;

        for (const entry of phoneList) {
            const normalizedDbPhone = normalizePhone(entry.phone);

            if (normalizedDbPhone === normalizedInputPhone) {
                if (entry.isSpam) {
                    isSpam = true;
                } else if (entry.isExpress) {
                    isExpress = true;
                } else if (entry.isBest) {
                    isBest = true;
                }
                break;
            }
        }

        const normalizedInputPhoneForSave = normalizePhoneForSave(phone);
        const localTime = moment().utcOffset(6 * 60).format("YYYY-MM-DD HH:mm:ss");

        const newApply = new TuitionApply({
            premiumCode,
            tuitionCode,
            tuitionId,
            name,
            phone: normalizedInputPhoneForSave,
            institute,
            department,
            address,
            comment,
            commentForTeacher,
            appliedAt: localTime,
            status: status || 'pending',
            isSpam,
            isBest,
            isExpress,
            agentComment
        });

        await newApply.save();
        res.status(201).json(newApply);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/appliedListByTuitionId', async (req, res) => {
    const { tuitionId } = req.query;

    if (!tuitionId) {
        return res.status(400).json({ message: 'tuitionId query parameter is required' });
    }
    try {
        const appliedList = await TuitionApply.find(
            { tuitionId },
            'premiumCode name phone institute department address appliedAt status isSpam isBest hasDue comment commentForTeacher'
        ).sort({ appliedAt: -1 });

        res.json(appliedList);
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

router.get('/getTuitionStatusesByPhone', async (req, res) => {
    try {
        const phone = req.query.phone;
        if (!phone) {
            return res.status(400).json({ message: 'Phone number is required' });
        }

        const normalizedPhone = normalizePhoneForSave(phone);
        const matchedTuitions = await TuitionApply.find(
            { phone: normalizedPhone },
            'tuitionCode appliedAt status commentForTeacher phone'
        );

        if (matchedTuitions.length === 0) {
            return res.status(404).json({ message: 'No applications found for this phone number' });
        }

        res.json(matchedTuitions);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.put('/edit/:id', async (req, res) => {
    try {
        let updatePayload = { ...req.body };

        if (req.body.phone) {
            const normalizedInputPhone = normalizePhone(req.body.phone);
            const phoneList = await Phone.find({ isActive: true });

            let isSpam = false;
            let isBest = false;

            for (const entry of phoneList) {
                const normalizedDbPhone = normalizePhone(entry.phone);

                if (normalizedDbPhone === normalizedInputPhone) {
                    if (entry.isSpam) {
                        isSpam = true;
                    } else {
                        isBest = true;
                    }
                    break;
                }
            }

            updatePayload.isSpam = isSpam;
            updatePayload.isBest = isBest;
        }

        const updatedData = await TuitionApply.findByIdAndUpdate(
            req.params.id,
            updatePayload,
            { new: true }
        );

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

router.get('/exportData', async (req, res) => {
    try {
        const { status } = req.query;

        // Build filter based on status
        const filter = {};
        if (status && status !== 'all') {
            filter.status = status;
        }

        // Set headers for CSV download
        res.setHeader('Content-Type', 'text/csv');

        const fileName =
            status && status !== 'all'
                ? `tuition_apply_${status.replace(/\s+/g, '_').toLowerCase()}.csv`
                : 'tuition_apply_all.csv';

        res.setHeader(
            'Content-Disposition',
            `attachment; filename=${fileName}`
        );

        // CSV header
        const header =
            'Tuition Code,Tuition ID,Premium Code,Name,Phone,Institute,Department,Address,Status,Applied At,Comment,Comment For Teacher,Is Spam,Is Best,Is Express\n';

        res.write(header);

        const batchSize = 1000;
        let skip = 0;

        const escapeCsvField = (field) => {
            if (field === null || field === undefined) return '';
            field = String(field);
            if (
                field.includes(',') ||
                field.includes('"') ||
                field.includes('\n') ||
                field.includes('\r')
            ) {
                return `"${field.replace(/"/g, '""')}"`;
            }
            return field;
        };

        while (true) {
            const batch = await TuitionApply.find(filter)
                .skip(skip)
                .limit(batchSize)
                .lean();

            if (batch.length === 0) break;

            for (const doc of batch) {
                const row = [
                    escapeCsvField(doc.tuitionCode),
                    escapeCsvField(doc.tuitionId),
                    escapeCsvField(doc.premiumCode),
                    escapeCsvField(doc.name),
                    escapeCsvField(doc.phone),
                    escapeCsvField(doc.institute),
                    escapeCsvField(doc.department),
                    escapeCsvField(doc.address),
                    escapeCsvField(doc.status),
                    escapeCsvField(
                        doc.appliedAt
                            ? doc.appliedAt.toISOString().replace('T', ' ').slice(0, 19)
                            : ''
                    ),
                    escapeCsvField(doc.comment),
                    escapeCsvField(doc.commentForTeacher),
                    escapeCsvField(doc.isSpam ? 'Yes' : 'No'),
                    escapeCsvField(doc.isBest ? 'Yes' : 'No'),
                    escapeCsvField(doc.isExpress ? 'Yes' : 'No')
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


router.get('/exportAll', async (req, res) => {
    try {
        // Set headers for CSV download
        res.setHeader(
            'Content-Type',
            'text/csv'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename=tuition_apply_all.csv'
        );

        // Write CSV header
        const header = 'Tuition Code,Tuition ID,Premium Code,Name,Phone,Institute,Department,Address,Status,Applied At,Comment,Comment For Teacher,Is Spam,Is Best,Is Express\n';
        res.write(header);

        // Process documents in batches to avoid memory issues
        const batchSize = 1000; // Process 1000 records at a time
        let skip = 0;

        while (true) {
            const batch = await TuitionApply.find().skip(skip).limit(batchSize).lean();

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
                    escapeCsvField(doc.tuitionId || ''),
                    escapeCsvField(doc.premiumCode || ''),
                    escapeCsvField(doc.name || ''),
                    escapeCsvField(doc.phone || ''),
                    escapeCsvField(doc.institute || ''),
                    escapeCsvField(doc.department || ''),
                    escapeCsvField(doc.address || ''),
                    escapeCsvField(doc.status || ''),
                    escapeCsvField(doc.appliedAt
                        ? doc.appliedAt.toISOString().replace('T', ' ').slice(0, 19)
                        : ''),
                    escapeCsvField(doc.comment || ''),
                    escapeCsvField(doc.commentForTeacher || ''),
                    escapeCsvField(doc.isSpam ? 'Yes' : 'No'),
                    escapeCsvField(doc.isBest ? 'Yes' : 'No'),
                    escapeCsvField(doc.isExpress ? 'Yes' : 'No')
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

module.exports = router;


