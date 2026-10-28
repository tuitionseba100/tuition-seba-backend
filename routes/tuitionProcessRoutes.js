const express = require('express');
const router = express.Router();
const Tuition = require('../models/Tuition');
const TuitionApply = require('../models/TuitionApply');
const StatusHistory = require('../models/StatusHistory');
const Payment = require('../models/Payment');
const Settings = require('../models/Settings');
const { logStatusChange } = require('../utils/statusLogger');
const { logActivity } = require('../utils/activityLogger');
const { authMiddleware } = require('../middleware/auth');

const getLeastAssignedUser = async (userList) => {
    if (!userList || userList.length === 0) return null;
    if (userList.length === 1) return userList[0];

    const counts = await Promise.all(userList.map(async (user) => {
        const count = await Tuition.countDocuments({
            assignedTo: user,
            isSoftDelete: { $ne: true },
            status: { $nin: ['cancel', 'confirm'] }
        });
        return { user, count };
    }));

    counts.sort((a, b) => a.count - b.count);

    const minCount = counts[0].count;
    const candidates = counts.filter(c => c.count === minCount);

    if (candidates.length > 1) {
        const randomIndex = Math.floor(Math.random() * candidates.length);
        return candidates[randomIndex].user;
    }

    return counts[0].user;
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
            h.newStatus?.toLowerCase() === 'cv sent - check if liked' ||
            h.newStatus?.toLowerCase() === 'cv sent - liked' ||
            h.subStatus?.toLowerCase() === 'call guardian to check if liked any cv' ||
            h.subStatus?.toLowerCase() === 'cv sent - liked'
        );

        const cvLikedEvents = statusHistory.filter(h => 
            h.newStatus?.toLowerCase() === 'cv sent - liked' ||
            h.subStatus?.toLowerCase() === 'cv sent - liked' ||
            h.subStatus?.toLowerCase() === 'guardian_liked_cv'
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
                isCvLiked: tuition.status?.toLowerCase() === 'cv sent - liked' || cvLikedEvents.length > 0,
                isContactShared: tuition.status?.toLowerCase() === 'given number' || contactSharedEvents.length > 0,
                hasDemoRun: hasDemoClassHistory,
                isBackAvailable: backAvailableEvents.length > 0,
                isConfirmed: tuition.status?.toLowerCase() === 'confirm' || confirmEvents.length > 0,
                isRequestForPayment: tuition.status?.toLowerCase() === 'request for payment' || requestPaymentEvents.length > 0,
                isPaymentCompleted: (payment && (payment.paymentStatus?.toLowerCase() === 'paid' || (Number(payment.receivedTk || 0) >= Number(payment.totalPaymentTk || 0) && Number(payment.totalPaymentTk || 0) > 0))) || tuition.status?.toLowerCase() === 'payment completed' || tuition.status?.toLowerCase() === 'payment complete',
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

        const newStatus = status ? status.toLowerCase() : null;
        const oldStatusNormalized = tuition.status ? tuition.status.toLowerCase() : null;

        if (status && status !== tuition.status) {
            updateFields.statusChangedAt = new Date();
        }

        if (newStatus && newStatus !== oldStatusNormalized) {
            // 1. Confirm -> TSF
            if (newStatus === 'confirm') {
                updateFields.assignedTo = 'TSF';
                const oneMonthLater = new Date();
                oneMonthLater.setDate(oneMonthLater.getDate() + 30);

                const teacherNum = tutorNumber || tuition.tutorNumber || '-';
                const initialFollowUp = {
                    lastFollowUpDate: new Date(),
                    lastFollowUpComment: `টিউশনটি কনফার্ম করা হয়েছে এবং এই টিচারটি দেওয়া হয়েছে (${teacherNum})`,
                    nextFollowUpDate: oneMonthLater,
                    nextFollowUpComment: "শিক্ষক কেমন পড়াচ্ছেন ফিডব্যাক নিন - system generated",
                    createdBy: changedBy || 'System',
                    createdAt: new Date()
                };
                updateFields.$push = { confirmationFollowUps: initialFollowUp };
            }
            // 2. Cancel -> Cancel Setting + Scheduling
            else if (newStatus === 'cancel') {
                const setting = await Settings.findOne({ key: 'cancel_status_change_auto_assign_user' });
                if (setting && setting.value && setting.value.length > 0) {
                    const userList = Array.isArray(setting.value) ? setting.value : [setting.value];
                    const nextUser = await getLeastAssignedUser(userList);
                    if (nextUser) updateFields.assignedTo = nextUser;
                }

                if (cancelReason) {
                    updateFields.cancellationReason = cancelReason;
                }

                // Follow-up scheduling
                const sevenDaysLater = new Date();
                sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
                updateFields.nextUpdateDate = sevenDaysLater;
                updateFields.nextUpdateComment = "teacher lagbe kina dekhen - system generated";
            }
            // 3. Guardian No Response -> Guardian No Response Setting
            else if (newStatus === 'guardian no response') {
                const setting = await Settings.findOne({ key: 'guardian_no_response_status_change_auto_assign_user' });
                if (setting && setting.value && setting.value.length > 0) {
                    const userList = Array.isArray(setting.value) ? setting.value : [setting.value];
                    const nextUser = await getLeastAssignedUser(userList);
                    if (nextUser) updateFields.assignedTo = nextUser;
                }
            }
            // 4. Progressive statuses -> Status Change Setting
            else if (['given number', 'guardian meet', 'demo class running', '1st demo class', '2nd demo class'].includes(newStatus)) {
                const setting = await Settings.findOne({ key: 'status_change_auto_assign_user' });
                if (setting && setting.value && setting.value.length > 0) {
                    const userList = Array.isArray(setting.value) ? setting.value : [setting.value];
                    const nextUser = await getLeastAssignedUser(userList);
                    if (nextUser) updateFields.assignedTo = nextUser;
                }
            }
            // 5. Back to Available -> Restore previous assigned user
            else if (newStatus === 'available' && ['given number', 'guardian meet', 'demo class running', '1st demo class', '2nd demo class', 'guardian no response'].includes(oldStatusNormalized)) {
                if (tuition.previousAssignedTo) {
                    updateFields.assignedTo = tuition.previousAssignedTo;
                }
                if (tuition.tutorNumber) {
                    updateFields.comment1 = `Failed Tutor: ${tuition.tutorNumber} - ${comment || 'Demo failed'}`;
                }
            }
        }

        // Special handling for Demo Class Failed
        if (newStatus === 'demo class failed') {
            if (tuition.tutorNumber) {
                updateFields.comment1 = `Failed Tutor: ${tuition.tutorNumber} - ${comment || 'Demo class failed'}`;
            }
        }

        if (updateFields.assignedTo !== undefined && updateFields.assignedTo !== tuition.assignedTo) {
            updateFields.previousAssignedTo = tuition.assignedTo || '';
        }

        const updatedTuition = await Tuition.findByIdAndUpdate(tuitionId, updateFields, { new: true });

        // Handle auto-cancellation of tuition applications when tuition is cancelled, confirmed, or suspended
        const triggerStatus = status ? status.toLowerCase() : null;
        if (triggerStatus && ['confirm', 'cancel', 'suspended', 'suspend'].includes(triggerStatus)) {
            try {
                const targetStatuses = [
                    'pending',
                    'called (interested)',
                    'called (no response)',
                    'called (guardian no response)',
                    'shortlisted',
                    'requested for payment',
                    'refer to bm',
                    'meet to office',
                    'CV Sent',
                    'CV Sent - Liked'
                ];

                let commentForTeacher = 'দুঃখিত, টিউশনটি ক্যান্সেল করা হয়েছে, আমাদের এভেইলবল অন্য টিউশনগুলোতে এপ্লাই করুন।';
                if (triggerStatus === 'confirm') {
                    commentForTeacher = 'আলহামদুলিল্লাহ, আমাদের একজন টিচার কনফার্ম হয়েছে। আমাদের এভেইলেবল টিউশনগুলো এপ্লাই করুন।';
                }

                await TuitionApply.updateMany(
                    {
                        tuitionCode: updatedTuition.tuitionCode,
                        status: { $in: targetStatuses }
                    },
                    {
                        status: 'cancelled',
                        commentForTeacher: commentForTeacher,
                        updatedBy: 'System'
                    }
                );
            } catch (applyErr) {
                console.error('Error updating tuition applications in tuitionProcessRoutes:', applyErr);
            }
        }

        // Handle progressive status triggers: given number / guardian meet / demo class running
        const progressiveStatusMessages = {
            'given number': 'টিউশনটির নাম্বার আমাদের একজন টিচারকে দেয়া হয়েছে। কোনো কারণে ওনার ক্যান্সেল হলে আমরা যোগাযোগ করবো আপনার সাথে। অন্য টিউশনগুলো এপ্লাই করুন।',
            'guardian meet': 'আমাদের একজন টিচার দেখা করতে যাবেন। কোনো কারণে ওনার ক্যান্সেল হলে আমরা যোগাযোগ করবো আপনার সাথে। অন্য টিউশনগুলো এপ্লাই করুন।',
            'demo class running': 'আমাদের একজন টিচার ডেমো ক্লাস নিচ্ছে। কোনো কারণে ওনার ক্যান্সেল হলে আমরা যোগাযোগ করবো আপনার সাথে। অন্য টিউশনগুলো এপ্লাই করুন।',
            '1st demo class': 'আমাদের একজন টিচার ডেমো ক্লাস নিচ্ছে। কোনো কারণে ওনার ক্যান্সেল হলে আমরা যোগাযোগ করবো আপনার সাথে। অন্য টিউশনগুলো এপ্লাই করুন।',
            '2nd demo class': 'আমাদের একজন টিচার ডেমো ক্লাস নিচ্ছে। কোনো কারণে ওনার ক্যান্সেল হলে আমরা যোগাযোগ করবো আপনার সাথে। অন্য টিউশনগুলো এপ্লাই করুন।',
        };

        if (triggerStatus && progressiveStatusMessages[triggerStatus]) {
            const msg = progressiveStatusMessages[triggerStatus];
            try {
                // 1. Pending → Shortlisted + set message
                await TuitionApply.updateMany(
                    {
                        tuitionCode: updatedTuition.tuitionCode,
                        status: 'pending'
                    },
                    {
                        status: 'shortlisted',
                        commentForTeacher: msg,
                        updatedBy: 'System'
                    }
                );

                // 2. Already Shortlisted → only update message, keep status
                await TuitionApply.updateMany(
                    {
                        tuitionCode: updatedTuition.tuitionCode,
                        status: 'shortlisted'
                    },
                    {
                        commentForTeacher: msg,
                        updatedBy: 'System'
                    }
                );
            } catch (applyErr) {
                console.error('Error updating tuition applications for progressive status in tuitionProcessRoutes:', applyErr);
            }
        }

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
