const express = require('express');
const Payment = require('../models/Payment');
const { logActivity, getDifferences } = require('../utils/activityLogger');
const router = express.Router();
const moment = require('moment-timezone');
const jwt = require('jsonwebtoken');
const Settings = require('../models/Settings');
const Attendance = require('../models/Attendance');
const RefundPayment = require('../models/RefundPayment');
const Expense = require('../models/Expense');
const RegTeacher = require('../models/RegTeacher');
const ServiceCharge = require('../models/ServiceCharge');


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

const superadminOnly = (req, res, next) => {
    if (req.user && req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Forbidden: Superadmin access required' });
    }
    next();
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
        duePayDateComment,
        installmentComment,
        installmentComment2,
        installmentComment3,
        installmentComment4
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
            duePayDateComment,
            installmentComment,
            installmentComment2,
            installmentComment3,
            installmentComment4
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

router.get('/route-report', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        let startUTC, endUTC;
        let query = {};
        if (startDate && endDate) {
            const startBD = new Date(startDate);
            startBD.setHours(0, 0, 0, 0);
            const endBD = new Date(endDate);
            endBD.setHours(23, 59, 59, 999);

            startUTC = new Date(startBD.toLocaleString('en-US', { timeZone: 'UTC' }));
            endUTC = new Date(endBD.toLocaleString('en-US', { timeZone: 'UTC' }));

            query = {
                $or: [
                    { paymentReceivedDate: { $gte: startUTC, $lte: endUTC } },
                    { paymentReceivedDate2: { $gte: startUTC, $lte: endUTC } },
                    { paymentReceivedDate3: { $gte: startUTC, $lte: endUTC } },
                    { paymentReceivedDate4: { $gte: startUTC, $lte: endUTC } }
                ]
            };
        }

        const routeData = {};
        const dateDataMap = {};

        const cursor = Payment.find(query)
            .select('paymentReceivedDate paymentReceivedDate2 paymentReceivedDate3 paymentReceivedDate4 paymentType paymentType2 paymentType3 paymentType4 receivedTk receivedTk2 receivedTk3 receivedTk4')
            .lean()
            .cursor();

        cursor.on('data', (payment) => {
            const processPaymentSet = (pDate, pType, pTk) => {
                if (pDate) {
                    const dateObj = new Date(pDate);
                    if (startUTC && endUTC) {
                        if (dateObj < startUTC || dateObj > endUTC) return;
                    }

                    const amount = parseFloat(pTk) || 0;
                    if (amount >= 0) {
                        let route = (pType || '').trim();
                        if (route) {
                            route = route.charAt(0).toUpperCase() + route.slice(1).toLowerCase();
                        } else {
                            route = "Unknown";
                        }

                        if (!routeData[route]) {
                            routeData[route] = { route, amount: 0, count: 0 };
                        }
                        routeData[route].amount += amount;
                        routeData[route].count += 1;

                        const dateString = dateObj.toLocaleDateString('en-CA'); // YYYY-MM-DD format
                        if (!dateDataMap[dateString]) {
                            dateDataMap[dateString] = { date: dateString, amount: 0, count: 0 };
                        }
                        dateDataMap[dateString].amount += amount;
                        dateDataMap[dateString].count += 1;
                    }
                }
            };

            processPaymentSet(payment.paymentReceivedDate, payment.paymentType, payment.receivedTk);
            processPaymentSet(payment.paymentReceivedDate2, payment.paymentType2, payment.receivedTk2);
            processPaymentSet(payment.paymentReceivedDate3, payment.paymentType3, payment.receivedTk3);
            processPaymentSet(payment.paymentReceivedDate4, payment.paymentType4, payment.receivedTk4);
        });

        cursor.on('end', () => {
            const reportArray = Object.values(routeData).sort((a, b) => b.amount - a.amount);
            const dateArray = Object.values(dateDataMap).sort((a, b) => new Date(b.date) - new Date(a.date));

            res.json({
                data: reportArray,
                routeData: reportArray,
                dateData: dateArray,
                totalAmount: reportArray.reduce((sum, item) => sum + item.amount, 0),
                totalCount: reportArray.reduce((sum, item) => sum + item.count, 0)
            });
        });

        cursor.on('error', (err) => {
            console.error('Payment Report Stream Error:', err);
            if (!res.headersSent) {
                res.status(500).json({ message: 'Error streaming payment report data' });
            }
        });

    } catch (err) {
        console.error('Route report error:', err);
        res.status(500).json({ message: err.message });
    }
});


