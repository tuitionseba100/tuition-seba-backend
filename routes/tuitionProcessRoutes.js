const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Tuition = require('../models/Tuition');
const TuitionApply = require('../models/TuitionApply');
const StatusHistory = require('../models/StatusHistory');
const Payment = require('../models/Payment');
const { logActivity } = require('../utils/activityLogger');
const { logStatusChange } = require('../utils/statusLogger');

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

const formatTimeAgo = (date) => {
    if (!date) return 'N/A';
    const now = new Date();
    const diffMs = now - new Date(date);
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffDay > 0) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
    if (diffHour > 0) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
    if (diffMin > 0) return `${diffMin} min${diffMin > 1 ? 's' : ''} ago`;
    return 'Just now';
};

// GET /api/tuition-process/:id - Fetch computed lifecycle state & complete timeline
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const tuition = await Tuition.findById(req.params.id).lean();
        if (!tuition) {
            return res.status(404).json({ message: 'Tuition not found' });
        }

        // Fetch related records in parallel
        const [applicants, statusHistory, payments] = await Promise.all([
            TuitionApply.find({ tuitionCode: tuition.tuitionCode, isSoftDelete: { $ne: true } })
                .select('name phone status createdAt premiumCode institute')
                .sort({ createdAt: -1 })
                .lean(),
            StatusHistory.find({ tuitionCode: tuition.tuitionCode })
                .sort({ timestamp: -1 })
                .limit(40)
                .lean(),
            Payment.find({ tuitionCode: tuition.tuitionCode })
                .select('paymentStatus totalPaymentTk receivedTk duePayment createdAt paymentReceivedDate')
                .lean()
        ]);

        const status = (tuition.status || '').toLowerCase().trim();
        const isPublish = !!tuition.isPublish;
        const now = new Date();
        const postedAt = tuition.lastPublishedDate || tuition.createdAt;
        const hoursSincePosted = postedAt ? Math.round((now - new Date(postedAt)) / (1000 * 60 * 60)) : 0;

        const lastActionAt = tuition.lastActionAt || tuition.lastUpdate || tuition.updatedAt || tuition.createdAt;
        const idleHours = lastActionAt ? Math.round((now - new Date(lastActionAt)) / (1000 * 60 * 60)) : 0;

        const pendingApplicants = applicants.filter(a => (a.status || 'pending').toLowerCase() === 'pending');
        const appliedCount = applicants.length;

        // Compute step (1 through 8) and condition based on Mehedi vai's specification
        let step = 1;
        let stepName = 'Step 1: Intake & Availability';
        let conditionTitle = 'New / Unverified';
        let conditionBadge = 'secondary';
        let conditionDesc = 'Guardian request is recorded but not yet published to tutors.';
        let nextStepTitle = 'Verify with Guardian & Publish';
        let nextStepDesc = 'Call guardian to confirm class, subjects, salary, location, and publish.';
        let nextActionKey = 'verify_publish';
        let isStalled = false;

        // Step 8: Cancelled
        if (status === 'cancel') {
            step = 8;
            stepName = 'Step 8: Cancelled';
            conditionTitle = 'Tuition Cancelled';
            conditionBadge = 'danger';
            conditionDesc = `Cancellation Reason: ${tuition.cancelReasonStructured || tuition.tuitionCancelReason || 'Not specified'}`;
            nextStepTitle = '7-Day Follow-Up Scheduled';
            nextStepDesc = 'Check back with guardian if tutor requirement resurfaces.';
            nextActionKey = 'recheck_guardian';
        }
        // Step 6 & 7: Confirmed, Payment & Active
        else if (status === 'confirm') {
            const hasPaid = payments.some(p => (p.paymentStatus || '').toLowerCase() === 'paid');
            if (!tuition.isPaymentCreated && !hasPaid) {
                step = 6;
                stepName = 'Step 6: Payment Pending';
                conditionTitle = 'Confirmed — Payment Voucher Pending';
                conditionBadge = 'warning';
                conditionDesc = `Tutor (${tuition.tutorNumber || 'Confirmed'}) finalized. Media fee payment voucher must be created.`;
                nextStepTitle = 'Create Payment Voucher in Finance';
                nextStepDesc = 'Generate teacher media fee invoice and send payment guidelines.';
                nextActionKey = 'create_payment';
            } else {
                step = 7;
                stepName = 'Step 7: Active Tutoring';
                conditionTitle = 'Active Tutoring & Running';
                conditionBadge = 'success';
                conditionDesc = 'Tuition is running actively. Periodic 30-day guardian follow-up scheduled.';
                nextStepTitle = 'Conduct Monthly Follow-Up';
                nextStepDesc = 'Check student progress and guardian satisfaction rating.';
                nextActionKey = 'add_followup';
            }
        }
        // Step 5: Screened, Contact Shared or Demo Running
        else if (['given number', 'guardian meet', 'demo class running', '1st demo class', '2nd demo class'].includes(status)) {
            step = 5;
            stepName = 'Step 5: Screening & Demo Class';
            if (status === 'given number') {
                conditionTitle = 'Contact Shared with Tutor & Guardian';
                conditionBadge = 'info';
                conditionDesc = `Contact exchanged (Tutor: ${tuition.tutorNumber || '-'}). Awaiting demo class schedule.`;
                nextStepTitle = 'Confirm Demo Schedule';
                nextStepDesc = 'Call tutor & guardian to schedule date for 1st demo class.';
                nextActionKey = 'start_demo';
            } else {
                conditionTitle = `Demo Class in Progress (${tuition.status})`;
                conditionBadge = 'primary';
                conditionDesc = `Teacher is conducting demo class. Immediate guardian review needed after demo.`;
                nextStepTitle = 'Call Guardian for Demo Feedback';
                nextStepDesc = 'Check if guardian finalized the tutor or if replacement is required.';
                nextActionKey = 'demo_feedback';
            }
        }
        // Step 5 Fork: Demo Failed / Returned to Available
        else if (tuition.subStatus === 'demo_failed') {
            step = 5;
            stepName = 'Step 5: Demo Feedback & Checking';
            conditionTitle = 'Demo Failed (Returned to Available)';
            conditionBadge = 'warning';
            conditionDesc = `Previous teacher discontinued. Notes: ${tuition.comment1 || tuition.lastUpdateComment || 'Reviewing root cause'}.`;
            nextStepTitle = 'Assign New Candidate or Optimize';
            nextStepDesc = 'Screen another applicant or negotiate parameters with guardian.';
            nextActionKey = 'assign_new_candidate';
        }
        // Step 5: Applicant Waiting for Review
        else if (status === 'available' && pendingApplicants.length > 0) {
            step = 5;
            stepName = 'Step 5: Applicant Screening';
            conditionTitle = `${pendingApplicants.length} Teacher Application(s) Waiting`;
            conditionBadge = 'danger';
            conditionDesc = 'Verified teachers have submitted applications. Screen qualifications and send CV.';
            nextStepTitle = 'Review CV & Pitch to Guardian';
            nextStepDesc = 'Review top teacher candidate and send tutor profile/CV to guardian.';
            nextActionKey = 'review_cv';
        }
        // Step 3 & 4: Stalled, Proposals & Optimization Loop
        else if (status === 'available' && isPublish && tuition.isProposal) {
            step = 3;
            stepName = 'Step 3: Proposals Sent';
            conditionTitle = 'Targeted SMS Proposals Sent';
            conditionBadge = 'info';
            conditionDesc = 'Proposals sent to verified teachers in area. Monitoring tutor applications.';
            nextStepTitle = 'Guardian Negotiation & Optimization';
            nextStepDesc = 'If no application in 12h, call guardian to adjust salary, days, or media fee discount.';
            nextActionKey = 'optimize_parameters';
        }
        else if (status === 'available' && isPublish && appliedCount === 0 && hoursSincePosted >= 18) {
            step = 3;
            stepName = 'Step 3: Stalled (No Applications)';
            conditionTitle = `No Applicants for ${hoursSincePosted} Hours`;
            conditionBadge = 'warning';
            conditionDesc = 'Tuition is live but has received zero applicants within SLA threshold.';
            nextStepTitle = 'Send Targeted SMS Proposals';
            nextStepDesc = 'Broadcast SMS proposals to verified tutors matching area & subjects.';
            nextActionKey = 'send_proposal';
            isStalled = true;
        }
        // Step 2: Promotion / Social Broadcast
        else if (status === 'available' && isPublish && (tuition.subStatus === 'posted' || tuition.lastPublishedDate)) {
            step = 2;
            stepName = 'Step 2: Social Promotion';
            conditionTitle = 'Posted on WhatsApp / Facebook';
            conditionBadge = 'primary';
            conditionDesc = `Broadcasted to community channels (${hoursSincePosted}h ago). Monitoring tutor applications.`;
            nextStepTitle = 'Wait for Applicants or Send Proposals';
            nextStepDesc = 'Review applicant influx. If stalled after 18h, send targeted proposals.';
            nextActionKey = 'monitor_post';
        }
        // Step 1: Available but not yet posted
        else if (status === 'available' && isPublish) {
            step = 1;
            stepName = 'Step 1: Intake & Availability';
            conditionTitle = 'Verified & Available (Needs Social Post)';
            conditionBadge = 'info';
            conditionDesc = 'Tuition is live on website. Now broadcast to Facebook & WhatsApp groups.';
            nextStepTitle = 'Generate Poster & Share';
            nextStepDesc = 'Create social poster and share to WhatsApp community & FB page.';
            nextActionKey = 'generate_poster';
        }

        // Build unified audit timeline
        const timeline = [];

        // 1. Status history entries
        statusHistory.forEach(sh => {
            timeline.push({
                type: 'status_change',
                title: `Status Changed: ${sh.oldStatus || 'Initial'} → ${sh.newStatus}`,
                detail: `Updated by ${sh.changedBy}`,
                timestamp: sh.timestamp,
                user: sh.changedBy,
                badgeVariant: 'primary'
            });
        });

        // 2. Follow-ups
        if (Array.isArray(tuition.confirmationFollowUps)) {
            tuition.confirmationFollowUps.forEach(fu => {
                timeline.push({
                    type: 'follow_up',
                    title: 'Follow-Up Logged',
                    detail: fu.lastFollowUpComment || fu.guardianFeedback || 'Follow-up completed',
                    timestamp: fu.createdAt || fu.lastFollowUpDate,
                    user: fu.createdBy || 'Agent',
                    badgeVariant: 'info'
                });
            });
        }

        // 3. Applications
        applicants.forEach(app => {
            timeline.push({
                type: 'application',
                title: `Teacher Applied: ${app.name} (${app.premiumCode || 'Standard'})`,
                detail: `Phone: ${app.phone} | Status: ${app.status}`,
                timestamp: app.createdAt,
                user: 'Teacher',
                badgeVariant: 'secondary'
            });
        });

        // 4. Payments
        payments.forEach(p => {
            timeline.push({
                type: 'payment',
                title: `Payment: ${p.paymentStatus || 'Created'} (Tk ${p.receivedTk || 0} / ${p.totalPaymentTk || 0})`,
                detail: `Recorded in finance`,
                timestamp: p.paymentReceivedDate || p.createdAt,
                user: 'Accounts',
                badgeVariant: 'success'
            });
        });

        // Sort timeline descending by timestamp
        timeline.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.json({
            tuition: {
                _id: tuition._id,
                tuitionCode: tuition.tuitionCode,
                status: tuition.status,
                subStatus: tuition.subStatus,
                isPublish: tuition.isPublish,
                isProposal: tuition.isProposal,
                student: tuition.student,
                class: tuition.class,
                subject: tuition.subject,
                salary: tuition.salary,
                day: tuition.day,
                time: tuition.time,
                location: tuition.location,
                area: tuition.area,
                guardianNumber: tuition.guardianNumber,
                tutorNumber: tuition.tutorNumber,
                mediaFee: tuition.mediaFee,
                assignedTo: tuition.assignedTo,
                lastAvailableCheck: tuition.lastAvailableCheck,
                lastPublishedDate: tuition.lastPublishedDate,
                lastUpdate: tuition.lastUpdate,
                lastUpdateComment: tuition.lastUpdateComment,
                nextUpdateDate: tuition.nextUpdateDate,
                nextUpdateComment: tuition.nextUpdateComment,
                comment1: tuition.comment1,
                comment2: tuition.comment2,
                tuitionCancelReason: tuition.tuitionCancelReason,
                cancelReasonStructured: tuition.cancelReasonStructured
            },
            lifecycle: {
                step,
                stepName,
                conditionTitle,
                conditionBadge,
                conditionDesc,
                isStalled,
                lastAction: {
                    name: tuition.lastActionName || 'Tuition Record Created / Updated',
                    at: lastActionAt,
                    by: tuition.lastActionBy || tuition.updatedBy || tuition.createdBy || 'System',
                    timeAgo: formatTimeAgo(lastActionAt),
                    idleHours
                },
                recommendedNextStep: {
                    title: nextStepTitle,
                    description: nextStepDesc,
                    actionKey: nextActionKey
                },
                stats: {
                    totalApplicants: appliedCount,
                    pendingApplicants: pendingApplicants.length,
                    hoursSincePosted,
                    idleHours
                }
            },
            applicants: applicants.slice(0, 10),
            timeline: timeline.slice(0, 25)
        });
    } catch (err) {
        console.error('Error fetching tuition process state:', err);
        res.status(500).json({ message: err.message });
    }
});

