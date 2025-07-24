const express = require('express');
const TuitionApply = require('../models/TuitionApply');
const Payment = require('../models/Payment');
const router = express.Router();
const moment = require('moment-timezone');
const RegTeacher = require('../models/RegTeacher');
const Phone = require('../models/Phone');

router.get('/all', async (req, res) => {
    try {
        const allApply = await TuitionApply.find();
        res.json(allApply);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/getTableData', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 50;
    const { tuitionCode = '', phone = '', status } = req.query;

    const filter = {};

    if (tuitionCode) {
        filter.tuitionCode = new RegExp(escapeRegex(tuitionCode), 'i');
    }

    if (phone) {
        filter.phone = new RegExp(escapeRegex(phone), 'i');
    }

    if (status) {
        filter.status = status;
    }

    try {
        const paymentsWithDue = await Payment.find({
            duePayment: { $nin: [null, undefined, '', '0'] }
        }).select('tutorNumber paymentNumber');

        const dueTutorSet = new Set(paymentsWithDue.map(p => p.tutorNumber));
        const duePaymentSet = new Set(paymentsWithDue.map(p => p.paymentNumber));

        const total = await TuitionApply.countDocuments(filter);
        const applyList = await TuitionApply.find(filter)
            .sort({ appliedAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        const data = applyList.map(apply => {
            const hasDue = dueTutorSet.has(apply.number) || duePaymentSet.has(apply.number);
            return {
                ...apply.toObject(),
                hasDue
            };
        });

        res.json({
            data,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalRecords: total
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/summary', async (req, res) => {
    const { tuitionCode = '', phone = '', status } = req.query;

    const filter = {};

    if (tuitionCode) {
        filter.tuitionCode = new RegExp(escapeRegex(tuitionCode), 'i');
    }

    if (phone) {
        filter.phone = new RegExp(escapeRegex(phone), 'i');
    }

    if (status) {
        filter.status = status;
    }

    try {
        const records = await TuitionApply.find(filter).lean();

        const counts = {
            pending: 0,
            calledInterested: 0,
            calledNoResponse: 0,
            refertoBM: 0,
            shortlisted: 0,
            requestedForPayment: 0
        };

        records.forEach(tuition => {
            const stat = tuition.status?.toLowerCase();

            if (stat === 'pending') counts.pending++;
            else if (stat === 'called (interested)') counts.calledInterested++;
            else if (stat === 'called (no response)') counts.calledNoResponse++;
            else if (stat === 'refer to bm') counts.refertoBM++;
            else if (stat === 'shortlisted') counts.shortlisted++;
            else if (stat === 'requested for payment') counts.requestedForPayment++;
        });

        res.json({
            ...counts,
            total: records.length,
            data: records
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

/*
router.post('/add', async (req, res) => {
    const {
        premiumCode,
        tuitionCode,
        tuitionId,
        name,
        phone,
        institute,
        department,
        address,
        status,
        comment,
        commentForTeacher,
    } = req.body;

    try {
        const regTeacherExists = await RegTeacher.findOne({ premiumCode, phone }).lean();

        if (!regTeacherExists) {
            return res.status(404).json({ message: "No registered teacher found with provided premiumCode and phone" });
        }

        const localTime = moment().utcOffset(6 * 60).format("YYYY-MM-DD HH:mm:ss");

        const newApply = new TuitionApply({
            premiumCode,
            tuitionCode,
            tuitionId,
            name,
            phone,
            institute,
            department,
            address,
            comment,
            commentForTeacher,
            appliedAt: localTime,
            status: status || 'pending'
        });

        await newApply.save();
        res.status(201).json(newApply);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});
*/

const normalizePhone = (num) => {
    if (!num) return '';
    let digits = num.replace(/\D/g, '');
    if (digits.startsWith('880')) digits = digits.slice(3);
    while (digits.startsWith('0')) digits = digits.slice(1);
    return digits;
};

router.post('/add', async (req, res) => {
    const {
        premiumCode,
        tuitionCode,
        tuitionId,
        name,
        phone,
        institute,
        department,
        address,
        status,
        comment,
        commentForTeacher,
    } = req.body;

    try {
        const normalizedInputPhone = normalizePhone(phone);

        const phoneList = await Phone.find({ isActive: true });

        let isSpam = false;
        let isBest = false;

        for (const entry of phoneList) {
            const normalizedDbPhone = normalizePhone(entry.phone);

            if (normalizedDbPhone === normalizedInputPhone) {
                if (entry.isSpam) {
                    isSpam = true;
                } else {
                    isBest = true;
                }
                break;
            }
        }

        const localTime = moment().utcOffset(6 * 60).format("YYYY-MM-DD HH:mm:ss");

        const newApply = new TuitionApply({
            premiumCode,
            tuitionCode,
            tuitionId,
            name,
            phone,
            institute,
            department,
            address,
            comment,
            commentForTeacher,
            appliedAt: localTime,
            status: status || 'pending',
            isSpam,
            isBest,
        });

        await newApply.save();
        res.status(201).json(newApply);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/getTuitionStatuses', async (req, res) => {
    try {
        const summary = await TuitionApply.find({}, 'tuitionCode appliedAt status commentForTeacher phone');
        res.json(summary);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.put('/edit/:id', async (req, res) => {
    try {
        let updatePayload = { ...req.body };

        if (req.body.phone) {
            const normalizedInputPhone = normalizePhone(req.body.phone);
            const phoneList = await Phone.find({ isActive: true });

            let isSpam = false;
            let isBest = false;

            for (const entry of phoneList) {
                const normalizedDbPhone = normalizePhone(entry.phone);

                if (normalizedDbPhone === normalizedInputPhone) {
                    if (entry.isSpam) {
                        isSpam = true;
                    } else {
                        isBest = true;
                    }
                    break;
                }
            }

            updatePayload.isSpam = isSpam;
            updatePayload.isBest = isBest;
        }

        const updatedData = await TuitionApply.findByIdAndUpdate(
            req.params.id,
            updatePayload,
            { new: true }
        );

        res.json(updatedData);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.delete('/delete/:id', async (req, res) => {
    try {
        await TuitionApply.findByIdAndDelete(req.params.id);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;


