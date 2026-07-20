const express = require('express');
const StatusHistory = require('../models/StatusHistory');
const ActivityLog = require('../models/ActivityLog');
const router = express.Router();
const moment = require('moment-timezone');

// Get summary/report of status changes for today (Asia/Dhaka timezone)
router.get('/today-report', async (req, res) => {
    try {
        const { changedBy, tuitionCode, startDate, endDate } = req.query;

        // Calculate start and end of today in Bangladesh Time (UTC+6)
        const nowBD = moment().tz("Asia/Dhaka");
        const startOfDay = nowBD.clone().startOf('day').toDate();
        const endOfDay = nowBD.clone().endOf('day').toDate();

        const buildFilter = (baseFilter) => {
            const filter = { ...baseFilter };
            if (changedBy) {
                filter.changedBy = new RegExp(changedBy.trim(), 'i');
            }
            if (tuitionCode) {
                filter.tuitionCode = new RegExp(tuitionCode.trim(), 'i');
            }
            let start = startOfDay;
            let end = endOfDay;
            if (startDate) {
                start = moment.tz(startDate, "Asia/Dhaka").startOf('day').toDate();
            }
            if (endDate) {
                end = moment.tz(endDate, "Asia/Dhaka").endOf('day').toDate();
            }
            filter.timestamp = { $gte: start, $lte: end };
            return filter;
        };

        const buildActivityFilter = (baseFilter) => {
            const filter = { ...baseFilter };
            if (changedBy) {
                filter.user = new RegExp(changedBy.trim(), 'i');
            }
            if (tuitionCode) {
                filter.tuitionCode = new RegExp(tuitionCode.trim(), 'i');
            }
            let start = startOfDay;
            let end = endOfDay;
            if (startDate) {
                start = moment.tz(startDate, "Asia/Dhaka").startOf('day').toDate();
            }
            if (endDate) {
                end = moment.tz(endDate, "Asia/Dhaka").endOf('day').toDate();
            }
            filter.timestamp = { $gte: start, $lte: end };
            return filter;
        };

        const [
            verifiedOnlyCount,
            afterConfirmationCount,
            afterSalaryCount,
            advance30Count,
            confirmedTuitionsCount,
            cancelledTuitionsCount,
            suspendedTuitionsCount,
            applySelectedCount,
            applyConfirmedCount,
            tuitionsCreatedTodayCount,
            tuitionsDeletedTodayCount
        ] = await Promise.all([
            // Verified only
            StatusHistory.countDocuments(buildFilter({
                module: 'RegTeacher',
                newStatus: 'verified'
            })),
            // After confirmation
            StatusHistory.countDocuments(buildFilter({
                module: 'RegTeacher',
                newStatus: 'after confirmation'
            })),
            // After salary
            StatusHistory.countDocuments(buildFilter({
                module: 'RegTeacher',
                newStatus: 'after salary'
            })),
            // 30% advance
            StatusHistory.countDocuments(buildFilter({
                module: 'RegTeacher',
                newStatus: '30% advance'
            })),
            // Tuition status changes to 'confirm' today
            StatusHistory.countDocuments(buildFilter({
                module: 'Tuition',
                newStatus: 'confirm'
            })),
            // Tuition status changes to 'cancel' today
            StatusHistory.countDocuments(buildFilter({
                module: 'Tuition',
                newStatus: 'cancel'
            })),
            // Tuition status changes to 'suspended' or 'suspend' today
            StatusHistory.countDocuments(buildFilter({
                module: 'Tuition',
                newStatus: { $in: ['suspended', 'suspend'] }
            })),
            // TuitionApply status changed to 'selected' today
            StatusHistory.countDocuments(buildFilter({
                module: 'TuitionApply',
                newStatus: 'selected'
            })),
            // TuitionApply status changed to 'confirmed' today
            StatusHistory.countDocuments(buildFilter({
                module: 'TuitionApply',
                newStatus: 'confirmed'
            })),
            // Tuitions created today from activity log
            ActivityLog.countDocuments(buildActivityFilter({
                module: 'Tuition',
                action: 'Create'
            })),
            // Tuitions deleted today from activity log
            ActivityLog.countDocuments(buildActivityFilter({
                module: 'Tuition',
                action: 'Delete'
            }))
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
            cancelledTuitionsCount,
            suspendedTuitionsCount,
            confirmedApplicationsCount: applySelectedCount + applyConfirmedCount,
            applyBreakdown: {
                selected: applySelectedCount,
                confirmed: applyConfirmedCount
            },
            tuitionsCreatedTodayCount,
            tuitionsDeletedTodayCount
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

// Export status history records to CSV (streaming directly from DB)
router.get('/export-csv', async (req, res) => {
    try {
        const { moduleName, changedBy, newStatus, startDate, endDate, tuitionCode } = req.query;

        const filter = {};

        if (moduleName) filter.module = moduleName;
        if (changedBy) filter.changedBy = new RegExp(changedBy.trim(), 'i');
        if (newStatus) filter.newStatus = newStatus;
        if (tuitionCode) filter.tuitionCode = new RegExp(tuitionCode.trim(), 'i');

        if (startDate || endDate) {
            filter.timestamp = {};
            if (startDate) {
                filter.timestamp.$gte = moment(startDate).startOf('day').toDate();
            }
            if (endDate) {
                filter.timestamp.$lte = moment(endDate).endOf('day').toDate();
            }
        }

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=status_history_report_${moment().format('YYYY-MM-DD')}.csv`);

        // Write CSV headers
        res.write("Timestamp,Section,Tuition/Premium Code,Target ID,Old Status,New Status,Performed By\n");

        const cursor = StatusHistory.find(filter).sort({ timestamp: -1 }).cursor();

        cursor.on('data', (log) => {
            const timestamp = moment(log.timestamp).format('DD MMM YYYY, hh:mm A');
            const section = log.module === 'RegTeacher' ? 'Premium Teacher' :
                            log.module === 'Tuition' ? 'Tuition' : 'Tuition Apply';
                            
            const code = log.tuitionCode || '-';
            const targetId = log.resourceId || '';
            const oldStatus = log.oldStatus || 'Created';
            const newStatus = log.newStatus || '';
            const performedBy = log.changedBy || '';

            const row = [
                `"${timestamp}"`,
                `"${section}"`,
                `"${code}"`,
                `"${targetId}"`,
                `"${oldStatus}"`,
                `"${newStatus}"`,
                `"${performedBy}"`
            ].join(',');
            
            res.write(row + '\n');
        });

        cursor.on('end', () => {
            res.end();
        });

        cursor.on('error', (err) => {
            console.error('CSV Export Error:', err);
            // If headers are already sent, we can't send a 500 status code cleanly, just end the stream
            res.end();
        });

    } catch (err) {
        console.error('Export exception:', err);
        if (!res.headersSent) {
            res.status(500).json({ message: err.message });
        }
    }
});

module.exports = router;
