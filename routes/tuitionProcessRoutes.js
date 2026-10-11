const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Tuition = require('../models/Tuition');
const TuitionApply = require('../models/TuitionApply');
const StatusHistory = require('../models/StatusHistory');
const Payment = require('../models/Payment');
const { logStatusChange } = require('../utils/statusLogger');
const { logActivity } = require('../utils/activityLogger');

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

/**
 * GET /api/tuition-process/:tuitionId
 * Retrieves full lifecycle state, status history, applicants, and payment records for the process flow
 */
router.get('/:tuitionId', authMiddleware, async (req, res) => {
    try {
        const { tuitionId } = req.params;
        const tuition = await Tuition.findById(tuitionId).lean();
        if (!tuition) {
            return res.status(404).json({ message: 'Tuition not found' });
        }

        const tuitionCode = tuition.tuitionCode;

        // Fetch related data in parallel
        const [applicants, statusHistory, payment] = await Promise.all([
            TuitionApply.find({ tuitionCode }).sort({ createdAt: -1 }).lean(),
            StatusHistory.find({ 
                $or: [
                    { resourceId: tuitionId.toString() },
                    { tuitionCode: tuitionCode }
                ]
            }).sort({ timestamp: -1 }).lean(),
            Payment.findOne({ tuitionCode }).lean()
        ]);

        // Find key history events
        const createdEvent = {
            timestamp: tuition.createdAt,
            changedBy: tuition.createdBy || 'System'
        };

        const availableEvents = statusHistory.filter(h => 
            h.newStatus?.toLowerCase() === 'available'
        );

        const hasDemoClassHistory = statusHistory.some(h => 
            h.newStatus?.toLowerCase().includes('demo') || 
            h.subStatus?.toLowerCase().includes('demo')
        );

        const backAvailableEvents = statusHistory.filter(h => 
            h.newStatus?.toLowerCase() === 'available' && 
            (h.oldStatus?.toLowerCase().includes('demo') || 
             h.oldStatus?.toLowerCase().includes('given number') || 
             h.subStatus?.toLowerCase().includes('demo_failed') ||
             h.subStatus?.toLowerCase().includes('demo failed'))
        );

        const cvSentEvents = statusHistory.filter(h => 
            h.newStatus?.toLowerCase() === 'cv sent' || 
            h.subStatus?.toLowerCase() === 'call guardian to check if liked any cv'
        );

        const contactSharedEvents = statusHistory.filter(h => 
            h.newStatus?.toLowerCase() === 'given number' || 
            h.newStatus?.toLowerCase() === 'contact shared'
        );

        const confirmEvents = statusHistory.filter(h => 
            h.newStatus?.toLowerCase() === 'confirm'
        );

        const requestPaymentEvents = statusHistory.filter(h => 
            h.newStatus?.toLowerCase() === 'request for payment'
        );

        // Compute current lifecycle step based on photo flow:
        // Available -> Post -> [ Not Apply -> Proposal -> Optimization -> New Create ]
        //                   [ Apply -> CV sent -> Call Guardian -> Contact share -> Demo -> [ Back Available -> Checking -> New Create / Payment Pending -> Payment Complete ] ]
        // Cancel -> Reason
        let flowBranch = 'initial'; // 'not_apply' | 'apply'
        if (applicants.length > 0) {
            flowBranch = 'apply';
        } else if (tuition.isProposal || tuition.subStatus?.toLowerCase().includes('proposal')) {
            flowBranch = 'not_apply';
        }

        // Latest action details
        const latestHistory = statusHistory.length > 0 ? statusHistory[0] : null;
        const lastAction = {
            status: latestHistory ? latestHistory.newStatus : tuition.status,
            subStatus: latestHistory ? latestHistory.subStatus : (tuition.subStatus || ''),
            comment: latestHistory ? latestHistory.comment : '',
            changedBy: latestHistory ? latestHistory.changedBy : (tuition.updatedBy || tuition.createdBy || 'System'),
            timestamp: latestHistory ? latestHistory.timestamp : (tuition.updatedAt || tuition.createdAt)
        };

        const responseData = {
            tuition,
            applicantsCount: applicants.length,
            applicants: applicants.map(a => ({
                _id: a._id,
                name: a.name,
                phone: a.phone,
                premiumCode: a.premiumCode,
                status: a.status,
                createdAt: a.createdAt
            })),
            history: statusHistory,
            paymentInfo: payment ? {
                paymentStatus: payment.paymentStatus,
                totalPaymentTk: payment.totalPaymentTk,
                receivedTk: payment.receivedTk,
                duePayment: payment.duePayment,
                paymentReceivedDate: payment.paymentReceivedDate
            } : null,
            computedSummary: {
                flowBranch,
                isCreated: true,
                createdAt: createdEvent.timestamp,
                createdBy: createdEvent.changedBy,
                isAvailable: tuition.status?.toLowerCase() === 'available',
                isPublished: !!tuition.isPublish,
                lastPublishedDate: tuition.lastPublishedDate,
                hasApplicants: applicants.length > 0,
                isProposal: !!tuition.isProposal,
                isCvSent: tuition.status?.toLowerCase() === 'cv sent' || cvSentEvents.length > 0,
                isContactShared: tuition.status?.toLowerCase() === 'given number' || contactSharedEvents.length > 0,
                hasDemoRun: hasDemoClassHistory,
                isBackAvailable: backAvailableEvents.length > 0,
                isConfirmed: tuition.status?.toLowerCase() === 'confirm' || confirmEvents.length > 0,
                isRequestForPayment: tuition.status?.toLowerCase() === 'request for payment' || requestPaymentEvents.length > 0,
                isPaymentCompleted: payment && (payment.paymentStatus?.toLowerCase() === 'paid' || (Number(payment.receivedTk || 0) >= Number(payment.totalPaymentTk || 0) && Number(payment.totalPaymentTk || 0) > 0)),
                isCancelled: tuition.status?.toLowerCase() === 'cancel',
                lastAction
            }
        };

        res.json(responseData);
    } catch (err) {
        console.error('Error in tuition process route:', err);
        res.status(500).json({ message: err.message });
    }
});

