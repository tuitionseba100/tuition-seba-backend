const express = require('express');
const router = express.Router();
const Tuition = require('../models/Tuition');
const Settings = require('../models/Settings');
const jwt = require('jsonwebtoken');

// Middleware to protect routes
const authMiddleware = (req, res, next) => {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ message: 'Access Denied' });

    try {
        const verified = jwt.verify(token, 'mahedi1000abcdefgh100');
        req.user = verified;
        next();
    } catch (err) {
        res.status(400).json({ message: 'Invalid Token' });
    }
};

// GET /api/report/marketing
router.get('/marketing', authMiddleware, async (req, res) => {
    try {
        const { startDate, endDate, medium, groupBy = 'date' } = req.query;
        let matchStage = { isSoftDelete: { $ne: true } };

        if (startDate && endDate) {
            matchStage.createdAt = {
                $gte: new Date(`${startDate}T00:00:00.000Z`),
                $lte: new Date(`${endDate}T23:59:59.999Z`)
            };
        }

        if (medium) {
            matchStage.guardian_source_medium = medium;
        }

        const dateGroupFormat = groupBy === 'month' ? "%Y-%m" : "%Y-%m-%d";

        const [report, settings] = await Promise.all([
            Tuition.aggregate([
                { $match: matchStage },
                {
                    $lookup: {
                        from: "payments",
                        localField: "tuitionCode",
                        foreignField: "tuitionCode",
                        as: "payments"
                    }
                },
                {
                    $addFields: {
                        totalRevenueForTuition: {
                            $sum: {
                                $map: {
                                    input: "$payments",
                                    as: "payment",
                                    in: { 
                                        $convert: {
                                            input: { $ifNull: ["$$payment.totalReceivedTk", "0"] },
                                            to: "double",
                                            onError: 0,
                                            onNull: 0
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                { 
                    $group: { 
                        _id: { 
                            $cond: [
                                { $in: [{ $ifNull: ["$guardian_source_medium", ""] }, ["", null]] }, 
                                "Unknown", 
                                "$guardian_source_medium"
                            ] 
                        },
                        count: { $sum: 1 },
                        totalRevenue: { $sum: "$totalRevenueForTuition" },
                        cancelledCount: { 
                            $sum: { $cond: [{ $eq: ["$status", "cancel"] }, 1, 0] } 
                        },
                        suspendedCount: { 
                            $sum: { 
                                $cond: [{ $in: ["$status", ["suspend", "suspended"]] }, 1, 0] 
                            } 
                        }
                    } 
                },
                { $sort: { count: -1 } }
            ]),
            Settings.findOne({ key: 'marketing_mediums' })
        ]);

        const marketingMediums = settings && settings.value ? settings.value : [];
        const allMediumsSet = new Set(marketingMediums.map(m => (m || '').toLowerCase()));
        
        const aggregatedSummary = report.map(item => ({
            medium: item._id,
            count: item.count || 0,
            revenue: item.totalRevenue || 0,
            cancelled: item.cancelledCount || 0,
            suspended: item.suspendedCount || 0
        }));

        const extraMediums = aggregatedSummary.filter(s => !allMediumsSet.has((s.medium || 'unknown').toLowerCase()));
        
        const summary = [
            ...marketingMediums.map(med => {
                const found = aggregatedSummary.find(s => (s.medium || 'unknown').toLowerCase() === (med || '').toLowerCase());
                return found || { medium: med, count: 0, revenue: 0, cancelled: 0, suspended: 0 };
            }),
            ...extraMediums
        ];

        // Sort by count (Tuition Got) descending
        summary.sort((a, b) => (b.count || 0) - (a.count || 0));

        res.json({
            summary
        });
    } catch (err) {
        console.error('Marketing report error:', err);
        res.status(500).json({ error: 'Failed to generate marketing report' });
    }
});

module.exports = router;
