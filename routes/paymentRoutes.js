const express = require('express');
const Payment = require('../models/Payment');
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

router.get('/all', authMiddleware, async (req, res) => {
    try {
        const payments = await Payment.find();
        res.json(payments);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.post('/add', async (req, res) => {
    const {
        tuitionCode,
        tuitionId,
        paymentReceivedDate,
        duePayDate,
        paymentType,
        tutorName,
        tutorNumber,
        paymentNumber,
        transactionId,
        receivedTk,
        duePayment,
        paymentStatus,
        comment,
        totalReceivedTk,
        reference,
        createdBy
    } = req.body;

    try {
        const newPayment = new Payment({
            tuitionCode,
            tuitionId,
            paymentReceivedDate,
            duePayDate,
            reference,
            paymentType,
            tutorName,
            tutorNumber,
            paymentNumber,
            transactionId,
            receivedTk,
            duePayment,
            paymentStatus,
            comment,
            totalReceivedTk,
            createdBy
        });

        await newPayment.save();
        res.status(201).json(newPayment);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.put('/edit/:id', async (req, res) => {
    try {
        const updatedPayment = await Payment.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedPayment);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.delete('/delete/:id', async (req, res) => {
    try {
        await Payment.findByIdAndDelete(req.params.id);
        res.status(204).send();
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

        const payments = await Payment.find({
            duePayDate: { $gte: startUTC, $lte: endUTC }
        }).sort({ duePayDate: 1 });

        res.json(payments);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/exportData', async (req, res) => {
    try {
        const { paymentStatus } = req.query;

        // Build filter based on paymentStatus
        const filter = {};
        if (paymentStatus && paymentStatus !== 'all') {
            filter.paymentStatus = paymentStatus;
        }

        // Set headers for CSV download
        res.setHeader('Content-Type', 'text/csv');

        const fileName = paymentStatus && paymentStatus !== 'all'
            ? `payments_${paymentStatus.replace(/\s+/g, '_').toLowerCase()}.csv`
            : 'payments_all.csv';

        res.setHeader(
            'Content-Disposition',
            `attachment; filename=${fileName}`
        );

        // CSV header
        const header =
            'Tuition Code,Payment Status,Payment Received Date,Due Payment Date,Payment Type,Tutor Name,Tutor Number,Payment Number,Transaction ID,Received TK,Due Payment,Total Received TK,Comment,Reference,Created By\n';

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
            const batch = await Payment.find(filter)
                .skip(skip)
                .limit(batchSize)
                .lean();

            if (batch.length === 0) break;

            for (const doc of batch) {
                const row = [
                    escapeCsvField(doc.tuitionCode),
                    escapeCsvField(doc.paymentStatus),
                    escapeCsvField(doc.paymentReceivedDate
                        ? doc.paymentReceivedDate.toISOString().replace('T', ' ').slice(0, 19)
                        : ''),
                    escapeCsvField(doc.duePayDate
                        ? doc.duePayDate.toISOString().replace('T', ' ').slice(0, 19)
                        : ''),
                    escapeCsvField(doc.paymentType),
                    escapeCsvField(doc.tutorName),
                    escapeCsvField(doc.tutorNumber),
                    escapeCsvField(doc.paymentNumber),
                    escapeCsvField(doc.transactionId),
                    escapeCsvField(doc.receivedTk),
                    escapeCsvField(doc.duePayment),
                    escapeCsvField(doc.totalReceivedTk),
                    escapeCsvField(doc.comment),
                    escapeCsvField(doc.reference),
                    escapeCsvField(doc.createdBy)
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

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/getTableData', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 50;

    const {
        tuitionCode = '',
        tutorNumber = '',
        paymentNumber = '',
        paymentStatus = '',
        paymentType = ''
    } = req.query;

    const filter = {};

    if (tuitionCode) {
        filter.tuitionCode = new RegExp(escapeRegex(tuitionCode), 'i');
    }

    if (tutorNumber) {
        filter.tutorNumber = new RegExp(escapeRegex(tutorNumber), 'i');
    }

    if (paymentNumber) {
        filter.paymentNumber = new RegExp(escapeRegex(paymentNumber), 'i');
    }

    if (paymentStatus) {
        filter.paymentStatus = paymentStatus;
    }

    if (paymentType) {
        filter.paymentType = paymentType;
    }

    try {
        const total = await Payment.countDocuments(filter);
        const payments = await Payment.find(filter)
            .sort({ _id: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        res.json({
            data: payments,
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
        tuitionCode = '',
        tutorNumber = '',
        paymentNumber = '',
        paymentStatus = '',
        paymentType = ''
    } = req.query;

    const filter = {};

    if (tuitionCode) {
        filter.tuitionCode = new RegExp(escapeRegex(tuitionCode), 'i');
    }

    if (tutorNumber) {
        filter.tutorNumber = new RegExp(escapeRegex(tutorNumber), 'i');
    }

    if (paymentNumber) {
        filter.paymentNumber = new RegExp(escapeRegex(paymentNumber), 'i');
    }

    if (paymentStatus) {
        filter.paymentStatus = paymentStatus;
    }

    if (paymentType) {
        filter.paymentType = paymentType;
    }

    try {
        const filteredPayments = await Payment.find(filter);

        const totalPaymentsCount = filteredPayments.length;

        const totalPaymentTK = filteredPayments.reduce((sum, payment) =>
            sum + parseFloat(payment.totalReceivedTk || 0), 0
        );

        const nowBD = new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' });
        const todayBD = new Date(nowBD);
        const startOfDayBD = new Date(todayBD);
        startOfDayBD.setHours(0, 0, 0, 0);
        const endOfDayBD = new Date(todayBD);
        endOfDayBD.setHours(23, 59, 59, 999);
        const startUTC = new Date(startOfDayBD.toLocaleString('en-US', { timeZone: 'UTC' }));
        const endUTC = new Date(endOfDayBD.toLocaleString('en-US', { timeZone: 'UTC' }));

        const todayPayments = filteredPayments.filter(payment => {
            const paymentDate = new Date(payment.paymentReceivedDate);
            return paymentDate >= startUTC && paymentDate <= endUTC;
        });

        const totalPaymentsTodayCount = todayPayments.length;
        const totalPaymentTKToday = todayPayments.reduce((sum, payment) =>
            sum + parseFloat(payment.receivedTk || 0), 0
        );

        const totalDues = filteredPayments.reduce((sum, payment) =>
            sum + parseFloat(payment.duePayment || 0), 0
        );
        const totalDuesCount = filteredPayments.filter(payment =>
            parseFloat(payment.duePayment || 0) > 0
        ).length;

        res.json({
            totalPaymentsCount,
            totalPaymentTK,
            totalPaymentsTodayCount,
            totalPaymentTKToday,
            totalDues,
            totalDuesCount
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message });
    }
});


module.exports = router;


