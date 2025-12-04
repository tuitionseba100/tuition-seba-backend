const express = require('express');
const RefundPayment = require('../models/RefundPayment');
const router = express.Router();
const moment = require('moment-timezone');

router.get('/all', async (req, res) => {
    try {
        const all = await RefundPayment.find();
        res.json(all);
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
            status: status || 'pending'
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
        const updatedData = await RefundPayment.findByIdAndUpdate(req.params.id, req.body, { new: true });
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


