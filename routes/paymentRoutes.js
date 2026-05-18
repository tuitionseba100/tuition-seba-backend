const express = require('express');
const Payment = require('../models/Payment');
const { logActivity, getDifferences } = require('../utils/activityLogger');
const router = express.Router();
const moment = require('moment-timezone');
const jwt = require('jsonwebtoken');
const Settings = require('../models/Settings');
const Attendance = require('../models/Attendance');


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

const getLeastAssignedPaymentUser = async (userList) => {
    if (!userList || userList.length === 0) return null;
    if (userList.length === 1) return userList[0];

    const counts = await Promise.all(userList.map(async (user) => {
        const count = await Payment.countDocuments({
            assignedTo: user,
            paymentStatus: { $ne: 'Paid' }
        });
        return { user, count };
    }));

    counts.sort((a, b) => a.count - b.count);
    const minCount = counts[0].count;
    const candidates = counts.filter(c => c.count === minCount);
    if (candidates.length > 1) {
        return candidates[Math.floor(Math.random() * candidates.length)].user;
    }
    return counts[0].user;
};


router.get('/all', authMiddleware, async (req, res) => {
    try {
        const payments = await Payment.find();
        res.json(payments);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.put('/verify-all', authMiddleware, async (req, res) => {
    if (req.user.role !== 'superadmin') return res.status(403).json({ message: 'Forbidden' });
    try {
        await Payment.updateMany({ isVerified: { $ne: true } }, { isVerified: true, verifiedBy: 'System (Initial)' });
        res.json({ message: 'All existing records verified successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.put('/verify/:id', authMiddleware, async (req, res) => {
    try {
        const { verifiedBy } = req.body;
        const payment = await Payment.findByIdAndUpdate(
            req.params.id,
            { isVerified: true, verifiedBy: verifiedBy || 'Unknown' },
            { new: true }
        );
        res.json(payment);
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
        paymentType2,
        paymentType3,
        paymentType4,
        tutorName,
        tutorNumber,
        paymentNumber,
        paymentNumber2,
        paymentNumber3,
        paymentNumber4,
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
        tuitionSalary,
        totalPaymentTk,
        discount,
        comment1,
        comment2,
        comment3,
        assignedTo,
        followUpDate,
        followUpComment,
        duePayDateComment
    } = req.body;

    try {
        // Auto-assign logic for new payment
        let finalAssignedTo = assignedTo || '';
        if (!finalAssignedTo) {
            const setting = await Settings.findOne({ key: 'payment_auto_assign_user' });
            if (setting && setting.value && setting.value.length > 0) {
                const userList = Array.isArray(setting.value) ? setting.value : [setting.value];

                // Filter users who have started their day (active attendance today)
                const todayStart = new Date();
                todayStart.setHours(0, 0, 0, 0);

                const activeUsers = [];
                for (const username of userList) {
                    const attendance = await Attendance.findOne({
                        userName: username,
                        startTime: { $gte: todayStart },
                        endTime: null
                    });
                    if (attendance) {
                        activeUsers.push(username);
                    }
                }

                if (activeUsers.length > 0) {
                    const nextUser = await getLeastAssignedPaymentUser(activeUsers);
                    if (nextUser) finalAssignedTo = nextUser;
                }
            }
        }

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
            paymentType2,
            paymentType3,
            paymentType4,
            tutorName,
            tutorNumber,
            paymentNumber,
            paymentNumber2,
            paymentNumber3,
            paymentNumber4,
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
            tuitionSalary,
            totalPaymentTk,
            discount,
            createdAt: moment().tz("Asia/Dhaka").format('M/D/YYYY, h:mm:ss A'),
            comment1,
            comment2,
            comment3,
            assignedTo: finalAssignedTo,
            followUpDate,
            followUpComment,
            duePayDateComment
        });

        await newPayment.save();
        await logActivity(req, 'Create', 'Payment', newPayment._id, {
            after: newPayment,
            importantFields: { tuitionCode: newPayment.tuitionCode }
        });
        res.status(201).json(newPayment);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.put('/edit/:id', async (req, res) => {
    try {
        const oldPayment = await Payment.findById(req.params.id).lean();
        if (!oldPayment) {
            return res.status(404).json({ message: 'Payment not found' });
        }

        const updatedPayment = await Payment.findByIdAndUpdate(req.params.id, req.body, { new: true });

        const diff = getDifferences(oldPayment, updatedPayment.toObject());
        await logActivity(req, 'Edit', 'Payment', updatedPayment._id, {
            ...diff,
            importantFields: { tuitionCode: updatedPayment.tuitionCode }
        });

        res.json(updatedPayment);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.delete('/delete/:id', async (req, res) => {
    try {
        const paymentToDelete = await Payment.findById(req.params.id).lean();
        if (!paymentToDelete) {
            return res.status(404).json({ message: 'Payment not found' });
        }

        await Payment.findByIdAndDelete(req.params.id);

        await logActivity(req, 'Delete', 'Payment', req.params.id, {
            importantFields: {
                tuitionCode: paymentToDelete.tuitionCode,
                tutorNumber: paymentToDelete.tutorNumber
            }
        });

        res.status(200).json({ message: 'Payment deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/alert-today', async (req, res) => {
    try {
        const { assignedTo } = req.query;

        // Use moment-timezone to get start and end of day in Bangladesh
        const startOfBDToday = moment.tz("Asia/Dhaka").startOf('day');
        const endOfBDToday = moment.tz("Asia/Dhaka").endOf('day');

        // Note: The database currently stores "Local Time as UTC" (e.g., 10 AM BD is stored as 10:00:00.000Z)
        // To match this, we need to query based on the "Wall Clock" time numbers.
        const startSearch = startOfBDToday.format("YYYY-MM-DDTHH:mm:ss.SSS") + "Z";
        const endSearch = endOfBDToday.format("YYYY-MM-DDTHH:mm:ss.SSS") + "Z";

        const filter = {
            duePayDate: { $gte: new Date(startSearch), $lte: new Date(endSearch) }
        };

        if (assignedTo) {
            if (assignedTo === 'unassigned') {
                filter.assignedTo = { $in: ['', null] };
            } else if (assignedTo === 'assigned') {
                filter.assignedTo = { $nin: ['', null] };
            } else {
                filter.assignedTo = assignedTo;
            }
        }

        const payments = await Payment.find(filter).sort({ duePayDate: 1 });

        res.json(payments);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/exportData', async (req, res) => {
    try {
        const { paymentStatus } = req.query;

        const filter = {};
        if (paymentStatus && paymentStatus !== 'all') {
            filter.paymentStatus = paymentStatus;
        }

        res.setHeader('Content-Type', 'text/csv');

        const fileName = paymentStatus && paymentStatus !== 'all'
            ? `payments_${paymentStatus.replace(/\s+/g, '_').toLowerCase()}.csv`
            : 'payments_all.csv';

        res.setHeader(
            'Content-Disposition',
            `attachment; filename=${fileName}`
        );

        const header =
            'Tuition Code,Payment Status,Payment Received Date 1,Payment Received Date 2,Payment Received Date 3,Payment Received Date 4,Due Payment Date,Payment Type 1,Payment Type 2,Payment Type 3,Payment Type 4,Tutor Name,Tutor Number,Payment Number 1,Payment Number 2,Payment Number 3,Payment Number 4,Transaction ID,Received TK 1,Received TK 2,Received TK 3,Received TK 4,Due Payment,Total Received TK,Tuition Salary,Total Payment TK,Discount,Comment,Comment 1,Comment 2,Comment 3,Reference,Assigned To,Created By,Updated By,Created At\n';

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
                    escapeCsvField(doc.paymentType2),
                    escapeCsvField(doc.paymentType3),
                    escapeCsvField(doc.paymentType4),
                    escapeCsvField(doc.tutorName),
                    escapeCsvField(doc.tutorNumber),
                    escapeCsvField(doc.paymentNumber),
                    escapeCsvField(doc.paymentNumber2),
                    escapeCsvField(doc.paymentNumber3),
                    escapeCsvField(doc.paymentNumber4),
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
                    escapeCsvField(doc.assignedTo),
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
        paymentType = '',
        assignedTo = ''
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
    if (assignedTo) {
        if (assignedTo === 'unassigned') {
            filter.assignedTo = { $in: ['', null] };
        } else if (assignedTo === 'assigned') {
            filter.assignedTo = { $nin: ['', null] };
        } else {
            filter.assignedTo = assignedTo;
        }
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
        paymentType = '',
        assignedTo = ''
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
    if (assignedTo) {
        if (assignedTo === 'unassigned') {
            filter.assignedTo = { $in: ['', null] };
        } else if (assignedTo === 'assigned') {
            filter.assignedTo = { $nin: ['', null] };
        } else {
            filter.assignedTo = assignedTo;
        }
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


router.post('/auto-migrate', authMiddleware, async (req, res) => {
    try {
        const { paymentIds } = req.body;
        const username = req.user.username;

        if (!paymentIds || !Array.isArray(paymentIds) || paymentIds.length === 0) {
            return res.status(400).json({ message: 'No payment IDs provided' });
        }

        const results = [];
        for (const id of paymentIds) {
            const payment = await Payment.findById(id);
            if (!payment) continue;

            const oldPayment = payment.toObject();

            // Calculate next day
            const currentDue = moment(payment.duePayDate);
            const nextDay = currentDue.clone().add(1, 'day');

            payment.duePayDate = nextDay.toDate();
            payment.updatedBy = 'auto migration';

            await payment.save();

            const diff = getDifferences(oldPayment, payment.toObject());
            await logActivity(req, 'Edit', 'Payment', payment._id, {
                ...diff,
                importantFields: { tuitionCode: payment.tuitionCode }
            });

            results.push(payment._id);
        }

        res.json({
            message: `Successfully migrated ${results.length} payment(s).`,
            migratedIds: results
        });
    } catch (err) {
        console.error('Auto migration error:', err);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;


