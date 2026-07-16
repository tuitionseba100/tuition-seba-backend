const express = require('express');
const StatusHistory = require('../models/StatusHistory');
const ActivityLog = require('../models/ActivityLog');
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
            verifiedOnlyCount,
            afterConfirmationCount,
            afterSalaryCount,
            advance30Count,
            confirmedTuitionsCount,
            applySelectedCount,
            applyConfirmedCount,
            tuitionsCreatedTodayCount
        ] = await Promise.all([
            // Verified only
            StatusHistory.countDocuments({
                module: 'RegTeacher',
                newStatus: 'verified',
                timestamp: { $gte: startOfDay, $lte: endOfDay }
            }),
            // After confirmation
            StatusHistory.countDocuments({
                module: 'RegTeacher',
                newStatus: 'after confirmation',
                timestamp: { $gte: startOfDay, $lte: endOfDay }
            }),
            // After salary
            StatusHistory.countDocuments({
                module: 'RegTeacher',
                newStatus: 'after salary',
                timestamp: { $gte: startOfDay, $lte: endOfDay }
            }),
            // 30% advance
            StatusHistory.countDocuments({
                module: 'RegTeacher',
                newStatus: '30% advance',
                timestamp: { $gte: startOfDay, $lte: endOfDay }
            }),
            // Tuition status changes to 'confirm' today
            StatusHistory.countDocuments({
                module: 'Tuition',
                newStatus: 'confirm',
                timestamp: { $gte: startOfDay, $lte: endOfDay }
            }),
            // TuitionApply status changed to 'selected' today
            StatusHistory.countDocuments({
                module: 'TuitionApply',
                newStatus: 'selected',
                timestamp: { $gte: startOfDay, $lte: endOfDay }
            }),
            // TuitionApply status changed to 'confirmed' today
            StatusHistory.countDocuments({
                module: 'TuitionApply',
                newStatus: 'confirmed',
                timestamp: { $gte: startOfDay, $lte: endOfDay }
            }),
            // Tuitions created today from activity log
            ActivityLog.countDocuments({
                module: 'Tuition',
                action: 'Create',
                timestamp: { $gte: startOfDay, $lte: endOfDay }
            })
        ]);

        res.json({
            date: nowBD.format("YYYY-MM-DD"),
            verifiedTeachersCount: verifiedOnlyCount + afterConfirmationCount + afterSalaryCount + advance30Count,
            verifiedBreakdown: {
                verified: verifiedOnlyCount,
                afterConfirmation: afterConfirmationCount,
                afterSalary: afterSalaryCount,
                advance30: advance30Count
            },
            confirmedTuitionsCount,
            confirmedApplicationsCount: applySelectedCount + applyConfirmedCount,
            applyBreakdown: {
                selected: applySelectedCount,
                confirmed: applyConfirmedCount
            },
            tuitionsCreatedTodayCount
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
