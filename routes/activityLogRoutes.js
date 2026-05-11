const express = require('express');
const ActivityLog = require('../models/ActivityLog');
const router = express.Router();
const jwt = require('jsonwebtoken');
const moment = require('moment-timezone');

// Auth middleware (ensure superadmin)
const superadminOnly = (req, res, next) => {
    let token = req.header('Authorization');
    
    // Fallback to query param for file downloads (window.open)
    if (!token && req.query.token) {
        token = req.query.token;
    }

    if (!token) return res.status(401).json({ message: 'Access Denied' });

    try {
        const verified = jwt.verify(token, 'mahedi1000abcdefgh100');
        if (verified.role !== 'superadmin') {
            return res.status(403).json({ message: 'Forbidden: Superadmin only' });
        }
        req.user = verified;
        next();
    } catch (err) {
        res.status(400).json({ message: 'Invalid Token' });
    }
};

router.get('/', superadminOnly, async (req, res) => {
    try {
        const { user, module, startDate, endDate, tuitionCode, page = 1, limit = 50 } = req.query;
        const filter = {};

        if (user) {
            filter.user = new RegExp(user, 'i');
        }

        if (module) {
            filter.module = module;
        }

        if (tuitionCode) {
            filter.tuitionCode = new RegExp(tuitionCode, 'i');
        }

        if (startDate || endDate) {
            filter.timestamp = {};
            if (startDate) {
                filter.timestamp.$gte = new Date(startDate);
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                filter.timestamp.$lte = end;
            }
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await ActivityLog.countDocuments(filter);
        const logs = await ActivityLog.find(filter)
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        res.json({
            logs,
            total,
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit))
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/summary', superadminOnly, async (req, res) => {
    try {
        const { user, module, startDate, endDate, tuitionCode } = req.query;
        const filter = {};
        if (user) filter.user = new RegExp(user, 'i');
        if (module) filter.module = module;
        if (tuitionCode) filter.tuitionCode = new RegExp(tuitionCode, 'i');
        if (startDate || endDate) {
            filter.timestamp = {};
            if (startDate) filter.timestamp.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                filter.timestamp.$lte = end;
            }
        }

        const total = await ActivityLog.countDocuments(filter);
        
        // Today's logs (BD Time)
        const startOfToday = moment().tz("Asia/Dhaka").startOf('day').toDate();
        const todayFilter = { ...filter, timestamp: { $gte: startOfToday } };
        const today = await ActivityLog.countDocuments(todayFilter);

        // Action counts
        const create = await ActivityLog.countDocuments({ ...filter, action: 'Create' });
        const edit = await ActivityLog.countDocuments({ ...filter, action: 'Edit' });
        const del = await ActivityLog.countDocuments({ ...filter, action: 'Delete' });

        res.json({ total, today, create, edit, delete: del });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/export', superadminOnly, async (req, res) => {
    try {
        const { user, module, startDate, endDate, tuitionCode } = req.query;
        const filter = {};

        if (user) filter.user = new RegExp(user, 'i');
        if (module) filter.module = module;
        if (tuitionCode) filter.tuitionCode = new RegExp(tuitionCode, 'i');
        if (startDate || endDate) {
            filter.timestamp = {};
            if (startDate) filter.timestamp.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                filter.timestamp.$lte = end;
            }
        }

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=activity_logs.csv');

        const header = 'Timestamp,User,Action,Module,Tuition Code,Resource ID,Summary\n';
        res.write(header);

        const batchSize = 1000;
        let skip = 0;

        const escapeCsvField = (field) => {
            if (field === null || field === undefined) return '';
            field = String(field);
            if (field.includes(',') || field.includes('"') || field.includes('\n') || field.includes('\r')) {
                return `"${field.replace(/"/g, '""')}"`;
            }
            return field;
        };

        while (true) {
            const batch = await ActivityLog.find(filter)
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(batchSize)
                .lean();

            if (batch.length === 0) break;

            for (const log of batch) {
                let summaryStr = '';
                if (log.action === 'Create') summaryStr = `New ${log.module} created`;
                else if (log.action === 'Delete') summaryStr = `${log.module} removed`;
                else if (log.action === 'Edit' && log.details.after) {
                    summaryStr = `Updated: ${Object.keys(log.details.after).join(', ')}`;
                }

                const row = [
                    escapeCsvField(new Date(log.timestamp).toLocaleString()),
                    escapeCsvField(log.user),
                    escapeCsvField(log.action),
                    escapeCsvField(log.module),
                    escapeCsvField(log.tuitionCode || 'N/A'),
                    escapeCsvField(log.resourceId),
                    escapeCsvField(summaryStr)
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

router.get('/filter-options', superadminOnly, async (req, res) => {
    try {
        const users = await ActivityLog.distinct('user');
        const modules = await ActivityLog.distinct('module');
        res.json({ users, modules });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
