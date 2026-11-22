const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const BkashTransaction = require('../models/BkashTransaction');
const Payment = require('../models/Payment');
const bkashService = require('../utils/bkashService');
const { logActivity, getDifferences } = require('../utils/activityLogger');
const { authMiddleware } = require('../middleware/auth');

// Rate limiter for payment creation (prevent bot abuse)
const createPaymentLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 20, // limit each IP to 20 payment initialization requests per window
    message: { message: 'Too many payment requests from this IP. Please try again after 10 minutes.' }
});

// Helper: Normalize Bangladeshi phone number (extract last 11 digits starting with 01)
const normalizePhoneNumber = (phone) => {
    if (!phone) return '';
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length >= 11) {
        return digits.slice(-11);
    }
    return digits;
};

// Helper: Compare two phone numbers
const phonesMatch = (phoneA, phoneB) => {
    const a = normalizePhoneNumber(phoneA);
    const b = normalizePhoneNumber(phoneB);
    if (!a || !b) return false;
    return a === b;
};

/**
 * GET /api/bkash/verify-tuition
 * Public: Teacher verifies record by Tuition Code, Teacher Code (premiumCode), or Phone Number
 * Note: Does not return due amount details per user privacy & requirement.
 */
router.get('/verify-tuition', async (req, res) => {
    try {
        const identifier = (req.query.identifier || req.query.tuitionCode || '').trim();
        if (!identifier) {
            return res.status(400).json({ message: 'Tuition code, Teacher code, or registered phone number is required.' });
        }

        const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const digits = identifier.replace(/\D/g, '');

        const searchConditions = [
            { tuitionCode: { $regex: new RegExp(`^${escapeRegex(identifier)}$`, 'i') } },
            { premiumCode: { $regex: new RegExp(`^${escapeRegex(identifier)}$`, 'i') } }
        ];

        // If digits length >= 10, also match tutorNumber (by last 10 or 11 digits)
        if (digits.length >= 10) {
            const last10 = digits.slice(-10);
            searchConditions.push({ tutorNumber: { $regex: new RegExp(`${last10}$`) } });
        } else if (identifier.length >= 3) {
            searchConditions.push({ tutorNumber: { $regex: new RegExp(`^${escapeRegex(identifier)}$`, 'i') } });
        }

        // Prioritize finding an active unpaid/due payment record
        let payment = await Payment.findOne({
            $or: searchConditions,
            paymentStatus: { $ne: 'Paid' }
        }).sort({ _id: -1 }).lean();

        // Fallback to any matching payment record
        if (!payment) {
            payment = await Payment.findOne({
                $or: searchConditions
            }).sort({ _id: -1 }).lean();
        }

        if (!payment) {
            return res.status(404).json({
                message: `No record found for "${identifier}". Please check your Tuition Code, Teacher Code, or registered phone number.`
            });
        }

        // Partially mask the registered phone number for privacy
        let maskedPhone = '';
        if (payment.tutorNumber) {
            const rawPhone = normalizePhoneNumber(payment.tutorNumber);
            if (rawPhone.length === 11) {
                maskedPhone = `${rawPhone.slice(0, 3)}*****${rawPhone.slice(8)}`;
            } else {
                maskedPhone = payment.tutorNumber;
            }
        }

        res.json({
            success: true,
            tuitionCode: payment.tuitionCode,
            premiumCode: payment.premiumCode || '',
            tutorName: payment.tutorName || 'Registered Teacher',
            tutorNumber: payment.tutorNumber || '',
            maskedPhone: maskedPhone
        });
    } catch (err) {
        console.error('Error verifying teacher for bKash:', err);
        res.status(500).json({ message: 'Failed to verify teacher details. Please try again.' });
    }
});

/**
 * POST /api/bkash/create-payment
 * Public (rate-limited): Initiates a bKash Tokenized payment
 */