/**
 * POST /api/tuition-process/status-change/:tuitionId
 * Updates the process status / subStatus, logs transition comment to StatusHistory (NOT bloated in Tuition table!)
 */
router.post('/status-change/:tuitionId', authMiddleware, async (req, res) => {
    try {
        const { tuitionId } = req.params;
        const { status, subStatus, comment, tutorNumber, cancelReason } = req.body;

        const tuition = await Tuition.findById(tuitionId);
        if (!tuition) {
            return res.status(404).json({ message: 'Tuition not found' });
        }

        const oldStatus = tuition.status || '';
        const oldSubStatus = tuition.subStatus || '';
        const changedBy = (req.user && (req.user.username || req.user.name)) || req.headers['x-user-name'] || 'System';

        // Prepare updates on Tuition table
        const updateFields = {
            updatedBy: changedBy,
            lastUpdate: new Date()
        };

        if (status) {
            updateFields.status = status;
        }

        if (subStatus !== undefined) {
            updateFields.subStatus = subStatus;
        }

        if (tutorNumber) {
            updateFields.tutorNumber = tutorNumber;
        }

        // Special handling for Cancel
        if (status?.toLowerCase() === 'cancel') {
            if (cancelReason) {
                updateFields.tuitionCancelReason = cancelReason;
            }
            const sevenDaysLater = new Date();
            sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
            updateFields.nextUpdateDate = sevenDaysLater;
            updateFields.nextUpdateComment = 'Check if guardian requires teacher again';
        }

        // Special handling for Confirm
        if (status?.toLowerCase() === 'confirm') {
            updateFields.assignedTo = 'TSF';
            const oneMonthLater = new Date();
            oneMonthLater.setDate(oneMonthLater.getDate() + 30);
            updateFields.$push = {
                confirmationFollowUps: {
                    lastFollowUpDate: new Date(),
                    lastFollowUpComment: `Confirmed with tutor ${tutorNumber || tuition.tutorNumber || ''}`,
                    nextFollowUpDate: oneMonthLater,
                    nextFollowUpComment: "Check tutor teaching performance & feedback",
                    createdBy: changedBy,
                    createdAt: new Date()
                }
            };
        }

        // Special handling for Demo Class Failed
        if (status?.toLowerCase() === 'demo class failed') {
            if (tuition.tutorNumber) {
                updateFields.comment1 = `Failed Tutor: ${tuition.tutorNumber} - ${comment || 'Demo class failed'}`;
            }
        }

        // Special handling for Back to Available (Demo Failed)
        if (status?.toLowerCase() === 'available' && (oldStatus?.toLowerCase().includes('demo') || oldStatus?.toLowerCase() === 'given number')) {
            if (tuition.tutorNumber) {
                updateFields.comment1 = `Failed Tutor: ${tuition.tutorNumber} - ${comment || 'Demo failed'}`;
            }
            if (tuition.previousAssignedTo) {
                updateFields.assignedTo = tuition.previousAssignedTo;
            }
        }

        const updatedTuition = await Tuition.findByIdAndUpdate(tuitionId, updateFields, { new: true });

        // IMPORTANT: Save comment and subStatus in StatusHistory!
        // This ensures the comment is logged chronologically without overwriting the Tuition document.
        await logStatusChange(
            req,
            'Tuition',
            tuition._id,
            oldStatus,
            status || oldStatus,
            tuition.tuitionCode,
            changedBy,
            comment || '',
            subStatus || oldSubStatus
        );

        await logActivity(req, 'Edit', 'Tuition', tuition._id, {
            importantFields: { 
                tuitionCode: tuition.tuitionCode,
                statusChange: `${oldStatus} -> ${status || oldStatus}`,
                subStatus: subStatus || '',
                comment: comment || ''
            }
        });

        // Fetch refreshed history for immediate modal update
        const updatedHistory = await StatusHistory.find({ 
            $or: [
                { resourceId: tuitionId.toString() },
                { tuitionCode: tuition.tuitionCode }
            ]
        }).sort({ timestamp: -1 }).lean();

        res.json({
            message: 'Status updated successfully',
            tuition: updatedTuition,
            history: updatedHistory
        });
    } catch (err) {
        console.error('Error changing tuition process status:', err);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
