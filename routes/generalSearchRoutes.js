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
        const phoneRegex = new RegExp(last10Digits + '$');

        // Search across models
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
            GuardianApply.find({ phone: phoneRegex }),
            Lead.find({ phone: phoneRegex }),
            Phone.find({ phone: phoneRegex }),
            RegTeacher.find({
                $or: [
                    { phone: phoneRegex },
                    { alternativePhone: phoneRegex },
                    { whatsapp: phoneRegex },
                    { familyPhone: phoneRegex },
                    { friendPhone: phoneRegex }
                ]
            }),
            Tuition.find({
                $or: [
                    { guardianNumber: phoneRegex },
                    { tutorNumber: phoneRegex }
                ]
            }),
            TuitionApply.find({ phone: phoneRegex }),
            TeacherPayment.find({
                $or: [
                    { paymentNumber: phoneRegex },
                    { personalPhone: phoneRegex }
                ]
            }),
            Payment.find({
                $or: [
                    { tutorNumber: phoneRegex },
                    { paymentNumber: phoneRegex }
                ]
            }),
            RefundPayment.find({
                $or: [
                    { paymentNumber: phoneRegex },
                    { personalPhone: phoneRegex }
                ]
            })
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

        // Search across models
        const [
            tuitionApplies,
            tuitions,
            teacherPayments,
            taskDatas,
            refunds,
            payments,
            leads
        ] = await Promise.all([
            TuitionApply.find({ tuitionCode }),
            Tuition.find({ tuitionCode }),
            TeacherPayment.find({ tuitionCode }),
            TaskData.find({ tuitionCode }),
            RefundPayment.find({ tuitionCode }),
            Payment.find({ tuitionCode }),
            Lead.find({ tuitionCode })
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