router.get('/date-details', authMiddleware, superadminOnly, async (req, res) => {
    try {
        const { date, type = 'payment', page = 1, limit = 20 } = req.query;
        if (!date) {
            return res.status(400).json({ message: 'Date parameter is required' });
        }

        const startUTC = moment.utc(date, "YYYY-MM-DD").startOf('day').toDate();
        const endUTC = moment.utc(date, "YYYY-MM-DD").endOf('day').toDate();

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        if (type === 'payment') {
            const query = {
                $or: [
                    { paymentReceivedDate: { $gte: startUTC, $lte: endUTC } },
                    { paymentReceivedDate2: { $gte: startUTC, $lte: endUTC } },
                    { paymentReceivedDate3: { $gte: startUTC, $lte: endUTC } },
                    { paymentReceivedDate4: { $gte: startUTC, $lte: endUTC } }
                ]
            };

            const payments = await Payment.find(query).lean();

            let extractedPayments = [];

            payments.forEach(payment => {
                const processPaymentSet = (pDate, pType, pTk) => {
                    if (pDate) {
                        const dateObj = new Date(pDate);
                        if (dateObj >= startUTC && dateObj <= endUTC) {
                            const amount = parseFloat(pTk) || 0;
                            if (amount >= 0) {
                                extractedPayments.push({
                                    _id: payment._id,
                                    tuitionCode: payment.tuitionCode,
                                    tutorNumber: payment.tutorNumber,
                                    route: pType || 'Unknown',
                                    amount: amount,
                                    timestamp: dateObj
                                });
                            }
                        }
                    }
                };

                processPaymentSet(payment.paymentReceivedDate, payment.paymentType, payment.receivedTk);
                processPaymentSet(payment.paymentReceivedDate2, payment.paymentType2, payment.receivedTk2);
                processPaymentSet(payment.paymentReceivedDate3, payment.paymentType3, payment.receivedTk3);
                processPaymentSet(payment.paymentReceivedDate4, payment.paymentType4, payment.receivedTk4);
            });

            // Sort by timestamp descending
            extractedPayments.sort((a, b) => b.timestamp - a.timestamp);

            const totalRecords = extractedPayments.length;
            const paginatedData = extractedPayments.slice(skip, skip + limitNum);

            // Calculate total amount
            const totalAmount = extractedPayments.reduce((sum, item) => sum + item.amount, 0);

            return res.json({
                data: paginatedData,
                currentPage: pageNum,
                totalPages: Math.ceil(totalRecords / limitNum),
                totalRecords: totalRecords,
                totalAmount: totalAmount
            });

        } else if (type === 'refund') {
            const query = {
                status: 'completed',
                $or: [
                    { returnDate: { $gte: startUTC, $lte: endUTC } },
                    { requestedAt: { $gte: startUTC, $lte: endUTC }, returnDate: { $exists: false } }
                ]
            };

            const totalRecords = await RefundPayment.countDocuments(query);
            const refunds = await RefundPayment.find(query)
                .sort({ _id: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean();

            const formattedRefunds = refunds.map(r => ({
                _id: r._id,
                tuitionCode: r.tuitionCode,
                route: r.returnRoute || r.requestRoute || 'Unknown',
                amount: parseFloat(r.amount) || 0,
                timestamp: r.returnDate || r.requestedAt
            }));

            const allRefundsForDay = await RefundPayment.find(query).lean();
            const totalAmount = allRefundsForDay.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

            return res.json({
                data: formattedRefunds,
                currentPage: pageNum,
                totalPages: Math.ceil(totalRecords / limitNum),
                totalRecords: totalRecords,
                totalAmount: totalAmount
            });
        } else if (type === 'expense') {
            const query = {
                date: { $gte: startUTC, $lte: endUTC }
            };

            const totalRecords = await Expense.countDocuments(query);
            const expenses = await Expense.find(query)
                .sort({ _id: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean();

            const formattedExpenses = expenses.map(e => ({
                _id: e._id,
                tuitionCode: e.category,
                route: '-',
                amount: parseFloat(e.amount) || 0,
                timestamp: e.date
            }));

            const allExpensesForDay = await Expense.find(query).lean();
            const totalAmount = allExpensesForDay.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

            return res.json({
                data: formattedExpenses,
                currentPage: pageNum,
                totalPages: Math.ceil(totalRecords / limitNum),
                totalRecords: totalRecords,
                totalAmount: totalAmount
            });
        } else if (type === 'all') {
            // Fetch Payments
            const payQuery = {
                $or: [
                    { paymentReceivedDate: { $gte: startUTC, $lte: endUTC } },
                    { paymentReceivedDate2: { $gte: startUTC, $lte: endUTC } },
                    { paymentReceivedDate3: { $gte: startUTC, $lte: endUTC } },
                    { paymentReceivedDate4: { $gte: startUTC, $lte: endUTC } }
                ]
            };
            const payments = await Payment.find(payQuery).lean();
            let extractedPayments = [];
            payments.forEach(payment => {
                const processPaymentSet = (pDate, pType, pTk) => {
                    if (pDate) {
                        const dateObj = new Date(pDate);
                        if (dateObj >= startUTC && dateObj <= endUTC) {
                            const amount = parseFloat(pTk) || 0;
                            if (amount >= 0) {
                                extractedPayments.push({
                                    _id: payment._id,
                                    tuitionCode: payment.tuitionCode,
                                    tutorNumber: payment.tutorNumber,
                                    route: pType || 'Unknown',
                                    amount: amount,
                                    timestamp: dateObj
                                });
                            }
                        }
                    }
                };
                processPaymentSet(payment.paymentReceivedDate, payment.paymentType, payment.receivedTk);
                processPaymentSet(payment.paymentReceivedDate2, payment.paymentType2, payment.receivedTk2);
                processPaymentSet(payment.paymentReceivedDate3, payment.paymentType3, payment.receivedTk3);
                processPaymentSet(payment.paymentReceivedDate4, payment.paymentType4, payment.receivedTk4);
            });
            extractedPayments.sort((a, b) => b.timestamp - a.timestamp);

            // Fetch Refunds
            const refQuery = {
                status: 'completed',
                $or: [
                    { returnDate: { $gte: startUTC, $lte: endUTC } },
                    { requestedAt: { $gte: startUTC, $lte: endUTC }, returnDate: { $exists: false } }
                ]
            };
            const refunds = await RefundPayment.find(refQuery).sort({ _id: -1 }).lean();
            const formattedRefunds = refunds.map(r => ({
                _id: r._id,
                tuitionCode: r.tuitionCode,
                route: r.returnRoute || r.requestRoute || 'Unknown',
                amount: parseFloat(r.amount) || 0,
                timestamp: r.returnDate || r.requestedAt
            }));

            // Fetch Expenses
            const expQuery = { date: { $gte: startUTC, $lte: endUTC } };
            const expenses = await Expense.find(expQuery).sort({ _id: -1 }).lean();
            const formattedExpenses = expenses.map(e => ({
                _id: e._id,
                tuitionCode: e.category,
                route: '-',
                amount: parseFloat(e.amount) || 0,
                timestamp: e.date
            }));

            // Fetch Premium Teacher Fees for the date (ALL records for display, but only numeric for total)
            const premiumQuery = {
                paymentDate: { $gte: startUTC, $lte: endUTC },
                amount: { $exists: true, $nin: ['', null] }
            };
            const premiumTeachers = await RegTeacher.find(premiumQuery).sort({ paymentDate: -1 }).lean();
            const formattedPremium = premiumTeachers.map(t => ({
                _id: t._id,
                name: t.name || '-',
                premiumCode: t.premiumCode || '-',
                amountRaw: t.amount,
                amount: /^\d+(\.\d+)?$/.test(String(t.amount || '').trim()) ? parseFloat(t.amount) : 0,
                isNumeric: /^\d+(\.\d+)?$/.test(String(t.amount || '').trim()),
                timestamp: t.paymentDate
            }));
            const premiumNumericTotal = formattedPremium.reduce((sum, item) => sum + item.amount, 0);

            return res.json({
                payments: {
                    data: extractedPayments,
                    totalAmount: extractedPayments.reduce((sum, item) => sum + item.amount, 0)
                },
                refunds: {
                    data: formattedRefunds,
                    totalAmount: formattedRefunds.reduce((sum, item) => sum + item.amount, 0)
                },
                expenses: {
                    data: formattedExpenses,
                    totalAmount: formattedExpenses.reduce((sum, item) => sum + item.amount, 0)
                },
                premiumFees: {
                    data: formattedPremium,
                    totalAmount: premiumNumericTotal
                }
            });
        } else {
            return res.status(400).json({ message: 'Invalid type parameter' });
        }

    } catch (err) {
        console.error('Error fetching date details:', err);
        res.status(500).json({ message: err.message });
    }
});

router.get('/overall-report', authMiddleware, superadminOnly, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let startUTC, endUTC;
        let query = {};
        let refundQuery = { status: 'completed' };

        if (startDate && endDate) {
            startUTC = moment.utc(startDate, "YYYY-MM-DD").startOf('day').toDate();
            endUTC = moment.utc(endDate, "YYYY-MM-DD").endOf('day').toDate();

            query = {
                $or: [
                    { paymentReceivedDate: { $gte: startUTC, $lte: endUTC } },
                    { paymentReceivedDate2: { $gte: startUTC, $lte: endUTC } },
                    { paymentReceivedDate3: { $gte: startUTC, $lte: endUTC } },
                    { paymentReceivedDate4: { $gte: startUTC, $lte: endUTC } }
                ]
            };

            // Assuming refunds use returnDate or requestedAt when completed
            // If returnDate exists, it's safer to use returnDate, otherwise requestedAt. We'll check requestedAt for filtering to be safe if returnDate isn't consistently used for queries.
            // Actually refundPaymentRoutes.js searches by requestedAt or returnDate. I'll search returnDate for completed refunds.
            refundQuery.returnDate = { $gte: startUTC, $lte: endUTC };
        }

        const dateDataMap = {};

        // 1. Stream Payments
        const paymentCursor = Payment.find(query)
            .select('paymentReceivedDate paymentReceivedDate2 paymentReceivedDate3 paymentReceivedDate4 paymentType paymentType2 paymentType3 paymentType4 receivedTk receivedTk2 receivedTk3 receivedTk4')
            .lean()
            .cursor();

        const getOrCreateDateEntry = (dateString) => {
            if (!dateDataMap[dateString]) {
                dateDataMap[dateString] = {
                    date: dateString,
                    paymentAmount: 0,
                    paymentCount: 0,
                    refundAmount: 0,
                    refundCount: 0,
                    expenseAmount: 0,
                    expenseCount: 0,
                    premiumFeeAmount: 0,
                    premiumFeeCount: 0,
                    serviceChargeAmount: 0,
                    serviceChargeCount: 0
                };
            }
            return dateDataMap[dateString];
        };

        paymentCursor.on('data', (payment) => {
            const processPaymentSet = (pDate, pType, pTk) => {
                if (pDate) {
                    const dateObj = new Date(pDate);
                    if (startUTC && endUTC) {
                        if (dateObj < startUTC || dateObj > endUTC) return;
                    }

                    const amount = parseFloat(pTk) || 0;
                    if (amount >= 0) {
                        const dateString = moment.utc(dateObj).format('YYYY-MM-DD');
                        const entry = getOrCreateDateEntry(dateString);
                        entry.paymentAmount += amount;
                        entry.paymentCount += 1;
                    }
                }
            };

            processPaymentSet(payment.paymentReceivedDate, payment.paymentType, payment.receivedTk);
            processPaymentSet(payment.paymentReceivedDate2, payment.paymentType2, payment.receivedTk2);
            processPaymentSet(payment.paymentReceivedDate3, payment.paymentType3, payment.receivedTk3);
            processPaymentSet(payment.paymentReceivedDate4, payment.paymentType4, payment.receivedTk4);
        });

        await new Promise((resolve, reject) => {
            paymentCursor.on('end', resolve);
            paymentCursor.on('error', reject);
        });

        // 2. Stream Refunds
        // We'll fall back to requestedAt if returnDate is missing just in case
        const refundQueryFallback = { status: 'completed' };
        if (startUTC && endUTC) {
            refundQueryFallback.$or = [
                { returnDate: { $gte: startUTC, $lte: endUTC } },
                { requestedAt: { $gte: startUTC, $lte: endUTC }, returnDate: { $exists: false } }
            ];
        }

        const refundCursor = RefundPayment.find(refundQueryFallback)
            .select('returnDate requestedAt amount')
            .lean()
            .cursor();

        refundCursor.on('data', (refund) => {
            const dateObj = new Date(refund.returnDate || refund.requestedAt);
            if (startUTC && endUTC) {
                if (dateObj < startUTC || dateObj > endUTC) return;
            }
            const amount = parseFloat(refund.amount) || 0;
            if (amount >= 0) {
                const dateString = moment.utc(dateObj).format('YYYY-MM-DD');
                const entry = getOrCreateDateEntry(dateString);
                entry.refundAmount += amount;
                entry.refundCount += 1;
            }
        });

        await new Promise((resolve, reject) => {
            refundCursor.on('end', resolve);
            refundCursor.on('error', reject);
        });

        // 3. Stream Expenses
        let expenseQuery = {};
        if (startUTC && endUTC) {
            expenseQuery.date = { $gte: startUTC, $lte: endUTC };
        }
        const expenseCursor = Expense.find(expenseQuery)
            .select('date amount')
            .lean()
            .cursor();

        expenseCursor.on('data', (expense) => {
            const dateObj = new Date(expense.date);
            if (startUTC && endUTC) {
                if (dateObj < startUTC || dateObj > endUTC) return;
            }
            const amount = parseFloat(expense.amount) || 0;
            if (amount >= 0) {
                const dateString = moment.utc(dateObj).format('YYYY-MM-DD');
                const entry = getOrCreateDateEntry(dateString);
                entry.expenseAmount += amount;
                entry.expenseCount += 1;
            }
        });

        await new Promise((resolve, reject) => {
            expenseCursor.on('end', resolve);
            expenseCursor.on('error', reject);
        });

        // 4. Stream Premium Teacher Fees (by paymentDate, only numeric amounts)
        let premiumQuery = { paymentDate: { $exists: true, $ne: null }, amount: { $exists: true, $nin: ['', null] } };
        if (startUTC && endUTC) {
            premiumQuery.paymentDate = { $gte: startUTC, $lte: endUTC };
        }
        const premiumCursor = RegTeacher.find(premiumQuery)
            .select('paymentDate amount')
            .lean()
            .cursor();

        premiumCursor.on('data', (teacher) => {
            const raw = String(teacher.amount || '').trim();
            const numericAmount = parseFloat(raw);
            if (isNaN(numericAmount) || !/^\d+(\.\d+)?$/.test(raw)) return; // skip non-numeric
            const dateObj = new Date(teacher.paymentDate);
            if (startUTC && endUTC) {
                if (dateObj < startUTC || dateObj > endUTC) return;
            }
            if (numericAmount >= 0) {
                const dateString = moment.utc(dateObj).format('YYYY-MM-DD');
                const entry = getOrCreateDateEntry(dateString);
                entry.premiumFeeAmount += numericAmount;
                entry.premiumFeeCount += 1;
            }
        });

        await new Promise((resolve, reject) => {
            premiumCursor.on('end', resolve);
            premiumCursor.on('error', reject);
        });

        // 4.5. Stream Service Charges
        let serviceChargeQuery = {};
        if (startUTC && endUTC) {
            serviceChargeQuery.date = { $gte: startUTC, $lte: endUTC };
        }
        const serviceChargeCursor = ServiceCharge.find(serviceChargeQuery)
            .select('date amount')
            .lean()
            .cursor();

        serviceChargeCursor.on('data', (sc) => {
            const raw = String(sc.amount || '').trim();
            const numericAmount = parseFloat(raw);
            if (isNaN(numericAmount) || !/^\d+(\.\d+)?$/.test(raw)) return; // skip non-numeric
            const dateObj = new Date(sc.date);
            if (startUTC && endUTC) {
                if (dateObj < startUTC || dateObj > endUTC) return;
            }
            if (numericAmount >= 0) {
                const dateString = moment.utc(dateObj).format('YYYY-MM-DD');
                const entry = getOrCreateDateEntry(dateString);
                entry.serviceChargeAmount += numericAmount;
                entry.serviceChargeCount += 1;
            }
        });

        await new Promise((resolve, reject) => {
            serviceChargeCursor.on('end', resolve);
            serviceChargeCursor.on('error', reject);
        });

        // 5. Format Response
        const dateArray = Object.values(dateDataMap).sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json({
            data: dateArray,
            totalPaymentAmount: dateArray.reduce((sum, item) => sum + item.paymentAmount, 0),
            totalPaymentCount: dateArray.reduce((sum, item) => sum + item.paymentCount, 0),
            totalRefundAmount: dateArray.reduce((sum, item) => sum + item.refundAmount, 0),
            totalRefundCount: dateArray.reduce((sum, item) => sum + item.refundCount, 0),
            totalExpenseAmount: dateArray.reduce((sum, item) => sum + item.expenseAmount, 0),
            totalExpenseCount: dateArray.reduce((sum, item) => sum + item.expenseCount, 0),
            totalPremiumFeeAmount: dateArray.reduce((sum, item) => sum + item.premiumFeeAmount, 0),
            totalPremiumFeeCount: dateArray.reduce((sum, item) => sum + item.premiumFeeCount, 0),
            totalServiceChargeAmount: dateArray.reduce((sum, item) => sum + item.serviceChargeAmount, 0),
            totalServiceChargeCount: dateArray.reduce((sum, item) => sum + item.serviceChargeCount, 0)
        });

    } catch (err) {
        console.error('Overall Payment Report Error:', err);
        res.status(500).json({ message: 'Error generating overall report' });
    }
});

module.exports = router;


