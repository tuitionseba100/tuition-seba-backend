const express = require('express');
const Payment = require('../models/Payment');
const router = express.Router();

router.get('/all', async (req, res) => {
    try {
        const payments = await Payment.find();
        res.json(payments);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.post('/add', async (req, res) => {
    const {
        tuitionCode,
        tuitionId,
        paymentReceivedDate,
        duePayDate,
        paymentType,
        tutorName,
        tutorNumber,
        paymentNumber,
        transactionId,
        receivedTk,
        duePayment,
        paymentStatus,
        comment,
        totalReceivedTk,
        reference,
    } = req.body;

    try {
        const newPayment = new Payment({
            tuitionCode,
            tuitionId,
            paymentReceivedDate,
            duePayDate,
            reference,
            paymentType,
            tutorName,
            tutorNumber,
            paymentNumber,
            transactionId,
            receivedTk,
            duePayment,
            paymentStatus,
            comment,
            totalReceivedTk,
        });

        await newPayment.save();
        res.status(201).json(newPayment);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.put('/edit/:id', async (req, res) => {
    try {
        const updatedPayment = await Payment.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedPayment);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.delete('/delete/:id', async (req, res) => {
    try {
        await Payment.findByIdAndDelete(req.params.id);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;


