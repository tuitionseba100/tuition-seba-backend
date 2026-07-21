const express = require('express');
const StatusHistory = require('../models/StatusHistory');
const ActivityLog = require('../models/ActivityLog');
const router = express.Router();
const moment = require('moment-timezone');
const jwt = require('jsonwebtoken');

const superadminOnly = (req, res, next) => {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ message: 'Access Denied' });

    try {
        const verified = jwt.verify(token, 'mahedi1000abcdefgh100');
        if (verified.role !== 'superadmin') {
            return res.status(403).json({ message: 'Forbidden: Superadmin access required' });
        }
        req.user = verified;
        next();
    } catch (err) {
        res.status(400).json({ message: 'Invalid Token' });
    }
};

// Get summary/report of status changes for today (Asia/Dhaka timezone)
router.get('/today-report', superadminOnly, async (req, res) => {
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
router.get('/list', superadminOnly, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const { moduleName, changedBy, newStatus, startDate, endDate, tuitionCode } = req.query;

        const shFilter = {};
        const alFilter = {};

        // Module
        if (moduleName) {
            shFilter.module = moduleName;
            alFilter.module = moduleName;
        } else {
            alFilter.module = 'Tuition';
        }

        // Performed By
        if (changedBy) {
            shFilter.changedBy = new RegExp(changedBy.trim(), 'i');
            alFilter.user = new RegExp(changedBy.trim(), 'i');
        }

        // Tuition Code
        if (tuitionCode) {
            shFilter.tuitionCode = new RegExp(tuitionCode.trim(), 'i');
            alFilter.tuitionCode = new RegExp(tuitionCode.trim(), 'i');
        }

        // Dates
        if (startDate || endDate) {
            shFilter.timestamp = {};
            alFilter.timestamp = {};
            if (startDate) {
                const start = moment(startDate).startOf('day').toDate();
                shFilter.timestamp.$gte = start;
                alFilter.timestamp.$gte = start;
            }
            if (endDate) {
                const end = moment(endDate).endOf('day').toDate();
                shFilter.timestamp.$lte = end;
                alFilter.timestamp.$lte = end;
            }
        }

        if (newStatus) {
            shFilter.newStatus = newStatus;
        }

        const isSHStatus = !newStatus || (newStatus !== 'created' && newStatus !== 'deleted');
        const isALStatus = !newStatus || newStatus === 'created' || newStatus === 'deleted';
        const isALModule = !moduleName || moduleName === 'Tuition';

        if (isALStatus && isALModule) {
            if (newStatus === 'created') {
                alFilter.action = 'Create';
            } else if (newStatus === 'deleted') {
                alFilter.action = 'Delete';
            } else {
                alFilter.action = { $in: ['Create', 'Delete'] };
            }
        }

        const shCount = isSHStatus ? await StatusHistory.countDocuments(shFilter) : 0;
        const alCount = (isALStatus && isALModule) ? await ActivityLog.countDocuments(alFilter) : 0;
        const total = shCount + alCount;

        let combinedData = [];

        if (shCount > 0 && alCount > 0) {
            const [shDocs, alDocs] = await Promise.all([
                StatusHistory.find(shFilter).sort({ timestamp: -1 }).limit(page * limit).lean(),
                ActivityLog.find(alFilter).sort({ timestamp: -1 }).limit(page * limit).lean()
            ]);

            const mappedAlDocs = alDocs.map(log => ({
                _id: log._id,
                module: log.module,
                resourceId: log.resourceId,
                tuitionCode: log.tuitionCode,
                oldStatus: log.action === 'Create' ? '' : 'Active',
                newStatus: log.action === 'Create' ? 'created' : 'deleted',
                changedBy: log.user,
                timestamp: log.timestamp
            }));

            const merged = [...shDocs, ...mappedAlDocs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            combinedData = merged.slice((page - 1) * limit, page * limit);
        } else if (shCount > 0) {
            combinedData = await StatusHistory.find(shFilter)
                .sort({ timestamp: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean();
        } else if (alCount > 0) {
            const alDocs = await ActivityLog.find(alFilter)
                .sort({ timestamp: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean();
            combinedData = alDocs.map(log => ({
                _id: log._id,
                module: log.module,
                resourceId: log.resourceId,
                tuitionCode: log.tuitionCode,
                oldStatus: log.action === 'Create' ? '' : 'Active',
                newStatus: log.action === 'Create' ? 'created' : 'deleted',
                changedBy: log.user,
                timestamp: log.timestamp
            }));
        }

        res.json({
            data: combinedData,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalRecords: total
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Export status history records to CSV (streaming directly from DB)
router.get('/export-csv', superadminOnly, async (req, res) => {
    try {
        const { moduleName, changedBy, newStatus, startDate, endDate, tuitionCode } = req.query;

        const shFilter = {};
        const alFilter = {};

        // Module
        if (moduleName) {
            shFilter.module = moduleName;
            alFilter.module = moduleName;
        } else {
            alFilter.module = 'Tuition';
        }

        // Performed By
        if (changedBy) {
            shFilter.changedBy = new RegExp(changedBy.trim(), 'i');
            alFilter.user = new RegExp(changedBy.trim(), 'i');
        }

        // Tuition Code
        if (tuitionCode) {
            shFilter.tuitionCode = new RegExp(tuitionCode.trim(), 'i');
            alFilter.tuitionCode = new RegExp(tuitionCode.trim(), 'i');
        }

        // Dates
        if (startDate || endDate) {
            shFilter.timestamp = {};
            alFilter.timestamp = {};
            if (startDate) {
                const start = moment(startDate).startOf('day').toDate();
                shFilter.timestamp.$gte = start;
                alFilter.timestamp.$gte = start;
            }
            if (endDate) {
                const end = moment(endDate).endOf('day').toDate();
                shFilter.timestamp.$lte = end;
                alFilter.timestamp.$lte = end;
            }
        }

        if (newStatus) {
            shFilter.newStatus = newStatus;
        }

        const isSHStatus = !newStatus || (newStatus !== 'created' && newStatus !== 'deleted');
        const isALStatus = !newStatus || newStatus === 'created' || newStatus === 'deleted';
        const isALModule = !moduleName || moduleName === 'Tuition';

        if (isALStatus && isALModule) {
            if (newStatus === 'created') {
                alFilter.action = 'Create';
            } else if (newStatus === 'deleted') {
                alFilter.action = 'Delete';
            } else {
                alFilter.action = { $in: ['Create', 'Delete'] };
            }
        }

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=status_history_report_${moment().format('YYYY-MM-DD')}.csv`);

        // Write CSV headers
        res.write("Timestamp,Section,Tuition/Premium Code,Target ID,Old Status,New Status,Performed By\n");

        if (isSHStatus && isALStatus && isALModule) {
            const [shDocs, alDocs] = await Promise.all([
                StatusHistory.find(shFilter).sort({ timestamp: -1 }).lean(),
                ActivityLog.find(alFilter).sort({ timestamp: -1 }).lean()
            ]);

            const mappedAlDocs = alDocs.map(log => ({
                module: log.module,
                resourceId: log.resourceId,
                tuitionCode: log.tuitionCode,
                oldStatus: log.action === 'Create' ? '' : 'Active',
                newStatus: log.action === 'Create' ? 'created' : 'deleted',
                changedBy: log.user,
                timestamp: log.timestamp
            }));

            const merged = [...shDocs, ...mappedAlDocs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            for (const log of merged) {
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
            }
            res.end();
        } else if (isSHStatus) {
            const cursor = StatusHistory.find(shFilter).sort({ timestamp: -1 }).cursor();
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
                    `"${performedBy}"`
                ].join(',');
                
                res.write(row + '\n');
            });
            cursor.on('end', () => res.end());
            cursor.on('error', (err) => { console.error(err); res.end(); });
        } else {
            const cursor = ActivityLog.find(alFilter).sort({ timestamp: -1 }).cursor();
            cursor.on('data', (log) => {
                const timestamp = moment(log.timestamp).format('DD MMM YYYY, hh:mm A');
                const section = 'Tuition';
                                
                const code = log.tuitionCode || '-';
                const targetId = log.resourceId || '';
                const oldStatus = log.action === 'Create' ? '' : 'Active';
                const newStatus = log.action === 'Create' ? 'created' : 'deleted';
                const performedBy = log.user || '';

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
            cursor.on('end', () => res.end());
            cursor.on('error', (err) => { console.error(err); res.end(); });
        }

    } catch (err) {
        console.error('Export exception:', err);
        if (!res.headersSent) {
            res.status(500).json({ message: err.message });
        }
    }
});

module.exports = router;
