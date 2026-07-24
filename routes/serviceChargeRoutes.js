const express = require('express');
const router = express.Router();
const ServiceCharge = require('../models/ServiceCharge');
const moment = require('moment-timezone');

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

        const todayMatch = { date: { $gte: todayStart, $lte: todayEnd } };
        const weekMatch = { date: { $gte: weekStart } };
        const monthMatch = { date: { $gte: monthStart } };

        const todayAgg = await ServiceCharge.aggregate([{ $match: todayMatch }, { $group: { _id: null, total: { $sum: "$amount" } } }]);
        const weekAgg = await ServiceCharge.aggregate([{ $match: weekMatch }, { $group: { _id: null, total: { $sum: "$amount" } } }]);
        const monthAgg = await ServiceCharge.aggregate([{ $match: monthMatch }, { $group: { _id: null, total: { $sum: "$amount" } } }]);
        const totalAgg = await ServiceCharge.aggregate([{ $group: { _id: null, total: { $sum: "$amount" } } }]);

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

module.exports = router;