// POST /api/tuition-process/action/:id - Execute an action and update lifecycle
router.post('/action/:id', authMiddleware, async (req, res) => {
    try {
        const { action, payload = {} } = req.body;
        if (!action) {
            return res.status(400).json({ message: 'Action identifier is required' });
        }

        const oldTuition = await Tuition.findById(req.params.id);
        if (!oldTuition) {
            return res.status(404).json({ message: 'Tuition not found' });
        }

        const username = req.user?.username || req.headers['x-user-name'] || 'Agent';
        const now = new Date();
        const updateData = {
            lastActionAt: now,
            lastActionBy: username,
            updatedBy: username,
            lastUpdate: now
        };

        let actionLogName = 'Process Action Executed';
        let newStatus = oldTuition.status;

        switch (action) {
            case 'verify_guardian':
                updateData.isPublish = true;
                updateData.lastAvailableCheck = now;
                updateData.subStatus = 'verified';
                actionLogName = 'Verified Guardian & Published';
                break;

            case 'mark_posted':
                updateData.isPublish = true;
                updateData.lastPublishedDate = now;
                updateData.subStatus = 'posted';
                actionLogName = 'Broadcasted to WhatsApp & Facebook';
                break;

            case 'mark_proposal_sent':
                updateData.isProposal = true;
                updateData.subStatus = 'proposal_sent';
                actionLogName = 'Sent Targeted SMS Proposals to Tutors';
                break;

            case 'send_cv_guardian':
                updateData.subStatus = 'cv_sent';
                actionLogName = `Tutor Profile / CV Sent to Guardian (${payload.tutorNumber || payload.teacherName || ''})`;
                if (payload.tutorNumber) updateData.tutorNumber = payload.tutorNumber;
                break;

            case 'contact_shared':
                newStatus = 'given number';
                updateData.status = 'given number';
                updateData.subStatus = 'contact_shared';
                if (payload.tutorNumber) updateData.tutorNumber = payload.tutorNumber;
                actionLogName = `Contact Shared with Tutor (${payload.tutorNumber || oldTuition.tutorNumber || ''})`;
                break;

            case 'start_demo':
                newStatus = 'demo class running';
                updateData.status = 'demo class running';
                updateData.subStatus = 'demo_running';
                actionLogName = 'Demo Class Started / Scheduled';
                if (payload.demoDate) {
                    updateData.nextUpdateDate = new Date(payload.demoDate);
                    updateData.nextUpdateComment = 'Check demo class feedback with guardian';
                }
                break;

            case 'demo_failed':
                newStatus = 'available';
                updateData.status = 'available';
                updateData.subStatus = 'demo_failed';
                // Move current tutor to comment1
                if (oldTuition.tutorNumber) {
                    updateData.comment1 = `Failed Tutor: ${oldTuition.tutorNumber} - Reason: ${payload.reason || 'Guardian rejected'}`;
                }
                updateData.lastUpdateComment = payload.reason || 'Demo class failed - returned to available';
                actionLogName = `Demo Failed: ${payload.reason || 'Discontinued'} — Returned to Available`;
                break;

            case 'confirm_tuition':
                newStatus = 'confirm';
                updateData.status = 'confirm';
                updateData.assignedTo = 'TSF';
                updateData.subStatus = 'confirmed';
                actionLogName = `Tuition Confirmed with Tutor (${payload.tutorNumber || oldTuition.tutorNumber || ''})`;
                if (payload.tutorNumber) updateData.tutorNumber = payload.tutorNumber;
                break;

            case 'cancel_tuition':
                newStatus = 'cancel';
                updateData.status = 'cancel';
                updateData.cancelReasonStructured = payload.reason || 'Others';
                updateData.tuitionCancelReason = payload.reason || 'Cancelled';
                updateData.subStatus = 'cancelled';
                const sevenDaysLater = new Date();
                sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
                updateData.nextUpdateDate = sevenDaysLater;
                updateData.nextUpdateComment = 'Check if guardian requires a tutor again';
                actionLogName = `Cancelled: ${payload.reason || 'No Reason Given'}`;
                break;

            case 'custom_note':
                if (payload.note) updateData.agentComment = payload.note;
                if (payload.subStatus) updateData.subStatus = payload.subStatus;
                actionLogName = `Agent Note: ${payload.note || 'Updated'}`;
                break;

            default:
                actionLogName = `Action: ${action}`;
                break;
        }

        updateData.lastActionName = actionLogName;

        const updatedTuition = await Tuition.findByIdAndUpdate(req.params.id, updateData, { new: true });

        // Log status change if status changed
        if (newStatus && newStatus !== oldTuition.status) {
            await logStatusChange(req, 'Tuition', updatedTuition._id, oldTuition.status, newStatus, updatedTuition.tuitionCode, username);
        }

        await logActivity(req, 'ProcessAction', 'Tuition', updatedTuition._id, {
            action,
            actionLogName,
            importantFields: { tuitionCode: updatedTuition.tuitionCode, actionLogName }
        });

        res.json({
            success: true,
            message: actionLogName,
            tuition: updatedTuition
        });
    } catch (err) {
        console.error('Error executing tuition process action:', err);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
