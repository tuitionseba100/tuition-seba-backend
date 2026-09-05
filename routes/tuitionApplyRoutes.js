const express = require('express');
const ExcelJS = require('exceljs');
const TuitionApply = require('../models/TuitionApply');
const Payment = require('../models/Payment');
const { logStatusChange } = require('../utils/statusLogger');
const router = express.Router();
const moment = require('moment-timezone');
const RegTeacher = require('../models/RegTeacher');
const Phone = require('../models/Phone');
const Tuition = require('../models/Tuition');

function escapeRegex(str) {
    if (typeof str !== 'string') {
        str = String(str ?? '');
    }
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getPhoneVariations(phone) {
    if (!phone) return [];
    const raw = phone.toString().trim();
    const cleanDigits = raw.replace(/\D/g, '');
    const variations = new Set([raw]);
    if (cleanDigits.length >= 10) {
        const last10 = cleanDigits.slice(-10);
        variations.add(last10);
        variations.add(`0${last10}`);
        variations.add(`880${last10}`);
        variations.add(`+880${last10}`);
        variations.add(`++880${last10}`);
    }
    return Array.from(variations);
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
        const [total, applyList] = await Promise.all([
            TuitionApply.countDocuments(filter),
            TuitionApply.find(filter)
                .sort({ appliedAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean()
        ]);

        const pagePhones = [...new Set(applyList.flatMap(a => getPhoneVariations(a.phone)))];
        const tuitionCodes = [...new Set(applyList.map(a => a.tuitionCode).filter(Boolean))];

        const [paymentsWithDue, tuitions] = await Promise.all([
            pagePhones.length > 0
                ? Payment.find({
                    duePayment: { $nin: [null, undefined, '', '0'] },
                    $or: [
                        { tutorNumber: { $in: pagePhones } },
                        { paymentNumber: { $in: pagePhones } }
                    ]
                }).select('tutorNumber paymentNumber').lean()
                : [],
            tuitionCodes.length > 0
                ? Tuition.find({ tuitionCode: { $in: tuitionCodes } })
                    .select('tuitionCode status')
                    .lean()
                : []
        ]);

        const dueNormalizedSet = new Set(
            paymentsWithDue.flatMap(p => {
                const tDigits = (p.tutorNumber || '').toString().replace(/\D/g, '');
                const pDigits = (p.paymentNumber || '').toString().replace(/\D/g, '');
                const res = [];
                if (tDigits.length >= 10) res.push(tDigits.slice(-10));
                if (pDigits.length >= 10) res.push(pDigits.slice(-10));
                return res;
            })
        );

        const tuitionStatusMap = new Map();
        tuitions.forEach(t => {
            if (t.tuitionCode) {
                tuitionStatusMap.set(t.tuitionCode.toString(), t.status);
            }
        });

        const data = applyList.map(apply => {
            const applyDigits = (apply.phone || '').toString().replace(/\D/g, '');
            const last10 = applyDigits.length >= 10 ? applyDigits.slice(-10) : '';
            const hasDue = last10 ? dueNormalizedSet.has(last10) : false;
            return {
                ...apply,
                hasDue,
                tuitionStatus: apply.tuitionCode ? (tuitionStatusMap.get(apply.tuitionCode.toString()) || '') : ''
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
        const countsAggregation = await TuitionApply.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        const counts = {
            pending: 0,
            calledInterested: 0,
            calledNoResponse: 0,
            selected: 0,
            shortlisted: 0,
            requestedForPayment: 0
        };

        countsAggregation.forEach(item => {
            const stat = item._id?.toLowerCase();
            if (stat === 'pending') counts.pending = item.count;
            else if (stat === 'called (interested)') counts.calledInterested = item.count;
            else if (stat === 'called (no response)') counts.calledNoResponse = item.count;
            else if (stat === 'selected') counts.selected = item.count;
            else if (stat === 'shortlisted') counts.shortlisted = item.count;
            else if (stat === 'requested for payment') counts.requestedForPayment = item.count;
        });

        const total = await TuitionApply.countDocuments(filter);

        res.json({
            ...counts,
            total
        });
    } catch (err) {
        console.error(err);
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

function normalizePhoneForSave(phone) {
    let digits = phone.replace(/\D/g, '');

    if (digits.startsWith('880')) {
        digits = digits.slice(3);
    } else if (digits.startsWith('0')) {
        // do nothing
    } else if (digits.startsWith('8')) {
        digits = '0' + digits;
    }

    if (digits.length === 10 && !digits.startsWith('0')) {
        digits = '0' + digits;
    }

    return digits;
}

router.post('/add', async (req, res) => {
    const {
        premiumCode,
        tuitionCode,
        tuitionId,
        name,
        phone,
        institute,
        department,
        academicYear,
        address,
        status,
        comment,
        commentForTeacher,
        agentComment,
        regTeacherStatus,
    } = req.body;

    try {
        const normalizedInputPhone = normalizePhone(phone);

        const phoneList = await Phone.find({ isActive: true });

        let isSpam = false;
        let isBest = false;
        let isExpress = false;

        for (const entry of phoneList) {
            const normalizedDbPhone = normalizePhone(entry.phone);

            if (normalizedDbPhone === normalizedInputPhone) {
                if (entry.isSpam) {
                    isSpam = true;
                } else if (entry.isExpress) {
                    isExpress = true;
                } else if (entry.isBest) {
                    isBest = true;
                }
                break;
            }
        }

        const normalizedInputPhoneForSave = normalizePhoneForSave(phone);
        const localTime = moment().utcOffset(6 * 60).format("YYYY-MM-DD HH:mm:ss");


        // Fetch tuition status for automated feedback
        let autoStatus = status || 'pending';
        let autoCommentForTeacher = commentForTeacher;

        try {
            const tuition = await Tuition.findById(tuitionId);
            if (tuition) {
                const normalizedTuitionStatus = tuition.status?.toLowerCase();

                if (normalizedTuitionStatus === 'confirm' || normalizedTuitionStatus === 'cancel' || normalizedTuitionStatus === 'suspended') {
                    autoStatus = 'cancelled';
                    if (normalizedTuitionStatus === 'cancel') {
                        autoCommentForTeacher = 'টিউশনটি ক্যান্সেল করা হয়েছে, আমাদের এভেইলবল অন্য টিউশনগুলোতে এপ্লাই করুন।';
                    } else if (normalizedTuitionStatus === 'confirm') {
                        autoCommentForTeacher = 'আলহামদুলিল্লাহ, আমাদের একজন টিচার কনফার্ম হয়েছে। আমাদের এভেইলেবল টিউশনগুলো এপ্লাই করুন।';
                    } else { // suspended
                        autoCommentForTeacher = 'টিউশনটি সাসপেন্ড করা হয়েছে, আমাদের এভেইলবল অন্য টিউশনগুলোতে এপ্লাই করুন।';
                    }
                } else if (['demo class running', '1st demo class', '2nd demo class', 'given number', 'guardian meet'].includes(normalizedTuitionStatus)) {
                    autoStatus = 'shortlisted';
                    if (normalizedTuitionStatus === 'given number') {
                        autoCommentForTeacher = 'টিউশনটির নাম্বার আমাদের একজন টিচারকে দেয়া হয়েছে। কোনো কারণে ওনার ক্যান্সেল হলে আমরা যোগাযোগ করবো আপনার সাথে। অন্য টিউশনগুলো এপ্লাই করুন।';
                    } else if (['demo class running', '1st demo class', '2nd demo class'].includes(normalizedTuitionStatus)) {
                        autoCommentForTeacher = 'আমাদের একজন টিচার ডেমো ক্লাস নিচ্ছে। কোনো কারণে ওনার ক্যান্সেল হলে আমরা যোগাযোগ করবো আপনার সাথে। অন্য টিউশনগুলো এপ্লাই করুন।';
                    } else { // guardian meet
                        autoCommentForTeacher = 'আমাদের একজন টিচার দেখা করতে যাবেন। কোনো কারণে ওনার ক্যান্সেল হলে আমরা যোগাযোগ করবো আপনার সাথে। অন্য টিউশনগুলো এপ্লাই করুন।';
                    }
                } else {
                    autoStatus = 'pending';
                    autoCommentForTeacher = 'টিউশনটি এভেইলেবল আছে। আপনার সিভি অভিভাবক এর কাছে পাঠানো হবে। অভিভাবক আপনার সিভি পছন্দ করলে আমরা দ্রুত সময়ের মধ্যে যোগাযোগ করবো। আমাদের অন্যান্য এভেইলেবল টিউশনগুলো দেখুন পছন্দ হলে এপ্লাই করুন।';
                }
            }
        } catch (tErr) {
            console.error('Error fetching tuition for auto feedback:', tErr);
        }

        // Check for duplicate application
        const existingApply = await TuitionApply.findOne({
            tuitionId,
            $or: [{ phone: normalizedInputPhoneForSave }, { premiumCode: premiumCode }]
        });

        if (existingApply) {
            return res.status(400).json({
                message: 'আপনি এই টিউশনটিতে ইতিমধ্যে আবেদন করেছেন। অনুগ্রহ করে অন্য টিউশনগুলো দেখুন।'
            });
        }

        let finalRegTeacherStatus = regTeacherStatus;
        if (!finalRegTeacherStatus && premiumCode) {
            const t = await RegTeacher.findOne({ premiumCode }).lean();
            if (t) {
                finalRegTeacherStatus = t.status;
            }
        }

        const newApply = new TuitionApply({
            premiumCode,
            tuitionCode,
            tuitionId,
            name,
            phone: normalizedInputPhoneForSave,
            institute,
            department,
            academicYear,
            address,
            comment,
            commentForTeacher: autoCommentForTeacher,
            appliedAt: localTime,
            status: autoStatus,
            isSpam,
            isBest,
            isExpress,
            agentComment,
            isAppApply: true,
            regTeacherStatus: finalRegTeacherStatus || ''
        });

        await newApply.save();
        res.status(201).json(newApply);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/add-web', async (req, res) => {
    const {
        premiumCode,
        tuitionCode,
        tuitionId,
        name,
        phone,
        institute,
        department,
        academicYear,
        address,
        status,
        comment,
        commentForTeacher,
        agentComment,
        regTeacherStatus,
    } = req.body;

    try {
        const normalizedInputPhone = normalizePhone(phone);

        const phoneList = await Phone.find({ isActive: true });

        let isSpam = false;
        let isBest = false;
        let isExpress = false;

        for (const entry of phoneList) {
            const normalizedDbPhone = normalizePhone(entry.phone);

            if (normalizedDbPhone === normalizedInputPhone) {
                if (entry.isSpam) {
                    isSpam = true;
                } else if (entry.isExpress) {
                    isExpress = true;
                } else if (entry.isBest) {
                    isBest = true;
                }
                break;
            }
        }

        const normalizedInputPhoneForSave = normalizePhoneForSave(phone);
        const localTime = moment().utcOffset(6 * 60).format("YYYY-MM-DD HH:mm:ss");

        // Check for duplicate application
        const existingApply = await TuitionApply.findOne({
            tuitionId,
            $or: [{ phone: normalizedInputPhoneForSave }, { premiumCode: premiumCode }]
        });

        if (existingApply) {
            return res.status(400).json({
                message: 'আপনি এই টিউশনটিতে ইতিমধ্যে আবেদন করেছেন। অনুগ্রহ করে অন্য টিউশনগুলো দেখুন।'
            });
        }

        // Fetch tuition status for automated feedback
        let autoStatus = status || 'pending';
        let autoCommentForTeacher = commentForTeacher;

        try {
            const tuition = await Tuition.findById(tuitionId);
            if (tuition) {
                const normalizedTuitionStatus = tuition.status?.toLowerCase();

                if (normalizedTuitionStatus === 'confirm' || normalizedTuitionStatus === 'cancel' || normalizedTuitionStatus === 'suspended') {
                    autoStatus = 'cancelled';
                    if (normalizedTuitionStatus === 'cancel') {
                        autoCommentForTeacher = 'টিউশনটি ক্যান্সেল করা হয়েছে, আমাদের এভেইলবল অন্য টিউশনগুলোতে এপ্লাই করুন।';
                    } else if (normalizedTuitionStatus === 'confirm') {
                        autoCommentForTeacher = 'আলহামদুলিল্লাহ, আমাদের একজন টিচার কনফার্ম হয়েছে। আমাদের এভেইলেবল টিউশনগুলো এপ্লাই করুন।';
                    } else { // suspended
                        autoCommentForTeacher = 'টিউশনটি সাসপেন্ড করা হয়েছে, আমাদের এভেইলবল অন্য টিউশনগুলোতে এপ্লাই করুন।';
                    }
                } else if (['demo class running', '1st demo class', '2nd demo class', 'given number', 'guardian meet'].includes(normalizedTuitionStatus)) {
                    autoStatus = 'shortlisted';
                    if (normalizedTuitionStatus === 'given number') {
                        autoCommentForTeacher = 'টিউশনটির নাম্বার আমাদের একজন টিচারকে দেয়া হয়েছে। কোনো কারণে ওনার ক্যান্সেল হলে আমরা যোগাযোগ করবো আপনার সাথে। অন্য টিউশনগুলো এপ্লাই করুন।';
                    } else if (['demo class running', '1st demo class', '2nd demo class'].includes(normalizedTuitionStatus)) {
                        autoCommentForTeacher = 'আমাদের একজন টিচার ডেমো ক্লাস নিচ্ছে। কোনো কারণে ওনার ক্যান্সেল হলে আমরা যোগাযোগ করবো আপনার সাথে। অন্য টিউশনগুলো এপ্লাই করুন।';
                    } else { // guardian meet
                        autoCommentForTeacher = 'আমাদের একজন টিচার দেখা করতে যাবেন। কোনো কারণে ওনার ক্যান্সেল হলে আমরা যোগাযোগ করবো আপনার সাথে। অন্য টিউশনগুলো এপ্লাই করুন।';
                    }
                } else {
                    autoStatus = 'pending';
                    autoCommentForTeacher = 'টিউশনটি এভেইলেবল আছে। আপনার সিভি অভিভাবক এর কাছে পাঠানো হবে। অভিভাবক আপনার সিভি পছন্দ করলে আমরা দ্রুত সময়ের মধ্যে যোগাযোগ করবো। আমাদের অন্যান্য এভেইলেবল টিউশনগুলো দেখুন পছন্দ হলে এপ্লাই করুন।';
                }
            }
        } catch (tErr) {
            console.error('Error fetching tuition for auto feedback:', tErr);
        }

        let finalRegTeacherStatus = regTeacherStatus;
        if (!finalRegTeacherStatus && premiumCode) {
            const t = await RegTeacher.findOne({ premiumCode }).lean();
            if (t) {
                finalRegTeacherStatus = t.status;
            }
        }

        const newApply = new TuitionApply({
            premiumCode,
            tuitionCode,
            tuitionId,
            name,
            phone: normalizedInputPhoneForSave,
            institute,
            department,
            academicYear,
            address,
            comment,
            commentForTeacher: autoCommentForTeacher,
            appliedAt: localTime,
            status: autoStatus,
            isSpam,
            isBest,
            isExpress,
            agentComment,
            isAppApply: false,
            regTeacherStatus: finalRegTeacherStatus || ''
        });

        await newApply.save();
        res.status(201).json(newApply);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/appliedListByTuitionId', async (req, res) => {
    const { tuitionId } = req.query;

    if (!tuitionId) {
        return res.status(400).json({ message: 'tuitionId query parameter is required' });
    }
    try {
        const appliedList = await TuitionApply.find(
            { tuitionId },
            'premiumCode name phone academicYear institute department address appliedAt status isSpam isBest isExpress isAppApply comment updatedBy agentComment commentForTeacher regTeacherStatus'
        ).sort({ appliedAt: -1 }).lean();

        const modalPhones = [...new Set(appliedList.flatMap(a => getPhoneVariations(a.phone)))];
        const paymentsWithDue = modalPhones.length > 0
            ? await Payment.find({
                duePayment: { $nin: [null, undefined, '', '0'] },
                $or: [
                    { tutorNumber: { $in: modalPhones } },
                    { paymentNumber: { $in: modalPhones } }
                ]
            }).select('tutorNumber paymentNumber').lean()
            : [];

        const dueNormalizedSet = new Set(
            paymentsWithDue.flatMap(p => {
                const tDigits = (p.tutorNumber || '').toString().replace(/\D/g, '');
                const pDigits = (p.paymentNumber || '').toString().replace(/\D/g, '');
                const res = [];
                if (tDigits.length >= 10) res.push(tDigits.slice(-10));
                if (pDigits.length >= 10) res.push(pDigits.slice(-10));
                return res;
            })
        );

        const data = appliedList.map(apply => {
            const applyDigits = (apply.phone || '').toString().replace(/\D/g, '');
            const last10 = applyDigits.length >= 10 ? applyDigits.slice(-10) : '';
            const hasDue = last10 ? dueNormalizedSet.has(last10) : false;
            return {
                ...apply,
                hasDue
            };
        });

        res.json(data);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/getTuitionStatuses', async (req, res) => {
    try {
        const summary = await TuitionApply.find({}, 'tuitionCode appliedAt status commentForTeacher phone')
            .sort({ appliedAt: -1 })
            .limit(500)
            .lean(); // Limit added to prevent OOM
        res.json(summary);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/getTuitionStatusesByPhone', async (req, res) => {
    try {
        const phone = req.query.phone;
        if (!phone) {
            return res.status(400).json({ message: 'Phone number is required' });
        }

        const normalizedPhone = normalizePhoneForSave(phone);

        // Filter for latest 2 months (60 days)
        const twoMonthsAgo = new Date();
        twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 60);

        const matchedTuitions = await TuitionApply.find(
            { 
                phone: normalizedPhone,
                appliedAt: { $gte: twoMonthsAgo }
            },
            '_id tuitionCode appliedAt status commentForTeacher phone'
        ).sort({ appliedAt: -1 }).lean();

        if (matchedTuitions.length === 0) {
            return res.status(404).json({ message: 'গত ২ মাসে এই নম্বরে কোনো আবেদন পাওয়া যায়নি' });
        }

        const enhancedTuitions = await Promise.all(matchedTuitions.map(async (apply) => {
            const allApplies = await TuitionApply.find({ tuitionCode: apply.tuitionCode }, '_id phone')
                .sort({ _id: 1 })
                .lean();

            const tuition = await Tuition.findOne({ tuitionCode: apply.tuitionCode }, 'guardianDemandForPublic status tuitionCancelReasonPublic').lean();

            const serialNumber = allApplies.findIndex(a => a._id.toString() === apply._id.toString()) + 1;
            return {
                ...apply,
                serialNumber: serialNumber > 0 ? serialNumber : 1,
                totalApplies: allApplies.length,
                guardianDemandForPublic: tuition ? (tuition.guardianDemandForPublic || '') : '',
                tuitionStatus: tuition ? (tuition.status || '') : '',
                tuitionCancelReasonPublic: tuition ? (tuition.tuitionCancelReasonPublic || '') : ''
            };
        }));

        // Sort latest first (most recent appliedAt first) before sending response
        enhancedTuitions.sort((a, b) => new Date(b.appliedAt || 0) - new Date(a.appliedAt || 0));

        res.json(enhancedTuitions);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

//get by code
router.get('/byPremiumCode', async (req, res) => {
    try {
        const { premiumCode } = req.query;

        if (!premiumCode) {
            return res.status(400).json({ message: 'Premium code is required' });
        }

        const paymentsWithDue = await Payment.find({
            duePayment: { $nin: [null, undefined, '', '0'] }
        }).select('tutorNumber paymentNumber').lean();

        const dueTutorSet = new Set(
            paymentsWithDue.map(p => escapeRegex(p.tutorNumber))
        );
        const duePaymentSet = new Set(
            paymentsWithDue.map(p => escapeRegex(p.paymentNumber))
        );

        const tuitionApplies = await TuitionApply.find(
            { premiumCode },
            'premiumCode tuitionCode name phone status appliedAt commentForTeacher isAppApply isSpam isBest isExpress regTeacherStatus'
        ).sort({ appliedAt: -1 }).lean();

        if (tuitionApplies.length === 0) {
            return res.status(404).json({ message: 'No applications found for this premium code' });
        }

        const data = tuitionApplies.map(apply => {
            const escapedPhone = escapeRegex(apply.phone);
            const hasDue = dueTutorSet.has(escapedPhone) || duePaymentSet.has(escapedPhone);
            return {
                ...apply,
                hasDue
            };
        });

        res.json(data);
    } catch (err) {
        console.error('Error fetching tuition applies by premium code:', err);
        res.status(500).json({ message: err.message });
    }
});


router.put('/edit/:id', async (req, res) => {
    try {
        const oldApply = await TuitionApply.findById(req.params.id);
        if (!oldApply) {
            return res.status(404).json({ message: 'Record not found' });
        }

        let updatePayload = { ...req.body };

        if (req.body.phone) {
            const normalizedInputPhone = normalizePhone(req.body.phone);
            const phoneList = await Phone.find({ isActive: true });

            let isSpam = false;
            let isBest = false;
            let isExpress = false;

            for (const entry of phoneList) {
                const normalizedDbPhone = normalizePhone(entry.phone);

                if (normalizedDbPhone === normalizedInputPhone) {
                    if (entry.isSpam) {
                        isSpam = true;
                    } else if (entry.isExpress) {
                        isExpress = true;
                    } else if (entry.isBest) {
                        isBest = true;
                    }
                    break;
                }
            }

            updatePayload.isSpam = isSpam;
            updatePayload.isBest = isBest;
            updatePayload.isExpress = isExpress;
        }

        const updatedData = await TuitionApply.findByIdAndUpdate(
            req.params.id,
            updatePayload,
            { new: true }
        );

        if (updatedData && req.body.status && oldApply.status !== req.body.status) {
            await logStatusChange(req, 'TuitionApply', updatedData._id, oldApply.status, req.body.status, updatedData.tuitionCode || null);
        }

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

router.get('/exportData', async (req, res) => {
    try {
        const { status } = req.query;

        // Build filter based on status
        const filter = {};
        if (status && status !== 'all') {
            filter.status = status;
        }

        // Set headers for CSV download
        res.setHeader('Content-Type', 'text/csv');

        const fileName =
            status && status !== 'all'
                ? `tuition_apply_${status.replace(/\s+/g, '_').toLowerCase()}.csv`
                : 'tuition_apply_all.csv';

        res.setHeader(
            'Content-Disposition',
            `attachment; filename=${fileName}`
        );

        // CSV header
        const header =
            'Tuition Code,Tuition ID,Premium Code,Reg Teacher Status,Name,Phone,Institute,Academic Year,Department,Address,Status,Applied At,Comment,Comment For Teacher,Is Spam,Is Best,Is Express\n';

        res.write(header);

        const batchSize = 1000;
        let skip = 0;

        const escapeCsvField = (field) => {
            if (field === null || field === undefined) return '';
            field = String(field);
            if (
                field.includes(',') ||
                field.includes('"') ||
                field.includes('\n') ||
                field.includes('\r')
            ) {
                return `"${field.replace(/"/g, '""')}"`;
            }
            return field;
        };

        while (true) {
            const batch = await TuitionApply.find(filter)
                .skip(skip)
                .limit(batchSize)
                .lean();

            if (batch.length === 0) break;

            for (const doc of batch) {
                const row = [
                    escapeCsvField(doc.tuitionCode),
                    escapeCsvField(doc.tuitionId),
                    escapeCsvField(doc.premiumCode),
                    escapeCsvField(doc.regTeacherStatus || ''),
                    escapeCsvField(doc.name),
                    escapeCsvField(doc.phone),
                    escapeCsvField(doc.institute),
                    escapeCsvField(doc.academicYear),
                    escapeCsvField(doc.department),
                    escapeCsvField(doc.address),
                    escapeCsvField(doc.status),
                    escapeCsvField(
                        doc.appliedAt
                            ? doc.appliedAt.toISOString().replace('T', ' ').slice(0, 19)
                            : ''
                    ),
                    escapeCsvField(doc.comment),
                    escapeCsvField(doc.commentForTeacher),
                    escapeCsvField(doc.isSpam ? 'Yes' : 'No'),
                    escapeCsvField(doc.isBest ? 'Yes' : 'No'),
                    escapeCsvField(doc.isExpress ? 'Yes' : 'No')
                ].join(',') + '\n';

                res.write(row);
            }

            skip += batchSize;
        }

        res.end();

    } catch (err) {
        console.error('Export failed:', err);
        res.status(500).json({ message: 'Export failed' });
    }
});


router.get('/exportAll', async (req, res) => {
    try {
        // Set headers for CSV download
        res.setHeader(
            'Content-Type',
            'text/csv'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename=tuition_apply_all.csv'
        );

        // Write CSV header
        const header = 'Tuition Code,Tuition ID,Premium Code,Reg Teacher Status,Name,Phone,Institute,Academic Year,Department,Address,Status,Applied At,Comment,Comment For Teacher,Is Spam,Is Best,Is Express\n';
        res.write(header);

        // Process documents in batches to avoid memory issues
        const batchSize = 1000; // Process 1000 records at a time
        let skip = 0;

        while (true) {
            const batch = await TuitionApply.find().skip(skip).limit(batchSize).lean();

            if (batch.length === 0) {
                break; // No more records
            }

            // Process each document in the batch
            for (const doc of batch) {
                // Escape CSV fields that might contain commas, quotes, or newlines
                const escapeCsvField = (field) => {
                    if (field === null || field === undefined) return '';
                    field = String(field);
                    if (field.includes(',') || field.includes('"') || field.includes('\n') || field.includes('\r')) {
                        return '"' + field.replace(/"/g, '""') + '"';
                    }
                    return field;
                };

                const row = [
                    escapeCsvField(doc.tuitionCode || ''),
                    escapeCsvField(doc.tuitionId || ''),
                    escapeCsvField(doc.premiumCode || ''),
                    escapeCsvField(doc.regTeacherStatus || ''),
                    escapeCsvField(doc.name || ''),
                    escapeCsvField(doc.phone || ''),
                    escapeCsvField(doc.institute || ''),
                    escapeCsvField(doc.academicYear || ''),
                    escapeCsvField(doc.department || ''),
                    escapeCsvField(doc.address || ''),
                    escapeCsvField(doc.status || ''),
                    escapeCsvField(doc.appliedAt
                        ? doc.appliedAt.toISOString().replace('T', ' ').slice(0, 19)
                        : ''),
                    escapeCsvField(doc.comment || ''),
                    escapeCsvField(doc.commentForTeacher || ''),
                    escapeCsvField(doc.isSpam ? 'Yes' : 'No'),
                    escapeCsvField(doc.isBest ? 'Yes' : 'No'),
                    escapeCsvField(doc.isExpress ? 'Yes' : 'No')
                ].join(',') + '\n';

                res.write(row);
            }

            skip += batchSize;
        }

        // End the response
        res.end();

    } catch (err) {
        console.error('Export failed:', err);
        res.status(500).json({ message: 'Export failed' });
    }
});

router.get('/get-auto-comment/:tuitionId', async (req, res) => {
    try {
        const tuition = await Tuition.findById(req.params.tuitionId);
        let autoStatus = 'pending';
        let autoCommentForTeacher = 'টিউশনটি এভেইলেবল আছে। আপনার সিভি অভিভাবক এর কাছে পাঠানো হবে। অভিভাবক আপনার সিভি পছন্দ করলে আমরা দ্রুত সময়ের মধ্যে যোগাযোগ করবো। আমাদের অন্যান্য এভেইলেবল টিউশনগুলো দেখুন পছন্দ হলে এপ্লাই করুন।';

        if (tuition) {
            const normalizedTuitionStatus = tuition.status?.toLowerCase();

            if (normalizedTuitionStatus === 'confirm' || normalizedTuitionStatus === 'cancel' || normalizedTuitionStatus === 'suspended') {
                autoStatus = 'cancelled';
                if (normalizedTuitionStatus === 'cancel') {
                    autoCommentForTeacher = 'টিউশনটি ক্যান্সেল করা হয়েছে, আমাদের এভেইলবল অন্য টিউশনগুলোতে এপ্লাই করুন।';
                } else if (normalizedTuitionStatus === 'confirm') {
                    autoCommentForTeacher = 'আলহামদুলিল্লাহ, আমাদের একজন টিচার কনফার্ম হয়েছে। আমাদের এভেইলেবল টিউশনগুলো এপ্লাই করুন।';
                } else { // suspended
                    autoCommentForTeacher = 'টিউশনটি সাসপেন্ড করা হয়েছে, আমাদের এভেইলবল অন্য টিউশনগুলোতে এপ্লাই করুন।';
                }
            } else if (['demo class running', '1st demo class', '2nd demo class', 'given number', 'guardian meet'].includes(normalizedTuitionStatus)) {
                autoStatus = 'shortlisted';
                if (normalizedTuitionStatus === 'given number') {
                    autoCommentForTeacher = 'টিউশনটির নাম্বার আমাদের একজন টিচারকে দেয়া হয়েছে। কোনো কারণে ওনার ক্যান্সেল হলে আমরা যোগাযোগ করবো আপনার সাথে। অন্য টিউশনগুলো এপ্লাই করুন।';
                } else if (['demo class running', '1st demo class', '2nd demo class'].includes(normalizedTuitionStatus)) {
                    autoCommentForTeacher = 'আমাদের একজন টিচার ডেমো ক্লাস নিচ্ছে। কোনো কারণে ওনার ক্যান্সেল হলে আমরা যোগাযোগ করবো আপনার সাথে। অন্য টিউশনগুলো এপ্লাই করুন।';
                } else { // guardian meet
                    autoCommentForTeacher = 'আমাদের একজন টিচার দেখা করতে যাবেন। কোনো কারণে ওনার ক্যান্সেল হলে আমরা যোগাযোগ করবো আপনার সাথে। অন্য টিউশনগুলো এপ্লাই করুন।';
                }
            } else {
                autoStatus = 'pending';
                autoCommentForTeacher = 'টিউশনটি এভেইলেবল আছে। আপনার সিভি অভিভাবক এর কাছে পাঠানো হবে। অভিভাবক আপনার সিভি পছন্দ করলে আমরা দ্রুত সময়ের মধ্যে যোগাযোগ করবো। আমাদের অন্যান্য এভেইলেবল টিউশনগুলো দেখুন পছন্দ হলে এপ্লাই করুন।';
            }
        }
        res.json({ comment: autoCommentForTeacher, status: autoStatus });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


module.exports = router;

