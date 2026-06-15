const express = require('express');
const RefundPayment = require('../models/RefundPayment');
const { logActivity, getDifferences } = require('../utils/activityLogger');
const router = express.Router();
const moment = require('moment-timezone');

router.get('/all', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            tuitionCode,
            paymentNumber,
            personalPhone,
            status
        } = req.query;

        const query = {};

        if (tuitionCode) {
            query.tuitionCode = { $regex: tuitionCode, $options: 'i' };
        }
        if (paymentNumber) {
            query.paymentNumber = { $regex: paymentNumber, $options: 'i' };
        }
        if (personalPhone) {
            query.personalPhone = { $regex: personalPhone, $options: 'i' };
        }
        if (status) {
            query.status = status;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const data = await RefundPayment.find(query)
            .sort({ requestedAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const totalRecords = await RefundPayment.countDocuments(query);

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
        const stats = await RefundPayment.aggregate([
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 }
                }
            }
        ]);

        const counts = {
            total: 0,
            pending: 0,
            underReview: 0,
            approved: 0,
            rejected: 0,
            completed: 0,
            cancelled: 0
        };

        stats.forEach(stat => {
            const status = stat._id || 'pending';
            const count = stat.count;
            counts.total += count;
            if (status === 'pending') counts.pending = count;
            else if (status === 'under review') counts.underReview = count;
            else if (status === 'approved') counts.approved = count;
            else if (status === 'rejected') counts.rejected = count;
            else if (status === 'completed') counts.completed = count;
            else if (status === 'cancelled') counts.cancelled = count;
        });

        res.json(counts);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/alert-today', async (req, res) => {
    try {
        const startOfBDToday = moment.tz("Asia/Dhaka").startOf('day');
        const endOfBDToday = moment.tz("Asia/Dhaka").endOf('day');

        const startSearch = startOfBDToday.format("YYYY-MM-DDTHH:mm:ss.SSS") + "Z";
        const endSearch = endOfBDToday.format("YYYY-MM-DDTHH:mm:ss.SSS") + "Z";

        const data = await RefundPayment.find({
            returnDate: {
                $gte: new Date(startSearch),
                $lte: new Date(endSearch)
            }
        }).sort({ requestedAt: -1 });

        res.json(data);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.post('/add', async (req, res) => {
    const {
        tuitionCode,
        paymentType,
        paymentNumber,
        personalPhone,
        amount,
        name,
        note,
        status,
        comment,
        createdBy,
        returnDate
    } = req.body;

    try {
        // Duplicate check: multiple conditions scoped to the same tuitionCode
        if (tuitionCode) {
            const tc = tuitionCode.trim();
            const pp = personalPhone?.trim();
            const pn = paymentNumber?.trim();

            const orConditions = [];
            if (pp) orConditions.push({ personalPhone: pp });           // personalPhone + tuitionCode
            if (pn) orConditions.push({ paymentNumber: pn });           // paymentNumber + tuitionCode
            if (pn) orConditions.push({ personalPhone: pn });           // paymentNumber used as personalPhone
            if (pp) orConditions.push({ paymentNumber: pp });           // personalPhone used as paymentNumber

            if (orConditions.length > 0) {
                const existing = await RefundPayment.findOne({ tuitionCode: tc, $or: orConditions });
                if (existing) {
                    let reason = '';
                    if (pp && existing.personalPhone === pp)
                        reason = `ফোন নম্বর (${pp}) ও টিউশন কোড ${tc} দিয়ে`;
                    else if (pn && existing.paymentNumber === pn)
                        reason = `পেমেন্ট নম্বর (${pn}) ও টিউশন কোড ${tc} দিয়ে`;
                    else if (pn && existing.personalPhone === pn)
                        reason = `পেমেন্ট নম্বর (${pn}) অন্য আবেদনে ফোন নম্বর হিসেবে ব্যবহৃত হয়েছে (টিউশন কোড ${tc})।`;
                    else if (pp && existing.paymentNumber === pp)
                        reason = `ফোন নম্বর (${pp}) অন্য আবেদনে পেমেন্ট নম্বর হিসেবে ব্যবহৃত হয়েছে (টিউশন কোড ${tc})।`;

                    return res.status(409).json({
                        message: `${reason} আগেই রিফান্ড আবেদন করা হয়েছে। একই তথ্য দিয়ে দুইবার আবেদন করা যাবে না।`
                    });
                }
            }
        }

        const localTime = moment().utcOffset(6 * 60).format("YYYY-MM-DD HH:mm:ss");

        const newApply = new RefundPayment({
            tuitionCode,
            paymentType,
            paymentNumber,
            personalPhone,
            amount,
            name,
            note,
            comment,
            requestedAt: localTime,
            createdBy: createdBy || 'teacher',
            status: status || 'pending',
            returnDate: returnDate && returnDate !== "" ? returnDate : null
        });

        await newApply.save();
        const activeUser = req.headers['x-user-name'] || 'Teacher';
        await logActivity(req, 'Create', 'RefundPayment', newApply._id, {
            after: newApply,
            importantFields: { tuitionCode: newApply.tuitionCode }
        }, activeUser);
        res.status(201).json(newApply);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/getRefundRequestStatuses', async (req, res) => {
    try {
        const summary = await RefundPayment.find({}, 'tuitionCode paymentType paymentNumber status phone');
        res.json(summary);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.put('/edit/:id', async (req, res) => {
    try {
        const updateData = { ...req.body };
        if (updateData.returnDate === "") {
            updateData.returnDate = null;
        }

        const oldData = await RefundPayment.findById(req.params.id).lean();
        const updatedData = await RefundPayment.findByIdAndUpdate(req.params.id, updateData, { new: true });

        if (oldData) {
            const diff = getDifferences(oldData, updatedData.toObject());
            await logActivity(req, 'Edit', 'RefundPayment', updatedData._id, {
                ...diff,
                importantFields: { tuitionCode: updatedData.tuitionCode }
            });
        }
        res.json(updatedData);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.delete('/delete/:id', async (req, res) => {
    try {
        const dataToDelete = await RefundPayment.findById(req.params.id).lean();
        await RefundPayment.findByIdAndDelete(req.params.id);

        if (dataToDelete) {
            await logActivity(req, 'Delete', 'RefundPayment', req.params.id, {
                importantFields: {
                    tuitionCode: dataToDelete.tuitionCode,
                    personalPhone: dataToDelete.personalPhone
                }
            });
        }
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
