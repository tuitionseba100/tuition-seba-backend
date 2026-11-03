const express = require('express');
const RegTeacher = require('../models/RegTeacher');
const { logStatusChange } = require('../utils/statusLogger');
const router = express.Router();
const moment = require('moment-timezone');
const path = require('path');
const { deleteFromR2 } = require('../utils/r2Storage');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { authMiddleware } = require('../middleware/auth');

// Must match the secret in chatRoutes.js
const CHAT_TOKEN_SECRET = process.env.CHAT_TOKEN_SECRET || 'tsf-chat-hmac-secret-2025';
const generateChatToken = (phone) =>
    crypto.createHmac('sha256', CHAT_TOKEN_SECRET).update(phone).digest('hex');

// Protects against brute-force enumeration of premiumCode + phone combos.
const checkApplyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    skip: (req) => !!req.headers.authorization,
    skipSuccessfulRequests: false,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many verification attempts. Please try again after 15 minutes.' }
});


router.get('/byPremiumCode/:premiumCode', authMiddleware, async (req, res) => {
    try {
        const { premiumCode } = req.params;
        if (!premiumCode) {
            return res.status(400).json({ message: 'Premium code is required' });
        }
        const teacher = await RegTeacher.findOne({
            premiumCode: new RegExp(`^${escapeRegex(premiumCode.trim())}$`, 'i')
        }).lean();
        if (!teacher) {
            return res.status(404).json({ message: 'Teacher not found' });
        }
        res.json(teacher);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/search-teachers', authMiddleware, async (req, res) => {
    try {
        const q = (req.query.q || '').toString().trim();
        if (!q) {
            const topTeachers = await RegTeacher.find(
                { premiumCode: { $exists: true, $ne: null, $ne: '' } },
                'premiumCode name phone whatsapp alternativePhone'
            ).sort({ _id: -1 }).limit(15).lean();
            return res.json(topTeachers);
        }

        const cleanDigits = q.replace(/\D/g, '');
        const orConditions = [
            { premiumCode: new RegExp(escapeRegex(q), 'i') },
            { name: new RegExp(escapeRegex(q), 'i') }
        ];

        if (cleanDigits.length >= 4) {
            const lastDigits = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits;
            // Match digits even if DB contains dashes, spaces or other formatting
            const flexiblePhonePattern = lastDigits.split('').map(d => escapeRegex(d)).join('\\D*');
            const phoneRegex = new RegExp(flexiblePhonePattern);
            orConditions.push({ phone: phoneRegex });
            orConditions.push({ whatsapp: phoneRegex });
            orConditions.push({ alternativePhone: phoneRegex });
        }

        const teachers = await RegTeacher.find(
            { $or: orConditions },
            'premiumCode name phone whatsapp alternativePhone'
        ).limit(20).lean();

        res.json(teachers);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/public-teachers', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        const filter = {
            premiumCode: { $exists: true, $ne: null, $ne: '' },
            status: { $ne: 'suspended' }
        };

        if (req.query.gender) {
            filter.gender = { $regex: new RegExp(`^${escapeRegex(req.query.gender)}$`, 'i') };
        }

        if (req.query.area) {
            filter.currentArea = { $regex: new RegExp(escapeRegex(req.query.area), 'i') };
        }

        if (req.query.subject) {
            filter.favoriteSubject = { $regex: new RegExp(escapeRegex(req.query.subject), 'i') };
        }

        if (req.query.university) {
            const uniRegex = { $regex: new RegExp(escapeRegex(req.query.university), 'i') };
            filter.$or = [
                { honorsUniversity: uniRegex },
                { mastersUniversity: uniRegex },
                { uniCode: uniRegex }
            ];
        }

        if (req.query.searchTerm) {
            const searchRegex = { $regex: new RegExp(escapeRegex(req.query.searchTerm), 'i') };
            const searchConditions = [
                { name: searchRegex },
                { premiumCode: searchRegex },
                { uniCode: searchRegex },
                { currentArea: searchRegex },
                { favoriteSubject: searchRegex },
                { honorsDept: searchRegex },
                { mastersDept: searchRegex }
            ];
            if (filter.$or) {
                filter.$and = [
                    { $or: filter.$or },
                    { $or: searchConditions }
                ];
                delete filter.$or;
            } else {
                filter.$or = searchConditions;
            }
        }

        const total = await RegTeacher.countDocuments(filter);
        const teachers = await RegTeacher.find(filter)
            .select(
                'name gender currentArea academicYear mastersDept mastersUniversity honorsDept honorsUniversity premiumCode uniCode isResultShow sscResult hscResult experience favoriteSubject hscGroup sscGroup school college'
            )
            .sort({ rating: -1, _id: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        res.json({
            teachers,
            totalPages: Math.ceil(total / limit),
            totalTeachers: total
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Helper to construct uniform teacher filters for /getTableData and /summary
function buildTeacherFilter(query) {
    const {
        premiumCode = '',
        phone = '',
        status,
        gender,
        name,
        currentArea,
        uniCode,
        department,
        referStatus,
        referPersonPhone = '',
        isInfoVerified,
        city,
        division,
        district,
        thana,
        pourosova_union_ward
    } = query;

    const filter = {};
    const andConditions = [];

    if (isInfoVerified !== undefined && isInfoVerified !== '') {
        const isVerified = isInfoVerified === 'true' || isInfoVerified === true;
        filter.isInfoVerified = isVerified ? true : { $ne: true };
    }

    if (premiumCode && premiumCode.trim()) {
        filter.premiumCode = new RegExp(escapeRegex(premiumCode.trim()), 'i');
    }

    if (phone && phone.trim()) {
        const pRegex = new RegExp(escapeRegex(phone.trim()), 'i');
        andConditions.push({
            $or: [
                { phone: pRegex },
                { alternativePhone: pRegex },
                { whatsapp: pRegex }
            ]
        });
    }

    if (department && department.trim()) {
        const deptRegex = new RegExp(escapeRegex(department.trim()), 'i');
        andConditions.push({
            $or: [
                { department: deptRegex },
                { mastersDept: deptRegex },
                { honorsDept: deptRegex }
            ]
        });
    }

    // City / Division filter
    const targetDivision = (division || city || '').trim();
    if (targetDivision) {
        let divPattern = escapeRegex(targetDivision);
        if (/^(chittagong|chattogram)$/i.test(targetDivision)) {
            divPattern = '(?:chittagong|chattogram)';
        }
        const divRegex = new RegExp('^' + divPattern + '$', 'i');
        andConditions.push({
            $or: [
                { division: divRegex },
                { city: divRegex }
            ]
        });
    }

    // District filter
    if (district && district.trim()) {
        const distRegex = new RegExp('^' + escapeRegex(district.trim()) + '$', 'i');
        andConditions.push({
            $or: [
                { district: distRegex },
                { city: distRegex }
            ]
        });
    }

    // Thana filter
    if (thana && thana.trim()) {
        const thanaRegex = new RegExp('^' + escapeRegex(thana.trim()) + '$', 'i');
        andConditions.push({
            $or: [
                { thana: thanaRegex },
                { currentArea: new RegExp(escapeRegex(thana.trim()), 'i') }
            ]
        });
    }

    // Pourosova / Union / Ward filter
    if (pourosova_union_ward && pourosova_union_ward.trim()) {
        const unitRegex = new RegExp('^' + escapeRegex(pourosova_union_ward.trim()) + '$', 'i');
        andConditions.push({
            $or: [
                { pourosova_union_ward: unitRegex },
                { currentArea: new RegExp(escapeRegex(pourosova_union_ward.trim()), 'i') }
            ]
        });
    }

    if (status && status.trim()) {
        filter.status = status.trim();
    }

    if (gender && gender.trim()) {
        filter.gender = gender.trim();
    }

    if (name && name.trim()) {
        filter.name = new RegExp(escapeRegex(name.trim()), 'i');
    }

    if (currentArea && currentArea.trim()) {
        filter.currentArea = new RegExp(escapeRegex(currentArea.trim()), 'i');
    }

    if (uniCode) {
        if (uniCode === 'Not Assigned') {
            filter.uniCode = { $in: [null, ''] };
        } else if (uniCode.trim()) {
            filter.uniCode = new RegExp(escapeRegex(uniCode.trim()), 'i');
        }
    }

    if (referStatus && referStatus.trim()) {
        filter.referStatus = referStatus.trim();
    }

    if (referPersonPhone && referPersonPhone.trim()) {
        filter.referPersonPhone = new RegExp(escapeRegex(referPersonPhone.trim()), 'i');
    }

    if (andConditions.length > 0) {
        filter.$and = andConditions;
    }

    return filter;
}

router.get('/getTableData', authMiddleware, async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 50;

    const filter = buildTeacherFilter(req.query);

    try {
        const total = await RegTeacher.countDocuments(filter);
        const data = await RegTeacher.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

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

router.get('/summary', authMiddleware, async (req, res) => {
    const filter = buildTeacherFilter(req.query);

    try {
        const countsAggregation = await RegTeacher.aggregate([
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
            under_review: 0,
            pending_payment: 0,
            rejected: 0,
            verified: 0,
            premium: 0,
            elite: 0
        };

        let total = 0;
        countsAggregation.forEach(item => {
            const stat = item._id?.toLowerCase();
            total += item.count;
            if (stat === 'pending') counts.pending = item.count;
            else if (stat === 'under review') counts.under_review = item.count;
            else if (stat === 'pending payment') counts.pending_payment = item.count;
            else if (stat === 'rejected') counts.rejected = item.count;
            else if (stat === 'verified') counts.verified = item.count;
            else if (stat === 'premium') counts.premium = item.count;
            else if (stat === 'elite') counts.elite = item.count;
        });

        let records = [];
        if (req.query.allData === 'true') {
            records = await RegTeacher.find(filter)
                .select('name gender currentArea academicYear mastersDept mastersUniversity honorsDept honorsUniversity premiumCode uniCode sscResult hscResult experience favoriteSubject hscGroup sscGroup school college status isInfoVerified isBiodataShow isResultShow division district thana pourosova_union_ward city')
                .lean();
        }

        res.json({
            ...counts,
            total,
            allData: records
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/check-exists', async (req, res) => {
    const { premiumCode, phone } = req.query;

    if (!premiumCode || !phone) {
        return res.status(400).json({ message: 'Both premiumCode and phone query parameters are required' });
    }

    try {
        const existing = await RegTeacher.findOne({ premiumCode, phone }).lean();

        res.json({ exists: Boolean(existing) });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/check-exists-with-phone', async (req, res) => {
    const { phone } = req.query;

    if (!phone) {
        return res.status(400).json({ message: 'Phone is required' });
    }

    try {
        const existing = await RegTeacher.findOne({ phone }).lean();

        res.json({ exists: Boolean(existing) });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

async function getNextPremiumCode() {
    // 1. Fetch only the single latest TSF record sorted descending (O(1) memory & speed)
    const latestTeacher = await RegTeacher.findOne(
        { premiumCode: { $regex: /^TSF\d{5,}$/i } }
    )
        .sort({ premiumCode: -1 })
        .select('premiumCode')
        .lean();

    let maxNum = 30159;
    if (latestTeacher && latestTeacher.premiumCode) {
        const match = latestTeacher.premiumCode.match(/^TSF(\d+)$/i);
        if (match) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > maxNum) {
                maxNum = num;
            }
        }
    }

    let nextNum = maxNum + 1;
    let nextCode = `TSF${nextNum}`;
    while (await RegTeacher.exists({ premiumCode: nextCode })) {
        nextNum++;
        nextCode = `TSF${nextNum}`;
    }
    return nextCode;
}

router.post('/add', async (req, res) => {
    try {
        const { phone, alternativePhone, whatsapp } = req.body;

        const allInputValues = [phone, alternativePhone, whatsapp].filter(Boolean);

        if (allInputValues.length > 0) {
            const existing = await RegTeacher.find({
                $or: [
                    { phone: { $in: allInputValues } },
                    { alternativePhone: { $in: allInputValues } },
                    { whatsapp: { $in: allInputValues } }
                ]
            });

            if (existing.length > 0) {
                const matchedInputs = new Set();

                existing.forEach(entry => {
                    if (entry.phone && allInputValues.includes(entry.phone)) {
                        if (entry.phone === phone) matchedInputs.add('phone');
                        if (entry.phone === alternativePhone) matchedInputs.add('alternativePhone');
                        if (entry.phone === whatsapp) matchedInputs.add('whatsapp');
                    }

                    if (entry.alternativePhone && allInputValues.includes(entry.alternativePhone)) {
                        if (entry.alternativePhone === phone) matchedInputs.add('phone');
                        if (entry.alternativePhone === alternativePhone) matchedInputs.add('alternativePhone');
                        if (entry.alternativePhone === whatsapp) matchedInputs.add('whatsapp');
                    }

                    if (entry.whatsapp && allInputValues.includes(entry.whatsapp)) {
                        if (entry.whatsapp === phone) matchedInputs.add('phone');
                        if (entry.whatsapp === alternativePhone) matchedInputs.add('alternativePhone');
                        if (entry.whatsapp === whatsapp) matchedInputs.add('whatsapp');
                    }
                });

                return res.status(400).json({
                    message: 'একই তথ্য দিয়ে ইতোমধ্যে আবেদন করা হয়েছে।',
                    duplicates: Array.from(matchedInputs)
                });
            }
        }

        const localTime = moment().utcOffset(6 * 60).format("YYYY-MM-DD HH:mm:ss");
        const createdBy = req.body.createdBy ? req.body.createdBy : 'teacher';

        const referStatus = req.body.referPersonPhone ? 'pending' : undefined;

        let assignedPremiumCode = req.body.premiumCode;
        if (!assignedPremiumCode || String(assignedPremiumCode).trim() === '') {
            assignedPremiumCode = await getNextPremiumCode();
        }

        // If division is provided then save division, if not provided then save city as division
        let resolvedDivision = req.body.division && String(req.body.division).trim()
            ? String(req.body.division).trim()
            : undefined;

        if (!resolvedDivision && req.body.city && String(req.body.city).trim()) {
            const c = String(req.body.city).trim();
            resolvedDivision = (c.toLowerCase() === 'chittagong' || c.toLowerCase() === 'chattogram')
                ? 'Chittagong'
                : (c.toLowerCase() === 'dhaka' ? 'Dhaka' : c.charAt(0).toUpperCase() + c.slice(1));
        }

        const newTeacher = new RegTeacher({
            ...req.body,
            division: resolvedDivision || req.body.division,
            premiumCode: assignedPremiumCode,
            createdBy,
            createdAt: localTime,
            status: req.body.status || 'pending',
            referStatus
        });

        await newTeacher.save();

        res.status(201).json({
            success: true,
            message: 'Teacher registered successfully',
            premiumCode: newTeacher.premiumCode
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.put('/edit/:id', authMiddleware, async (req, res) => {
    try {
        const oldTeacher = await RegTeacher.findById(req.params.id);
        if (!oldTeacher) {
            return res.status(404).json({ message: 'Record not found' });
        }

        // If photo is replaced or removed, delete the old photo from R2 storage
        if (req.body.photo !== undefined && oldTeacher.photo && oldTeacher.photo !== req.body.photo) {
            await deleteFromR2(oldTeacher.photo);
        }
        // If legacy NID/Birth photo is replaced or removed, delete the old photo from R2 storage
        if (req.body.nidPhoto !== undefined && oldTeacher.nidPhoto && oldTeacher.nidPhoto !== req.body.nidPhoto) {
            await deleteFromR2(oldTeacher.nidPhoto);
        }
        // If NID Front is replaced or removed, delete old document from R2 storage
        if (req.body.nidFront !== undefined && oldTeacher.nidFront && oldTeacher.nidFront !== req.body.nidFront) {
            await deleteFromR2(oldTeacher.nidFront);
        }
        // If NID Back is replaced or removed, delete old document from R2 storage
        if (req.body.nidBack !== undefined && oldTeacher.nidBack && oldTeacher.nidBack !== req.body.nidBack) {
            await deleteFromR2(oldTeacher.nidBack);
        }
        // If SSC Marksheet is replaced or removed, delete old document from R2 storage
        if (req.body.sscMarksheet !== undefined && oldTeacher.sscMarksheet && oldTeacher.sscMarksheet !== req.body.sscMarksheet) {
            await deleteFromR2(oldTeacher.sscMarksheet);
        }
        // If HSC Marksheet is replaced or removed, delete old document from R2 storage
        if (req.body.hscMarksheet !== undefined && oldTeacher.hscMarksheet && oldTeacher.hscMarksheet !== req.body.hscMarksheet) {
            await deleteFromR2(oldTeacher.hscMarksheet);
        }
        // If University ID / Admission Slip is replaced or removed, delete old document from R2 storage
        if (req.body.universityIdCard !== undefined && oldTeacher.universityIdCard && oldTeacher.universityIdCard !== req.body.universityIdCard) {
            await deleteFromR2(oldTeacher.universityIdCard);
        }
        // If Other Document 1 is replaced or removed, delete old document from R2 storage
        if (req.body.otherDoc1 !== undefined && oldTeacher.otherDoc1 && oldTeacher.otherDoc1 !== req.body.otherDoc1) {
            await deleteFromR2(oldTeacher.otherDoc1);
        }
        // If Other Document 2 is replaced or removed, delete old document from R2 storage
        if (req.body.otherDoc2 !== undefined && oldTeacher.otherDoc2 && oldTeacher.otherDoc2 !== req.body.otherDoc2) {
            await deleteFromR2(oldTeacher.otherDoc2);
        }
        // If Other Document 3 is replaced or removed, delete old document from R2 storage
        if (req.body.otherDoc3 !== undefined && oldTeacher.otherDoc3 && oldTeacher.otherDoc3 !== req.body.otherDoc3) {
            await deleteFromR2(oldTeacher.otherDoc3);
        }

        // If division is provided then save division, if not provided then save city as division
        if ((!req.body.division || !String(req.body.division).trim()) && req.body.city && String(req.body.city).trim()) {
            const c = String(req.body.city).trim();
            req.body.division = (c.toLowerCase() === 'chittagong' || c.toLowerCase() === 'chattogram')
                ? 'Chittagong'
                : (c.toLowerCase() === 'dhaka' ? 'Dhaka' : c.charAt(0).toUpperCase() + c.slice(1));
        }

        const updatedTeacher = await RegTeacher.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );

        if (updatedTeacher && req.body.status && oldTeacher.status !== req.body.status) {
            await logStatusChange(req, 'RegTeacher', updatedTeacher._id, oldTeacher.status, req.body.status, updatedTeacher.premiumCode || null);
        }

        res.json(updatedTeacher);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.put('/update-status/:id', authMiddleware, async (req, res) => {
    const { status, comment } = req.body;

    if (!status) {
        return res.status(400).json({ message: "Status is required" });
    }

    try {
        const oldTeacher = await RegTeacher.findById(req.params.id);
        if (!oldTeacher) {
            return res.status(404).json({ message: "Record not found" });
        }

        const updatedTeacher = await RegTeacher.findByIdAndUpdate(
            req.params.id,
            { status, comment },
            { new: true }
        );

        if (updatedTeacher && oldTeacher.status !== status) {
            await logStatusChange(req, 'RegTeacher', updatedTeacher._id, oldTeacher.status, status, updatedTeacher.premiumCode || null);
        }

        res.json(updatedTeacher);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.delete('/delete/:id', authMiddleware, async (req, res) => {
    try {
        const teacher = await RegTeacher.findById(req.params.id);
        if (teacher) {
            if (teacher.photo) await deleteFromR2(teacher.photo);
            if (teacher.nidPhoto) await deleteFromR2(teacher.nidPhoto);
            if (teacher.nidFront) await deleteFromR2(teacher.nidFront);
            if (teacher.nidBack) await deleteFromR2(teacher.nidBack);
            if (teacher.sscMarksheet) await deleteFromR2(teacher.sscMarksheet);
            if (teacher.hscMarksheet) await deleteFromR2(teacher.hscMarksheet);
            if (teacher.universityIdCard) await deleteFromR2(teacher.universityIdCard);
            if (teacher.otherDoc1) await deleteFromR2(teacher.otherDoc1);
            if (teacher.otherDoc2) await deleteFromR2(teacher.otherDoc2);
            if (teacher.otherDoc3) await deleteFromR2(teacher.otherDoc3);
        }
        await RegTeacher.findByIdAndDelete(req.params.id);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

const convertNormal = (str) => {
    if (!str) return '';
    let phone = str.replace(/[\s\-\+]/g, '');
    if (phone.startsWith('880')) phone = phone.slice(3);
    if (!phone.startsWith('0')) phone = '0' + phone;
    return phone;
};

router.post('/check-apply-possible', checkApplyLimiter, async (req, res) => {
    const { premiumCode, phone } = req.body;

    if (!premiumCode || !phone) {
        return res.status(400).json({ message: "Both premiumCode and phone are required" });
    }

    try {
        const teacher = await RegTeacher.findOne({ premiumCode }).lean();

        if (!teacher) {
            return res.status(404).json({ message: "এই প্রিমিয়াম কোড পাওয়া যায়নি। অনুগ্রহ করে সঠিক প্রিমিয়াম কোড প্রদান করুন।" });
        }

        if (teacher.status === 'suspended') {
            return res.status(403).json({ message: "Please contact to office" });
        }

        const allTeacherPhones = [teacher.phone, teacher.alternativePhone, teacher.whatsapp].filter(Boolean);
        const inputPhone = convertNormal(phone);

        const matched = allTeacherPhones.some(p => convertNormal(p) === inputPhone);

        if (!matched) {
            return res.status(400).json({
                message: `অনুগ্রহ করে সঠিক ফোন নম্বরটি দিন, যা এই প্রিমিয়াম কোডের (${premiumCode}) সাথে মিলে।`
            });
        }

        // Only return the fields the frontend needs — never expose NID, all phone numbers, bank details, etc.
        const safeTeacherData = {
            name: teacher.name || '',
            phone: inputPhone,
            currentArea: teacher.currentArea || '',
            fullAddress: teacher.fullAddress || '',
            university: teacher.university || '',
            honorsUniversity: teacher.honorsUniversity || '',
            mastersUniversity: teacher.mastersUniversity || '',
            department: teacher.department || '',
            honorsDept: teacher.honorsDept || '',
            mastersDept: teacher.mastersDept || '',
            academicYear: teacher.academicYear || '',
            status: teacher.status || '',
        };

        res.json({
            success: true,
            message: "OK, matched",
            data: {
                premiumCode: teacher.premiumCode,
                phone: inputPhone,
                data: safeTeacherData,
                chatToken: generateChatToken(inputPhone)
            }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});



module.exports = router;
