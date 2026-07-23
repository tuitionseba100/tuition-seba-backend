const express = require('express');
const router = express.Router();
const Tuition = require('../models/Tuition');
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

        const report = await Tuition.aggregate([
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
        ]);

        // Transform backend response into a flat summary array
        const summary = report.map(item => ({
            medium: item._id,
            count: item.count || 0,
            revenue: item.totalRevenue || 0,
            cancelled: item.cancelledCount || 0,
            suspended: item.suspendedCount || 0
        }));

        res.json({
            summary
        });
    } catch (err) {
        console.error('Marketing report error:', err);
        res.status(500).json({ error: 'Failed to generate marketing report' });
    }
});

module.exports = router;
