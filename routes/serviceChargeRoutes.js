const express = require('express');
const router = express.Router();
const ServiceCharge = require('../models/ServiceCharge');
const moment = require('moment-timezone');
const jwt = require('jsonwebtoken');
const { logActivity, getDifferences } = require('../utils/activityLogger');

const authMiddleware = (req, res, next) => {
    const token = req.header('Authorization');
    if (!token) {
        if (req.headers['x-user-name']) {
            req.user = { username: req.headers['x-user-name'] };
            return next();
        }
        return res.status(401).json({ message: 'Access Denied' });
    }

    try {
        const verified = jwt.verify(token, 'mahedi1000abcdefgh100');
        req.user = verified;
        next();
    } catch (err) {
        if (req.headers['x-user-name']) {
            req.user = { username: req.headers['x-user-name'] };
            return next();
        }
        res.status(400).json({ message: 'Invalid Token' });
    }
};

router.get('/all', async (req, res) => {
    try {
        const { page = 1, limit = 50, tuitionCode, teacherCode, phone, status, toBePaidToday } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const query = {};
        if (tuitionCode) {
            query.tuitionCode = { $regex: tuitionCode, $options: 'i' };
        }
        if (teacherCode) {
            query.teacherCode = { $regex: teacherCode, $options: 'i' };
        }
        if (phone) {
            query.personalPhone = { $regex: phone, $options: 'i' };
        }
        if (status) {
            query.status = status;
        }
        if (toBePaidToday === 'true') {
            const bdNow = moment.tz("Asia/Dhaka");
            const todayStart = bdNow.clone().startOf('day').toDate();
            const todayEnd = bdNow.clone().endOf('day').toDate();
            query.nextPaymentDate = { $gte: todayStart, $lte: todayEnd };
        }

        const data = await ServiceCharge.find(query)
            .sort(toBePaidToday === 'true' ? { nextPaymentDate: 1, date: -1 } : { date: -1, modifiedAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();
            
        const totalRecords = await ServiceCharge.countDocuments(query);
        
        res.json({
            data,
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalRecords / parseInt(limit)),
            totalRecords
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/summary', async (req, res) => {
    try {
        const bdNow = moment.tz("Asia/Dhaka");
        const todayStart = bdNow.clone().startOf('day').toDate();
        const todayEnd = bdNow.clone().endOf('day').toDate();
        // For 'this week', Sunday start is standard, but moment uses locale.
        const weekStart = bdNow.clone().startOf('week').toDate();
        const monthStart = bdNow.clone().startOf('month').toDate();

        const todayMatch = { date: { $gte: todayStart, $lte: todayEnd }, status: { $nin: ['pending', 'cancelled'] } };
        const weekMatch = { date: { $gte: weekStart }, status: { $nin: ['pending', 'cancelled'] } };
        const monthMatch = { date: { $gte: monthStart }, status: { $nin: ['pending', 'cancelled'] } };

        const todayAgg = await ServiceCharge.aggregate([{ $match: todayMatch }, { $group: { _id: null, total: { $sum: "$amount" } } }]);
        const weekAgg = await ServiceCharge.aggregate([{ $match: weekMatch }, { $group: { _id: null, total: { $sum: "$amount" } } }]);
        const monthAgg = await ServiceCharge.aggregate([{ $match: monthMatch }, { $group: { _id: null, total: { $sum: "$amount" } } }]);
        const totalAgg = await ServiceCharge.aggregate([{ $match: { status: { $nin: ['pending', 'cancelled'] } } }, { $group: { _id: null, total: { $sum: "$amount" } } }]);

        const toBePaidTodayCount = await ServiceCharge.countDocuments({
            nextPaymentDate: { $gte: todayStart, $lte: todayEnd }
        });

        res.json({
            today: todayAgg.length ? todayAgg[0].total : 0,
            week: weekAgg.length ? weekAgg[0].total : 0,
            month: monthAgg.length ? monthAgg[0].total : 0,
            total: totalAgg.length ? totalAgg[0].total : 0,
            toBePaidTodayCount: toBePaidTodayCount || 0
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/alert-today', async (req, res) => {
    try {
        const bdNow = moment.tz("Asia/Dhaka");
        const todayStart = bdNow.clone().startOf('day').toDate();
        const todayEnd = bdNow.clone().endOf('day').toDate();

        const serviceCharges = await ServiceCharge.find({
            nextPaymentDate: { $gte: todayStart, $lte: todayEnd }
        }).sort({ nextPaymentDate: 1 }).lean();

        res.json(serviceCharges);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/auto-migrate', authMiddleware, async (req, res) => {
    try {
        const { serviceChargeIds } = req.body;

        if (!serviceChargeIds || !Array.isArray(serviceChargeIds) || serviceChargeIds.length === 0) {
            return res.status(400).json({ message: 'No service charge IDs provided' });
        }

        const results = [];
        for (const id of serviceChargeIds) {
            const sc = await ServiceCharge.findById(id);
            if (!sc) continue;

            const oldSc = sc.toObject();

            // Calculate next day
            const currentNextPayment = sc.nextPaymentDate ? moment(sc.nextPaymentDate) : moment();
            const nextDay = currentNextPayment.clone().add(1, 'day');

            sc.nextPaymentDate = nextDay.toDate();
            sc.updatedBy = 'auto migration';
            sc.modifiedAt = Date.now();

            await sc.save();

            const diff = getDifferences(oldSc, sc.toObject());
            await logActivity(req, 'Edit', 'ServiceCharge', sc._id, {
                ...diff,
                importantFields: { tuitionCode: sc.tuitionCode }
            }, 'auto migration');

            results.push(sc._id);
        }

        res.json({
            message: `Successfully migrated ${results.length} service charge(s).`,
            migratedIds: results
        });
    } catch (err) {
        console.error('Auto migration error in serviceCharge:', err);
        res.status(500).json({ message: err.message });
    }
});

router.post('/add', async (req, res) => {
    try {
        const { tuitionCode, teacherCode, name, paymentNumber, personalPhone, amount, comment, date, nextPaymentDate, nextComment, status } = req.body;
        const activeUser = req.headers['x-user-name'] || 'Admin';

        if (!status || !['pending', 'completed', 'cancelled'].includes(status)) {
            return res.status(400).json({ message: "Status is required and must be one of: pending, completed, cancelled." });
        }

        if (tuitionCode && paymentNumber) {
            const existing = await ServiceCharge.findOne({
                tuitionCode: tuitionCode.trim(),
                paymentNumber: paymentNumber.trim()
            });
            if (existing) {
                return res.status(409).json({ message: "এই টিউশন কোড এবং পেমেন্ট নম্বর দিয়ে ইতোমধ্যে একটি সার্ভিস চার্জ রেকর্ড করা হয়েছে।" });
            }
        }

        const newServiceCharge = new ServiceCharge({
            tuitionCode,
            teacherCode: teacherCode || '',
            name,
            paymentNumber,
            personalPhone,
            amount: parseFloat(amount) || 0,
            comment,
            date: date && date !== "" ? new Date(date) : new Date(),
            nextPaymentDate: nextPaymentDate && nextPaymentDate !== "" ? new Date(nextPaymentDate) : null,
            nextComment: nextComment || req.body.nextCommentDate || '',
            createdBy: activeUser,
            status
        });

        await newServiceCharge.save();

        await logActivity(req, 'Create', 'ServiceCharge', newServiceCharge._id, {
            after: newServiceCharge,
            importantFields: { tuitionCode: newServiceCharge.tuitionCode, teacherCode: newServiceCharge.teacherCode }
        }, activeUser);

        res.status(201).json(newServiceCharge);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.put('/edit/:id', async (req, res) => {
    try {
        const { tuitionCode, teacherCode, name, paymentNumber, personalPhone, amount, comment, date, nextPaymentDate, nextComment, status } = req.body;
        const activeUser = req.headers['x-user-name'] || 'Admin';

        if (!status || !['pending', 'completed', 'cancelled'].includes(status)) {
            return res.status(400).json({ message: "Status is required and must be one of: pending, completed, cancelled." });
        }

        const oldData = await ServiceCharge.findById(req.params.id).lean();
        if (!oldData) {
            return res.status(404).json({ message: 'Service charge not found' });
        }

        if (tuitionCode && paymentNumber) {
            const existing = await ServiceCharge.findOne({
                tuitionCode: tuitionCode.trim(),
                paymentNumber: paymentNumber.trim(),
                _id: { $ne: req.params.id }
            });
            if (existing) {
                return res.status(409).json({ message: "এই টিউশন কোড এবং পেমেন্ট নম্বর দিয়ে ইতোমধ্যে একটি সার্ভিস চার্জ রেকর্ড করা হয়েছে।" });
            }
        }

        const updatedServiceCharge = await ServiceCharge.findByIdAndUpdate(
            req.params.id,
            {
                tuitionCode,
                teacherCode: teacherCode !== undefined ? teacherCode : oldData.teacherCode,
                name,
                paymentNumber,
                personalPhone,
                amount: parseFloat(amount) || 0,
                comment,
                date: date && date !== "" ? new Date(date) : new Date(),
                nextPaymentDate: nextPaymentDate && nextPaymentDate !== "" ? new Date(nextPaymentDate) : null,
                nextComment: nextComment !== undefined ? nextComment : (req.body.nextCommentDate !== undefined ? req.body.nextCommentDate : oldData.nextComment),
                modifiedAt: Date.now(),
                updatedBy: activeUser,
                status: status || ''
            },
            { new: true }
        );

        const diff = getDifferences(oldData, updatedServiceCharge.toObject());
        await logActivity(req, 'Edit', 'ServiceCharge', updatedServiceCharge._id, {
            ...diff,
            importantFields: { tuitionCode: updatedServiceCharge.tuitionCode, teacherCode: updatedServiceCharge.teacherCode }
        }, activeUser);

        res.json(updatedServiceCharge);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.delete('/delete/:id', async (req, res) => {
    try {
        const activeUser = req.headers['x-user-name'] || 'Admin';
        const oldData = await ServiceCharge.findById(req.params.id).lean();
        if (!oldData) {
            return res.status(404).json({ message: 'Service charge not found' });
        }

        await ServiceCharge.findByIdAndDelete(req.params.id);

        await logActivity(req, 'Delete', 'ServiceCharge', req.params.id, {
            importantFields: { tuitionCode: oldData.tuitionCode }
        }, activeUser);

        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
