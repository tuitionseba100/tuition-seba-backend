const express = require('express');
const RefundPayment = require('../models/RefundPayment');
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
        const updatedData = await RefundPayment.findByIdAndUpdate(req.params.id, updateData, { new: true });
        res.json(updatedData);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.delete('/delete/:id', async (req, res) => {
    try {
        await RefundPayment.findByIdAndDelete(req.params.id);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;


