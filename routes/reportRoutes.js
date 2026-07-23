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
        const { startDate, endDate, medium } = req.query;
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
                            { $in: ["$guardian_source_medium", ["", null]] }, 
                            "Unknown", 
                            "$guardian_source_medium"
                        ] 
                    },
                    count: { $sum: 1 },
                    totalRevenue: { $sum: "$totalRevenueForTuition" }
                } 
            },
            { $sort: { count: -1 } }
        ]);

        const formattedReport = report.map(item => ({
            medium: item._id,
            count: item.count,
            totalRevenue: item.totalRevenue || 0
        }));

        res.json(formattedReport);
    } catch (err) {
        console.error('Marketing report error:', err);
        res.status(500).json({ error: 'Failed to generate marketing report' });
    }
});

module.exports = router;
