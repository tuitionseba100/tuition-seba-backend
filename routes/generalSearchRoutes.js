const express = require('express');
const router = express.Router();
const GuardianApply = require('../models/GuardianApply');
const Lead = require('../models/Lead');
const Phone = require('../models/Phone');
const RegTeacher = require('../models/RegTeacher');
const Tuition = require('../models/Tuition');
const TuitionApply = require('../models/TuitionApply');
const TeacherPayment = require('../models/TeacherPayment');
const Payment = require('../models/Payment');
const RefundPayment = require('../models/RefundPayment');
const TaskData = require('../models/TaskData');


// General Phone Search Route
router.get('/phone/:phoneNumber', async (req, res) => {
    try {
        const { phoneNumber } = req.params;

        // Extract last 10 digits to handle variations like +880, 88 or leading 0
        const cleanNumber = phoneNumber.replace(/\D/g, ''); // remove non-digits
        if (cleanNumber.length < 10) {
            return res.status(400).json({ message: "Invalid phone number. Provide at least 10 digits." });
        }
        const last10Digits = cleanNumber.slice(-10);

        // Regex to match the end of the phone fields
        const phoneRegex = new RegExp(last10Digits);

        // Search across models with field projection and .lean() for zero bloat
        const [
            guardianApplies,
            leads,
            phones,
            teachers,
            tuitions,
            tuitionApplies,
            teacherPayments,
            payments,
            refunds
        ] = await Promise.all([
            GuardianApply.find({ phone: phoneRegex })
                .select('studentName phone tuitionCode appliedAt status')
                .sort({ _id: -1 })
                .lean(),
            Lead.find({ phone: phoneRegex })
                .select('name phone status tuitionCode')
                .sort({ _id: -1 })
                .lean(),
            Phone.find({ phone: phoneRegex })
                .select('phone isSpam isBest isExpress note')
                .sort({ _id: -1 })
                .lean(),
            RegTeacher.find({
                $or: [
                    { phone: phoneRegex },
                    { alternativePhone: phoneRegex },
                    { whatsapp: phoneRegex },
                    { familyPhone: phoneRegex },
                    { friendPhone: phoneRegex }
                ]
            })
                .select('premiumCode name phone alternativePhone whatsapp status')
                .sort({ _id: -1 })
                .lean(),
            Tuition.find({
                $or: [
                    { guardianNumber: phoneRegex },
                    { tutorNumber: phoneRegex }
                ],
                isSoftDelete: false
            })
                .select('tuitionCode city area guardianNumber tutorNumber status lastUpdate lastUpdateComment nextUpdateDate nextUpdateComment')
                .sort({ _id: -1 })
                .lean(),
            TuitionApply.find({ phone: phoneRegex })
                .select('name phone tuitionCode status')
                .sort({ _id: -1 })
                .lean(),
            TeacherPayment.find({
                $or: [
                    { paymentNumber: phoneRegex },
                    { personalPhone: phoneRegex }
                ],
                isSoftDelete: { $ne: true }
            })
                .select('tuitionCode personalPhone amount status')
                .sort({ _id: -1 })
                .lean(),
            Payment.find({
                $or: [
                    { tutorNumber: phoneRegex },
                    { paymentNumber: phoneRegex }
                ]
            })
                .select('tuitionCode tutorNumber receivedTk duePayment totalReceivedTk paymentStatus')
                .sort({ _id: -1 })
                .lean(),
            RefundPayment.find({
                $or: [
                    { paymentNumber: phoneRegex },
                    { personalPhone: phoneRegex }
                ]
            })
                .select('tuitionCode personalPhone amount status')
                .sort({ _id: -1 })
                .lean()
        ]);

        res.json({
            guardianApplies,
            leads,
            phones,
            teachers,
            tuitions,
            tuitionApplies,
            teacherPayments,
            payments,
            refunds
        });

    } catch (err) {
        console.error('General Search Error:', err);
        res.status(500).json({ message: err.message });
    }
});

// General Tuition Code Search Route
router.get('/tuition/:tuitionCode', async (req, res) => {
    try {
        const { tuitionCode } = req.params;

        // Search across models with field projection and .lean() for zero bloat
        const [
            tuitionApplies,
            tuitions,
            teacherPayments,
            taskDatas,
            refunds,
            payments,
            leads
        ] = await Promise.all([
            TuitionApply.find({ tuitionCode })
                .select('name phone tuitionCode status')
                .sort({ _id: -1 })
                .lean(),
            Tuition.find({ tuitionCode, isSoftDelete: { $ne: true } })
                .select('tuitionCode city area guardianNumber tutorNumber status lastUpdate lastUpdateComment nextUpdateDate nextUpdateComment')
                .sort({ _id: -1 })
                .lean(),
            TeacherPayment.find({ tuitionCode, isSoftDelete: { $ne: true } })
                .select('tuitionCode personalPhone amount status')
                .sort({ _id: -1 })
                .lean(),
            TaskData.find({ tuitionCode })
                .select('tuitionCode taskType status note')
                .sort({ _id: -1 })
                .lean(),
            RefundPayment.find({ tuitionCode })
                .select('tuitionCode personalPhone amount status')
                .sort({ _id: -1 })
                .lean(),
            Payment.find({ tuitionCode })
                .select('tuitionCode tutorNumber receivedTk duePayment totalReceivedTk paymentStatus')
                .sort({ _id: -1 })
                .lean(),
            Lead.find({ tuitionCode })
                .select('name phone status tuitionCode')
                .sort({ _id: -1 })
                .lean()
        ]);

        res.json({
            tuitionApplies,
            tuitions,
            teacherPayments,
            taskDatas,
            refunds,
            payments,
            leads
        });

    } catch (err) {
        console.error('Tuition Search Error:', err);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
