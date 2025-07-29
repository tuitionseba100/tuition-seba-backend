const express = require('express');
const router = express.Router();
const Tuition = require('../models/Tuition');
const TuitionApply = require('../models/TuitionApply');
const GuardianApply = require('../models/GuardianApply');
const TeacherPayment = require('../models/TeacherPayment');
const RefundPayment = require('../models/RefundPayment');
const Payment = require('../models/Payment');
const RegTeacher = require('../models/RegTeacher');
const Phone = require('../models/Phone');

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

router.get('/all', async (req, res) => {
    try {
        const [
            totalTuitions,
            activeTuitions,
            pendingTuitionApps,
            totalBest,
            totalTeachers,
            totalSpam,
            recentTuitionApplications,
            recentTeacherApplications,
            recentTeacherPayments,
            refundRequests,
            monthlyTuitions,
            statusBreakdown,
            monthlyPayments,
            monthlyRefunds
        ] = await Promise.all([
            Tuition.countDocuments(),
            Tuition.countDocuments({ isPublish: true }),
            TuitionApply.countDocuments({ status: 'pending' }),
            Phone.countDocuments({ isSpam: false }),
            RegTeacher.countDocuments({ status: 'verified' }),
            Phone.countDocuments({ isSpam: true }),

            TuitionApply.find()
                .sort({ _id: -1 })
                .limit(3)
                .select('name tuitionCode premiumCode status'),

            RegTeacher.find()
                .sort({ _id: -1 })
                .limit(3)
                .select('name phone status'),

            TeacherPayment.find()
                .sort({ _id: -1 })
                .limit(3)
                .select('tuitionCode paymentNumber personalPhone amount status'),

            RefundPayment.find()
                .sort({ _id: -1 })
                .limit(3)
                .select('tuitionCode paymentNumber personalPhone amount status'),

            TuitionApply.aggregate([
                {
                    $group: {
                        _id: { $month: "$appliedAt" },
                        applications: { $sum: 1 }
                    }
                }
            ]),

            TuitionApply.aggregate([
                {
                    $group: {
                        _id: "$status",
                        value: { $sum: 1 }
                    }
                }
            ]),

            TeacherPayment.aggregate([
                {
                    $match: { status: "received" }
                },
                {
                    $group: {
                        _id: { $month: "$requestedAt" },
                        payments: { $sum: "$amount" }
                    }
                }
            ]),

            RefundPayment.aggregate([
                {
                    $group: {
                        _id: { $month: "$requestedAt" },
                        refunds: { $sum: "$amount" }
                    }
                }
            ])
        ]);

        const months = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];

        const monthlyTuitionApplications = months.map((month, index) => {
            const found = monthlyTuitions.find(m => m._id === index + 1);
            return { month, applications: found ? found.applications : 0 };
        });

        const applicationStatusBreakdown = statusBreakdown.map(s => ({
            name: s._id.charAt(0).toUpperCase() + s._id.slice(1),
            value: s.value
        }));

        const monthlyPaymentInflow = months.map((month, index) => {
            const found = monthlyPayments.find(p => p._id === index + 1);
            return { month, payments: found ? found.payments : 0 };
        });

        const refundTrends = months.map((month, index) => {
            const found = monthlyRefunds.find(r => r._id === index + 1);
            return { month, refunds: found ? found.refunds : 0 };
        });

        const dashboardData = {
            summaryData: {
                totalTuitions,
                activeTuitions,
                pendingTuitionApps,
                totalBest,
                totalTeachers,
                totalSpam,
            },
            recentTuitionApplications,
            recentTeacherApplications,
            recentTeacherPayments,
            refundRequests,
            monthlyTuitionApplications,
            applicationStatusBreakdown,
            monthlyPaymentInflow,
            refundTrends
        };

        res.json(dashboardData);
    } catch (err) {
        console.error("Dashboard Error:", err);
        res.status(500).json({ message: "Failed to load dashboard data" });
    }
});


module.exports = router;
