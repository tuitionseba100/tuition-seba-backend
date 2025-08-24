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


