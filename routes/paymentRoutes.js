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
        paymentReceivedDate2,
        paymentReceivedDate3,
        paymentReceivedDate4,
        duePayDate,
        paymentType,
        tutorName,
        tutorNumber,
        paymentNumber,
        transactionId,
        receivedTk,
        receivedTk2,
        receivedTk3,
        receivedTk4,
        duePayment,
        paymentStatus,
        comment,
        totalReceivedTk,
        reference,
        createdBy,
        updatedBy,
        tuitionSalary,
        totalPaymentTk,
        discount,
        comment1,
        comment2,
        comment3
    } = req.body;

    try {
        const newPayment = new Payment({
            tuitionCode,
            tuitionId,
            paymentReceivedDate,
            paymentReceivedDate2,
            paymentReceivedDate3,
            paymentReceivedDate4,
            duePayDate,
            reference,
            paymentType,
            tutorName,
            tutorNumber,
            paymentNumber,
            transactionId,
            receivedTk,
            receivedTk2,
            receivedTk3,
            receivedTk4,
            duePayment,
            paymentStatus,
            comment,
            totalReceivedTk,
            createdBy,
            updatedBy,
            tuitionSalary,
            totalPaymentTk,
            discount,
            createdAt: new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }),
            comment1,
            comment2,
            comment3
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
            'Tuition Code,Payment Status,Payment Received Date 1,Payment Received Date 2,Payment Received Date 3,Payment Received Date 4,Due Payment Date,Payment Type,Tutor Name,Tutor Number,Payment Number,Transaction ID,Received TK 1,Received TK 2,Received TK 3,Received TK 4,Due Payment,Total Received TK,Tuition Salary,Total Payment TK,Discount,Comment,Comment 1,Comment 2,Comment 3,Reference,Created By,Updated By,Created At\n';

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
                    escapeCsvField(doc.paymentReceivedDate2
                        ? doc.paymentReceivedDate2.toISOString().replace('T', ' ').slice(0, 19)
                        : ''),
                    escapeCsvField(doc.paymentReceivedDate3
                        ? doc.paymentReceivedDate3.toISOString().replace('T', ' ').slice(0, 19)
                        : ''),
                    escapeCsvField(doc.paymentReceivedDate4
                        ? doc.paymentReceivedDate4.toISOString().replace('T', ' ').slice(0, 19)
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
                    escapeCsvField(doc.receivedTk2),
                    escapeCsvField(doc.receivedTk3),
                    escapeCsvField(doc.receivedTk4),
                    escapeCsvField(doc.duePayment),
                    escapeCsvField(doc.totalReceivedTk),
                    escapeCsvField(doc.tuitionSalary),
                    escapeCsvField(doc.totalPaymentTk),
                    escapeCsvField(doc.discount),
                    escapeCsvField(doc.comment),
                    escapeCsvField(doc.comment1),
                    escapeCsvField(doc.comment2),
                    escapeCsvField(doc.comment3),
                    escapeCsvField(doc.reference),
                    escapeCsvField(doc.createdBy),
                    escapeCsvField(doc.updatedBy),
                    escapeCsvField(doc.createdAt)
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

        let totalPaymentTKToday = 0;
        let totalPaymentsTodayCount = 0;

        filteredPayments.forEach(payment => {
            let isCountedForToday = false;

            // Check each of the 4 payment dates
            const dates = [
                payment.paymentReceivedDate,
                payment.paymentReceivedDate2,
                payment.paymentReceivedDate3,
                payment.paymentReceivedDate4
            ];
            const amounts = [
                payment.receivedTk,
                payment.receivedTk2,
                payment.receivedTk3,
                payment.receivedTk4
            ];

            dates.forEach((date, index) => {
                if (date) {
                    const pDate = new Date(date);
                    if (pDate >= startUTC && pDate <= endUTC) {
                        totalPaymentTKToday += parseFloat(amounts[index] || 0);
                        isCountedForToday = true;
                    }
                }
            });

            if (isCountedForToday) {
                totalPaymentsTodayCount++;
            }
        });

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


