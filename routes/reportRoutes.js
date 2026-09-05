const express = require('express');
const router = express.Router();
const Tuition = require('../models/Tuition');
const Settings = require('../models/Settings');
const Expense = require('../models/Expense');
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

        let expenseMatchStage = {};
        if (startDate && endDate) {
            expenseMatchStage.date = {
                $gte: new Date(`${startDate}T00:00:00.000Z`),
                $lte: new Date(`${endDate}T23:59:59.999Z`)
            };
        }

        const [report, settings, expenseReport] = await Promise.all([
            Tuition.aggregate([
                { $match: matchStage },
                {
                    $lookup: {
                        from: "payments",
                        let: { tCode: "$tuitionCode" },
                        pipeline: [
                            { $match: { $expr: { $eq: ["$tuitionCode", "$$tCode"] } } },
                            { $project: { receivedTk: 1, receivedTk2: 1, receivedTk3: 1, receivedTk4: 1 } }
                        ],
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
                                        $add: [
                                            { $convert: { input: { $ifNull: ["$$payment.receivedTk", "0"] }, to: "double", onError: 0, onNull: 0 } },
                                            { $convert: { input: { $ifNull: ["$$payment.receivedTk2", "0"] }, to: "double", onError: 0, onNull: 0 } },
                                            { $convert: { input: { $ifNull: ["$$payment.receivedTk3", "0"] }, to: "double", onError: 0, onNull: 0 } },
                                            { $convert: { input: { $ifNull: ["$$payment.receivedTk4", "0"] }, to: "double", onError: 0, onNull: 0 } }
                                        ]
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
            Settings.findOne({ key: 'marketing_mediums' }).lean(),
            Expense.aggregate([
                { $match: expenseMatchStage },
                { $group: { _id: { $toLower: "$category" }, totalExpense: { $sum: "$amount" } } }
            ])
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
        
        const expenseMap = new Map();
        if (expenseReport) {
            expenseReport.forEach(e => expenseMap.set(e._id, e.totalExpense));
        }
        
        const summary = [
            ...marketingMediums.map(med => {
                const lowerMed = (med || '').toLowerCase();
                const found = aggregatedSummary.find(s => (s.medium || 'unknown').toLowerCase() === lowerMed);
                const expenseAmt = expenseMap.get(lowerMed) || 0;
                return found ? { ...found, expense: expenseAmt } : { medium: med, count: 0, revenue: 0, cancelled: 0, suspended: 0, expense: expenseAmt };
            }),
            ...extraMediums.map(em => {
                const lowerMed = (em.medium || '').toLowerCase();
                const expenseAmt = expenseMap.get(lowerMed) || 0;
                return { ...em, expense: expenseAmt };
            })
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
