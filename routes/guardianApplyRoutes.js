const express = require('express');
const GuardianApply = require('../models/GuardianApply');
const Phone = require('../models/Phone');
const moment = require('moment-timezone');
const router = express.Router();

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

router.get('/all', async (req, res) => {
    try {
        const allApply = await GuardianApply.find();
        res.json(allApply);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/today-followups', async (req, res) => {
    try {
        const startBD = moment.tz('Asia/Dhaka').startOf('day').toDate();
        const endBD = moment.tz('Asia/Dhaka').endOf('day').toDate();

        const applies = await GuardianApply.find({
            nextUpdateDate: { $gte: startBD, $lte: endBD }
        }).sort({ nextUpdateDate: 1 });

        res.json(applies);
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

    const {
        phone = '',
        address = '',
        status
    } = req.query;

    const filter = {};

    if (phone) {
        filter.phone = new RegExp(escapeRegex(phone), 'i');
    }

    if (address) {
        const trimmed = address.trim();
        if (trimmed.length) {
            filter.address = new RegExp(escapeRegex(trimmed), 'i');
        }
    }

    if (status) {
        filter.status = status;
    }

    try {
        const total = await GuardianApply.countDocuments(filter);
        const applies = await GuardianApply.find(filter)
            .sort({ _id: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        res.json({
            data: applies,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalRecords: total
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/summary', async (req, res) => {
    const {
        phone = '',
        address = '',
        status
    } = req.query;

    const filter = {};

    if (phone) {
        filter.phone = new RegExp(escapeRegex(phone), 'i');
    }

    if (address) {
        const trimmed = address.trim();
        if (trimmed.length) {
            filter.address = new RegExp(escapeRegex(trimmed), 'i');
        }
    }

    if (status) {
        filter.status = status;
    }

    try {
        const records = await GuardianApply.find(filter).lean();
        const counts = {
            pending: 0,
            no_response: 0,
            meeting_scheduled: 0,
            confirmed: 0,
            not_interested: 0
        };

        records.forEach(tuition => {
            const stat = tuition.status?.toLowerCase();

            if (stat === 'pending') counts.pending++;
            else if (stat === 'called (no response)') counts.no_response++;
            else if (stat === 'meeting scheduled') counts.meeting_scheduled++;
            else if (stat === 'confirmed') counts.confirmed++;
            else if (stat === 'not interested') counts.not_interested++;
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

router.post('/add', async (req, res) => {
    const {
        name,
        createdBy,
        teacherId,
        teacherCode,
        phone,
        address,
        studentClass,
        teacherGender,
        characteristics,
        comment,
        nextUpdateDate,
        referPersonPhone,
        referComment
    } = req.body;

    try {
        const normalizedInputPhone = normalizePhone(phone);
        const phoneList = await Phone.find({ isActive: true });

        let isSpam = false;
        let isBestGuardian = false;

        for (const entry of phoneList) {
            const normalizedDbPhone = normalizePhone(entry.phone);

            if (normalizedDbPhone === normalizedInputPhone) {
                if (entry.isSpam) {
                    isSpam = true;
                } else if (entry.isBestGuardian) {
                    isBestGuardian = true;
                }
                break;
            }
        }

        const normalizedInputPhoneForSave = normalizePhoneForSave(phone);

        const newData = new GuardianApply({
            name,
            createdBy,
            teacherId,
            teacherCode,
            phone: normalizedInputPhoneForSave,
            address,
            studentClass,
            teacherGender,
            characteristics,
            comment,
            status: "pending",
            isSpam,
            isBestGuardian,
            nextUpdateDate,
            referPersonPhone,
            referComment,
            referStatus: referPersonPhone ? 'pending' : undefined
        });

        await newData.save();
        res.status(201).json(newData);
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
            let isBestGuardian = false;

            for (const entry of phoneList) {
                const normalizedDbPhone = normalizePhone(entry.phone);

                if (normalizedDbPhone === normalizedInputPhone) {
                    if (entry.isSpam) {
                        isSpam = true;
                    } else if (entry.isBestGuardian) {
                        isBestGuardian = true;
                    }
                    break;
                }
            }

            updatePayload.isSpam = isSpam;
            updatePayload.isBestGuardian = isBestGuardian;
            updatePayload.phone = normalizePhoneForSave(req.body.phone);
        }

        if (req.body.referPersonPhone && !req.body.referStatus) {
            updatePayload.referStatus = 'pending';
        }

        const updatedData = await GuardianApply.findByIdAndUpdate(req.params.id, updatePayload, { new: true });
        res.json(updatedData);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.put('/update-status/:id', async (req, res) => {
    const { status, comment, nextUpdateDate, updatedBy } = req.body;

    if (!status) {
        return res.status(400).json({ message: "Status is required" });
    }

    try {
        const updateFields = { status, comment };

        if (nextUpdateDate !== undefined) {
            updateFields.nextUpdateDate = nextUpdateDate;
        }

        if (updatedBy !== undefined && updatedBy !== null) {
            updateFields.updatedBy = updatedBy;
        }

        const updatedData = await GuardianApply.findByIdAndUpdate(
            req.params.id,
            updateFields,
            { new: true }
        );

        if (!updatedData) {
            return res.status(404).json({ message: "Record not found" });
        }

        res.json(updatedData);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.delete('/delete/:id', async (req, res) => {
    try {
        await GuardianApply.findByIdAndDelete(req.params.id);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;