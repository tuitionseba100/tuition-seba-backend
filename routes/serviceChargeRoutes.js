const express = require('express');
const router = express.Router();
const ServiceCharge = require('../models/ServiceCharge');
const moment = require('moment-timezone');
const { logActivity, getDifferences } = require('../utils/activityLogger');

router.get('/all', async (req, res) => {
    try {
        const { page = 1, limit = 50, tuitionCode, phone } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const query = {};
        if (tuitionCode) {
            query.tuitionCode = { $regex: tuitionCode, $options: 'i' };
        }
        if (phone) {
            query.personalPhone = { $regex: phone, $options: 'i' };
        }

        const data = await ServiceCharge.find(query)
            .sort({ date: -1, modifiedAt: -1 })
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

        res.json({
            today: todayAgg.length ? todayAgg[0].total : 0,
            week: weekAgg.length ? weekAgg[0].total : 0,
            month: monthAgg.length ? monthAgg[0].total : 0,
            total: totalAgg.length ? totalAgg[0].total : 0
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/add', async (req, res) => {
    try {
        const { tuitionCode, name, paymentNumber, personalPhone, amount, comment, date, status } = req.body;
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
            name,
            paymentNumber,
            personalPhone,
            amount: parseFloat(amount) || 0,
            comment,
            date: date && date !== "" ? new Date(date) : new Date(),
            createdBy: activeUser,
            status: status || 'pending'
        });

        await newServiceCharge.save();

        await logActivity(req, 'Create', 'ServiceCharge', newServiceCharge._id, {
            after: newServiceCharge,
            importantFields: { tuitionCode: newServiceCharge.tuitionCode }
        }, activeUser);

        res.status(201).json(newServiceCharge);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.put('/edit/:id', async (req, res) => {
    try {
        const { tuitionCode, name, paymentNumber, personalPhone, amount, comment, date, status } = req.body;
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
                name,
                paymentNumber,
                personalPhone,
                amount: parseFloat(amount) || 0,
                comment,
                date: date && date !== "" ? new Date(date) : new Date(),
                modifiedAt: Date.now(),
                updatedBy: activeUser,
                status
            },
            { new: true }
        );

        const diff = getDifferences(oldData, updatedServiceCharge.toObject());
        await logActivity(req, 'Edit', 'ServiceCharge', updatedServiceCharge._id, {
            ...diff,
            importantFields: { tuitionCode: updatedServiceCharge.tuitionCode }
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
