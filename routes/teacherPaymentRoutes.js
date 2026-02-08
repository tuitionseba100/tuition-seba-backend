const express = require('express');
const TeacherPayment = require('../models/TeacherPayment');
const router = express.Router();
const moment = require('moment-timezone');

router.get('/all', async (req, res) => {
    try {
        const all = await TeacherPayment.find();
        res.json(all);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

function escapeRegex(str) {
    if (typeof str !== 'string') {
        str = String(str ?? '');
    }
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/getTableData', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 50;

    const {
        tuitionCode = '',
        personalPhone = '',
        paymentNumber = '',
        status = '',
        paymentType = ''
    } = req.query;

    const filter = {};

    if (tuitionCode) {
        filter.tuitionCode = new RegExp(escapeRegex(tuitionCode), 'i');
    }

    if (personalPhone) {
        filter.personalPhone = new RegExp(escapeRegex(personalPhone), 'i');
    }

    if (paymentNumber) {
        filter.paymentNumber = new RegExp(escapeRegex(paymentNumber), 'i');
    }

    if (status) {
        filter.status = status;
    }

    if (paymentType) {
        filter.paymentType = paymentType;
    }

    try {
        const total = await TeacherPayment.countDocuments(filter);
        const payments = await TeacherPayment.find(filter)
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
        personalPhone = '',
        paymentNumber = '',
        status = '',
        paymentType = ''
    } = req.query;

    const filter = {};

    if (tuitionCode) {
        filter.tuitionCode = new RegExp(escapeRegex(tuitionCode), 'i');
    }

    if (personalPhone) {
        filter.personalPhone = new RegExp(escapeRegex(personalPhone), 'i');
    }

    if (paymentNumber) {
        filter.paymentNumber = new RegExp(escapeRegex(paymentNumber), 'i');
    }

    if (status) {
        filter.status = status;
    }

    if (paymentType) {
        filter.paymentType = paymentType;
    }

    try {
        const filteredPayments = await TeacherPayment.find(filter);

        const totalPaymentsCount = filteredPayments.length;
        const totalPayments = filteredPayments.reduce((sum, payment) =>
            sum + parseFloat(payment.amount || 0), 0
        );

        const totalApprovedPaymentsCount = filteredPayments.filter(payment => {
            const stat = (payment.status || '').toString().toLowerCase();
            return stat === 'received' || stat === 'recieved';
        }).length;

        const nowBD = new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' });
        const todayBD = new Date(nowBD);
        const startOfDayBD = new Date(todayBD);
        startOfDayBD.setHours(0, 0, 0, 0);
        const endOfDayBD = new Date(todayBD);
        endOfDayBD.setHours(23, 59, 59, 999);
        const startUTC = new Date(startOfDayBD.toLocaleString('en-US', { timeZone: 'UTC' }));
        const endUTC = new Date(endOfDayBD.toLocaleString('en-US', { timeZone: 'UTC' }));

        const todayPayments = filteredPayments.filter(payment => {
            const paymentDate = new Date(payment.requestedAt);
            return paymentDate >= startUTC && paymentDate <= endUTC;
        });

        const totalPaymentsTodayCount = todayPayments.length;
        const totalPaymentsToday = todayPayments.reduce((sum, payment) =>
            sum + parseFloat(payment.amount || 0), 0
        );

        res.json({
            totalPaymentsCount,
            totalPayments,
            totalApprovedPaymentsCount,
            totalPaymentsTodayCount,
            totalPaymentsToday
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message });
    }
});

router.get('/exportData', async (req, res) => {
    try {
        const { status } = req.query;

        const filter = {};
        if (status && status !== 'all') {
            filter.status = status;
        }

        res.setHeader('Content-Type', 'text/csv');

        const fileName = status && status !== 'all'
            ? `teacher_payments_${status.replace(/\s+/g, '_').toLowerCase()}.csv`
            : 'teacher_payments_all.csv';

        res.setHeader(
            'Content-Disposition',
            `attachment; filename=${fileName}`
        );

        const header =
            'Tuition Code,Payment Status,Submitted At,Teacher Name,Teacher Number,Payment Number,Transaction ID,Payment Type,Amount,Discount,Total Amount,Due Amount,Note,Comment,Created By,Updated By\n';

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
            const batch = await TeacherPayment.find(filter)
                .skip(skip)
                .limit(batchSize)
                .lean();

            if (batch.length === 0) break;

            for (const doc of batch) {
                const row = [
                    escapeCsvField(doc.tuitionCode),
                    escapeCsvField(doc.status),
                    escapeCsvField(doc.requestedAt
                        ? new Date(doc.requestedAt).toISOString().replace('T', ' ').slice(0, 19)
                        : ''),
                    escapeCsvField(doc.name),
                    escapeCsvField(doc.personalPhone),
                    escapeCsvField(doc.paymentNumber),
                    escapeCsvField(doc.transactionId),
                    escapeCsvField(doc.paymentType),
                    escapeCsvField(doc.amount),
                    escapeCsvField(doc.discount),
                    escapeCsvField(doc.totalAmount),
                    escapeCsvField(doc.dueAmount),
                    escapeCsvField(doc.note),
                    escapeCsvField(doc.comment),
                    escapeCsvField(doc.createdBy),
                    escapeCsvField(doc.updatedBy)
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

router.post('/add', async (req, res) => {
    const {
        tuitionCode,
        paymentType,
        paymentNumber,
        transactionId,
        personalPhone,
        amount,
        discount,
        totalAmount,
        dueAmount,
        name,
        note,
        status,
        comment,
        createdBy
    } = req.body;

    try {
        const localTime = moment().utcOffset(6 * 60).format("YYYY-MM-DD HH:mm:ss");

        const newApply = new TeacherPayment({
            tuitionCode,
            paymentType,
            paymentNumber,
            transactionId,
            personalPhone,
            amount,
            discount,
            totalAmount,
            dueAmount,
            name,
            note,
            comment,
            createdBy: createdBy || 'teacher',
            requestedAt: localTime,
            status: status || 'pending'
        });

        await newApply.save();
        res.status(201).json(newApply);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/getPaymentRequestStatuses', async (req, res) => {
    try {
        const summary = await TeacherPayment.find({}, 'tuitionCode paymentType paymentNumber status phone');
        res.json(summary);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.put('/edit/:id', async (req, res) => {
    try {
        const updatedData = await TeacherPayment.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedData);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.delete('/delete/:id', async (req, res) => {
    try {
        await TeacherPayment.findByIdAndDelete(req.params.id);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;