router.post('/create-payment', createPaymentLimiter, async (req, res) => {
    try {
        const { tuitionCode, premiumCode, teacherCode, tutorNumber, amount, callbackURL } = req.body;

        const cleanTuitionCode = (tuitionCode || '').trim();
        const cleanTeacherCode = (premiumCode || teacherCode || '').trim();
        const cleanTutorNumber = (tutorNumber || '').trim();

        // At least ONE of Tuition Code, Teacher Code, or Mobile Number is mandatory
        if (!cleanTuitionCode && !cleanTeacherCode && !cleanTutorNumber) {
            return res.status(400).json({
                message: 'টিউশন কোড, টিচার কোড অথবা মোবাইল নম্বরের যেকোনো অন্তত একটি প্রদান করা আবশ্যক।'
            });
        }

        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            return res.status(400).json({ message: 'সঠিক টাকার পরিমাণ লিখুন।' });
        }

        // Optional lookup: check if a matching Payment record exists in DB to link metadata (if any)
        let linkedPayment = null;
        try {
            const searchConditions = [];
            const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (cleanTuitionCode) {
                searchConditions.push({ tuitionCode: { $regex: new RegExp(`^${escapeRegex(cleanTuitionCode)}$`, 'i') } });
            }
            if (cleanTeacherCode) {
                searchConditions.push({ premiumCode: { $regex: new RegExp(`^${escapeRegex(cleanTeacherCode)}$`, 'i') } });
            }
            if (cleanTutorNumber) {
                const digits = cleanTutorNumber.replace(/\D/g, '');
                if (digits.length >= 10) {
                    searchConditions.push({ tutorNumber: { $regex: new RegExp(`${digits.slice(-10)}$`) } });
                }
            }

            if (searchConditions.length > 0) {
                linkedPayment = await Payment.findOne({ $or: searchConditions }).sort({ _id: -1 }).lean();
            }
        } catch (lookupErr) {
            console.warn('[bKash] Payment lookup non-fatal notice:', lookupErr.message);
        }

        // Generate a clean, unique invoice number: e.g. TSF-1741300000000-1234
        const merchantInvoiceNumber = `TSF-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

        // Call bKash Create Payment API
        // Do NOT pass the entered phone number in payerReference so bKash does not auto-populate it on the checkout screen
        const bkashResponse = await bkashService.createPayment({
            amount: numAmount,
            merchantInvoiceNumber: merchantInvoiceNumber,
            payerReference: 'TSF',
            callbackURL: callbackURL
        });

        const createdPaymentId = bkashResponse?.paymentId || bkashResponse?.paymentID;
        const checkoutURL = bkashResponse?.bkashURL || bkashResponse?.bKashURL;

        if (!bkashResponse || !createdPaymentId || !checkoutURL || (bkashResponse.statusCode && bkashResponse.statusCode !== '0000')) {
            console.error('[bKash] Create Payment API error response:', bkashResponse);
            return res.status(400).json({
                message: bkashResponse?.statusMessage || bkashResponse?.errorMessage || 'bKash payment initialization failed. Please try again.',
                errorCode: bkashResponse?.statusCode
            });
        }

        // Save transaction record to MongoDB
        const txn = new BkashTransaction({
            paymentId: createdPaymentId,
            tuitionCode: cleanTuitionCode || linkedPayment?.tuitionCode || '',
            premiumCode: cleanTeacherCode || linkedPayment?.premiumCode || '',
            tutorNumber: normalizePhoneNumber(cleanTutorNumber) || linkedPayment?.tutorNumber || '',
            tutorName: linkedPayment?.tutorName || '',
            amount: numAmount,
            currency: 'BDT',
            intent: 'sale',
            merchantInvoiceNumber: merchantInvoiceNumber,
            status: 'Initiated',
            linkedPaymentId: linkedPayment?._id || null,
            bkashResponse: bkashResponse
        });

        await txn.save();

        res.json({
            success: true,
            paymentId: createdPaymentId,
            bKashURL: checkoutURL,
            merchantInvoiceNumber: merchantInvoiceNumber
        });

    } catch (err) {
        console.error('Error initiating bKash payment:', err);
        res.status(500).json({
            message: err.response?.data?.statusMessage || err.message || 'Server error while contacting bKash.'
        });
    }
});

/**
 * POST /api/bkash/execute-payment
 * Public: Triggered when bKash redirects to the callback page with status=success.
 * Executes payment server-to-server and credits the Payment record.
 */
router.post('/execute-payment', async (req, res) => {
    try {
        const { paymentId } = req.body;

        if (!paymentId) {
            return res.status(400).json({ message: 'paymentId is required.' });
        }

        // Find transaction
        const txn = await BkashTransaction.findOne({ paymentId });
        if (!txn) {
            return res.status(404).json({ message: 'bKash transaction record not found.' });
        }

        // Idempotency: If already completed, return existing success data without double charging
        if (txn.status === 'Completed') {
            return res.json({
                success: true,
                alreadyCompleted: true,
                message: 'This payment has already been completed successfully.',
                trxId: txn.trxId,
                paymentId: txn.paymentId,
                amount: txn.amount,
                tuitionCode: txn.tuitionCode,
                premiumCode: txn.premiumCode,
                teacherCode: txn.premiumCode,
                tutorNumber: txn.tutorNumber,
                tutorName: txn.tutorName,
                payerAccount: txn.payerAccount,
                merchantInvoiceNumber: txn.merchantInvoiceNumber,
                executedAt: txn.executedAt
            });
        }

        if (txn.status === 'Failed' || txn.status === 'Cancelled') {
            return res.status(400).json({
                message: `This payment was already marked as ${txn.status}. Please start a new payment.`
            });
        }

        // Execute payment server-to-server
        let execResponse;
        try {
            execResponse = await bkashService.executePayment(paymentId);
        } catch (execErr) {
            console.error('[bKash] Execute API call timed out or failed, querying status...', execErr.message);
            // Fallback per bKash guidelines: Query Payment status if Execute times out or fails
            try {
                const queryRes = await bkashService.queryPayment(paymentId);
                txn.queryCheckedAt = new Date();
                if (queryRes && queryRes.statusCode === '0000' && queryRes.transactionStatus === 'Completed') {
                    execResponse = queryRes;
                } else {
                    throw execErr;
                }
            } catch (queryErr) {
                txn.status = 'Failed';
                txn.errorMessage = 'Execute API failed and query confirmation timed out';
                await txn.save();
                throw execErr;
            }
        }

        const trxId = execResponse?.trxID || execResponse?.trxId;
        const isCompleted = execResponse && (execResponse.transactionStatus === 'Completed' || (execResponse.statusCode === '0000' && trxId));

        // Check response validity
        if (!isCompleted || !trxId) {
            txn.status = 'Failed';
            txn.errorCode = execResponse?.statusCode || 'UNKNOWN';
            txn.errorMessage = execResponse?.statusMessage || execResponse?.errorMessage || 'Payment execution failed';
            txn.bkashResponse = execResponse;
            await txn.save();

            return res.status(400).json({
                success: false,
                message: txn.errorMessage,
                errorCode: txn.errorCode
            });
        }

        // Amount verification: ensure returned amount matches the requested amount
        const executedAmount = parseFloat(execResponse.amount);
        if (isNaN(executedAmount) || Math.abs(executedAmount - txn.amount) > 0.01) {
            console.error(`[bKash ALERT] Amount mismatch! Requested: ${txn.amount}, Executed: ${execResponse.amount}`);
            txn.status = 'Failed';
            txn.errorMessage = `Amount mismatch (Expected: ${txn.amount}, Received: ${execResponse.amount})`;
            txn.bkashResponse = execResponse;
            await txn.save();

            return res.status(400).json({
                success: false,
                message: 'Payment verification failed due to amount mismatch. Please contact support.'
            });
        }

        // Update transaction record
        txn.status = 'Completed';
        txn.trxId = trxId;
        txn.payerAccount = execResponse.payerAccount || execResponse.customerMsisdn;
        txn.payerType = execResponse.payerType;
        txn.customerMsisdn = execResponse.customerMsisdn;
        txn.executedAt = new Date();
        txn.bkashResponse = execResponse;

        /*
        // NOTE: Auto-update Payment model (fill next empty installment slot) is currently commented out per requirement.
        // DO NOT DELETE: Kept intact for future reactivation if needed.
        const payment = await Payment.findById(txn.linkedPaymentId);
        if (payment) {
            const oldPayment = payment.toObject();

            // Find next available installment slot (1 through 4)
            let slot = 1;
            if (!payment.receivedTk || payment.receivedTk === '0' || payment.receivedTk === '') {
                slot = 1;
            } else if (!payment.receivedTk2 || payment.receivedTk2 === '0' || payment.receivedTk2 === '') {
                slot = 2;
            } else if (!payment.receivedTk3 || payment.receivedTk3 === '0' || payment.receivedTk3 === '') {
                slot = 3;
            } else if (!payment.receivedTk4 || payment.receivedTk4 === '0' || payment.receivedTk4 === '') {
                slot = 4;
            } else {
                // If all 4 slots are somehow occupied, append to installment 4 amount
                slot = 4;
                console.warn(`[bKash] All 4 installment slots were occupied for payment ${payment._id}. Adding to slot 4.`);
            }

            txn.installmentSlotAssigned = slot;

            const now = new Date();
            const slotSuffix = slot === 1 ? '' : String(slot);

            // Save wallet/payment number (NOT trxId) to paymentNumber per user requirement
            const walletNumber = execResponse.payerAccount || execResponse.customerMsisdn || txn.payerAccount || txn.tutorNumber || '';

            if (slot === 4 && payment.receivedTk4 && parseFloat(payment.receivedTk4) > 0) {
                // Add to existing 4th installment
                const current4 = parseFloat(payment.receivedTk4) || 0;
                payment.receivedTk4 = String(current4 + executedAmount);
                payment.paymentType4 = 'bKash (Online)';
                payment.paymentNumber4 = walletNumber || payment.paymentNumber4;
                payment.installmentComment4 = (payment.installmentComment4 ? payment.installmentComment4 + ' | ' : '') + `bKash TrxID: ${trxId}`;
            } else {
                payment[`receivedTk${slotSuffix}`] = String(executedAmount);
                payment[`paymentReceivedDate${slotSuffix}`] = now;
                payment[`paymentType${slotSuffix}`] = 'bKash (Online)';
                payment[`paymentNumber${slotSuffix}`] = walletNumber;
                payment[`installmentComment${slotSuffix}`] = `Paid online via bKash. TrxID: ${trxId}`;
            }

            // Keep transactionId field updated with the bKash TrxID
            payment.transactionId = trxId;

            // Recalculate totals
            const r1 = parseFloat(payment.receivedTk) || 0;
            const r2 = parseFloat(payment.receivedTk2) || 0;
            const r3 = parseFloat(payment.receivedTk3) || 0;
            const r4 = parseFloat(payment.receivedTk4) || 0;
            const newTotalReceived = r1 + r2 + r3 + r4;
            payment.totalReceivedTk = String(newTotalReceived);

            const totalPay = parseFloat(payment.totalPaymentTk) || 0;
            const discount = parseFloat(payment.discount) || 0;
            const netPayable = Math.max(0, totalPay - discount);
            const newDue = Math.max(0, netPayable - newTotalReceived);
            payment.duePayment = String(newDue);

            if (newDue <= 0) {
                payment.paymentStatus = 'Paid';
            } else {
                payment.paymentStatus = 'Due';
            }

            payment.updatedBy = 'bKash (Online)';
            await payment.save();

            // Log activity for audit
            try {
                const diff = getDifferences(oldPayment, payment.toObject());
                await logActivity(req, 'Edit', 'Payment', payment._id, {
                    ...diff,
                    importantFields: {
                        tuitionCode: payment.tuitionCode,
                        tutorNumber: payment.tutorNumber,
                        walletNumber: walletNumber,
                        trxId: trxId,
                        method: 'bKash Online'
                    }
                }, 'bKash Online');
            } catch (logErr) {
                console.error('Error logging bKash payment activity:', logErr);
            }
        }
        */

        await txn.save();

        res.json({
            success: true,
            message: 'Payment completed successfully!',
            trxId: trxId,
            paymentId: txn.paymentId,
            amount: executedAmount,
            tuitionCode: txn.tuitionCode,
            premiumCode: txn.premiumCode,
            teacherCode: txn.premiumCode,
            tutorNumber: txn.tutorNumber,
            tutorName: txn.tutorName,
            payerAccount: txn.payerAccount || execResponse.payerAccount,
            merchantInvoiceNumber: txn.merchantInvoiceNumber,
            executedAt: txn.executedAt
        });

    } catch (err) {
        console.error('Error executing bKash payment:', err);
        res.status(500).json({
            message: err.response?.data?.statusMessage || err.message || 'Server error while executing payment.'
        });
    }
});

/**
 * POST /api/bkash/cancel-payment
 * Public: Callback notification when user clicks Cancel or payment fails on bKash screen
 */
router.post('/cancel-payment', async (req, res) => {
    try {
        const { paymentId, status } = req.body;
        if (!paymentId) {
            return res.status(400).json({ message: 'paymentId is required.' });
        }

        const txn = await BkashTransaction.findOne({ paymentId });
        if (txn && txn.status === 'Initiated') {
            txn.status = status === 'cancel' ? 'Cancelled' : 'Failed';
            txn.callbackReceived = true;
            txn.callbackStatus = status || 'cancel';
            await txn.save();
        }

        res.json({ success: true, message: 'Transaction status recorded.' });
    } catch (err) {
        console.error('Error recording bKash cancel:', err);
        res.status(500).json({ message: 'Failed to record cancel.' });
    }
});

/**
 * GET /api/bkash/payment-status/:paymentId
 * Public: Status lookup for a transaction
 */
router.get('/payment-status/:paymentId', async (req, res) => {
    try {
        const { paymentId } = req.params;
        const txn = await BkashTransaction.findOne({ paymentId })
            .select('paymentId trxId tuitionCode premiumCode tutorNumber tutorName amount currency status merchantInvoiceNumber payerAccount executedAt createdAt')
            .lean();

        if (!txn) {
            return res.status(404).json({ message: 'Transaction not found.' });
        }

        res.json({ success: true, transaction: txn });
    } catch (err) {
        console.error('Error getting bKash status:', err);
        res.status(500).json({ message: 'Failed to get transaction status.' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin-Only Endpoints
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/bkash/admin/query-payment
 * Admin: Query live bKash server for payment status
 */
router.post('/admin/query-payment', authMiddleware, async (req, res) => {
    try {
        const { paymentId } = req.body;
        if (!paymentId) return res.status(400).json({ message: 'paymentId is required.' });

        const queryRes = await bkashService.queryPayment(paymentId);
        res.json(queryRes);
    } catch (err) {
        console.error('Admin query payment error:', err);
        res.status(500).json({ message: err.message });
    }
});

/**
 * POST /api/bkash/admin/search-transaction
 * Admin: Search bKash transaction by trxID
 */
router.post('/admin/search-transaction', authMiddleware, async (req, res) => {
    try {
        const { trxId } = req.body;
        if (!trxId) return res.status(400).json({ message: 'trxId is required.' });

        const searchRes = await bkashService.searchTransaction(trxId);
        res.json(searchRes);
    } catch (err) {
        console.error('Admin search transaction error:', err);
        res.status(500).json({ message: err.message });
    }
});

/**
 * GET /api/bkash/admin/transactions
 * Admin: List all bKash transactions with pagination and filter
 */
router.get('/admin/transactions', authMiddleware, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 30;
        const { search, status } = req.query;

        const filter = {};
        if (status && status !== 'all') {
            filter.status = status;
        }
        if (search) {
            const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            filter.$or = [
                { tuitionCode: regex },
                { premiumCode: regex },
                { tutorNumber: regex },
                { payerAccount: regex },
                { trxId: regex },
                { paymentId: regex },
                { merchantInvoiceNumber: regex }
            ];
        }

        const total = await BkashTransaction.countDocuments(filter);
        const transactions = await BkashTransaction.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        res.json({
            data: transactions,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalRecords: total
        });
    } catch (err) {
        console.error('Admin get bKash transactions error:', err);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
