const express = require('express');
const StatusHistory = require('../models/StatusHistory');
const router = express.Router();
const moment = require('moment-timezone');

// Get summary/report of status changes for today (Asia/Dhaka timezone)
router.get('/today-report', async (req, res) => {
    try {
        // Calculate start and end of today in Bangladesh Time (UTC+6)
        const nowBD = moment().tz("Asia/Dhaka");
        const startOfDay = nowBD.clone().startOf('day').toDate();
        const endOfDay = nowBD.clone().endOf('day').toDate();

        const [
            verifiedTeachersCount,
            confirmedTuitionsCount,
            confirmedApplicationsCount
        ] = await Promise.all([
            // Verified teachers count today
            StatusHistory.countDocuments({
                module: 'RegTeacher',
                newStatus: 'verified',
                timestamp: { $gte: startOfDay, $lte: endOfDay }
            }),
            // Tuition status changes to 'confirm' today
            StatusHistory.countDocuments({
                module: 'Tuition',
                newStatus: 'confirm',
                timestamp: { $gte: startOfDay, $lte: endOfDay }
            }),
            // Confirmed tuition applies today
            StatusHistory.countDocuments({
                module: 'TuitionApply',
                newStatus: 'confirmed',
                timestamp: { $gte: startOfDay, $lte: endOfDay }
            })
        ]);

        res.json({
            date: nowBD.format("YYYY-MM-DD"),
            verifiedTeachersCount,
            confirmedTuitionsCount,
            confirmedApplicationsCount
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get status changes history for a specific resource
router.get('/history/:moduleName/:resourceId', async (req, res) => {
    try {
        const { moduleName, resourceId } = req.params;
        const history = await StatusHistory.find({ 
            module: moduleName, 
            resourceId: resourceId.toString() 
        }).sort({ timestamp: -1 }); // newest first
        res.json(history);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get all status history records with filtering and pagination
router.get('/list', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const { moduleName, changedBy, newStatus, startDate, endDate, tuitionCode } = req.query;

        const filter = {};

        if (moduleName) {
            filter.module = moduleName;
        }
        if (changedBy) {
            filter.changedBy = new RegExp(changedBy.trim(), 'i');
        }
        if (newStatus) {
            filter.newStatus = newStatus;
        }
        if (tuitionCode) {
            filter.tuitionCode = new RegExp(tuitionCode.trim(), 'i');
        }

        if (startDate || endDate) {
            filter.timestamp = {};
            if (startDate) {
                filter.timestamp.$gte = moment(startDate).startOf('day').toDate();
            }
            if (endDate) {
                filter.timestamp.$lte = moment(endDate).endOf('day').toDate();
            }
        }

        const total = await StatusHistory.countDocuments(filter);
        const data = await StatusHistory.find(filter)
            .sort({ timestamp: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

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

module.exports = router;
