const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const router = express.Router();
const SmsLog = require('../models/SmsLog');
const TuitionApply = require('../models/TuitionApply');
const { JWT_SECRET } = require('../middleware/auth');

// Helper to reliably obtain SMS API credentials from environment
const getSmsConfig = () => {
    const apiKey = (process.env.SMS_API_KEY || '').trim();
    const senderId = (process.env.SMS_SENDER_ID || '').trim();
    if (!apiKey || !senderId) {
        throw new Error('SMS credentials (SMS_API_KEY, SMS_SENDER_ID) are missing in environment variables.');
    }
    return { apiKey, senderId };
};

// Strict auth middleware to authenticate staff/admin before sending SMS
const authMiddleware = (req, res, next) => {
    let token = req.header('Authorization');
    if (!token) {
        return res.status(401).json({ success: false, statusMessage: 'Access Denied: No authentication token provided' });
    }

    if (typeof token === 'string' && token.startsWith('Bearer ')) {
        token = token.slice(7).trim();
    }

    try {
        const verified = jwt.verify(token, JWT_SECRET);
        req.user = verified;
        const xUserName = req.headers['x-user-name'];
        req.username = xUserName || verified.username || verified.name || 'Admin';
        next();
    } catch (err) {
        return res.status(401).json({ success: false, statusMessage: 'Invalid or expired token' });
    }
};

// Send single SMS
router.post('/send-single', authMiddleware, async (req, res) => {
    const { phone, message, tuitionCode, premiumCode, category } = req.body;
    try {
        if (!phone || !message) {
            return res.status(400).json({ success: false, statusMessage: 'Phone and message are required' });
        }

        const isUnicode = /[^\u0000-\u007F]/.test(message);
        const encodedMessage = encodeURIComponent(message);
        const { apiKey, senderId } = getSmsConfig();

        let apiUrl = `https://api.automas.com.bd/smsapiv3?apikey=${apiKey}&sender=${senderId}&msisdn=${phone}&smstext=${encodedMessage}`;

        if (isUnicode) {
            apiUrl += `&smsformat=8`;
        }

        const apiResponse = await axios.get(apiUrl);
        const smsStatus = apiResponse.data?.response?.[0]?.status;

        const isSuccess = (smsStatus === 0);

        // Save SMS Log
        const newLog = new SmsLog({
            sentBy: req.username,
            tuitionCode: tuitionCode || '',
            premiumCode: premiumCode || '',
            category: category || 'General',
            phone: phone,
            message: message,
            status: isSuccess ? 'success' : 'failed'
        });
        await newLog.save();

        if (isSuccess) {
            return res.json({ success: true, apiResponse: apiResponse.data });
        } else {
            return res.json({
                success: false,
                statusMessage: `SMS API returned status ${smsStatus}`,
                apiResponse: apiResponse.data
            });
        }
    } catch (err) {
        console.error('Single SMS sending failed:', err.message || err);
        try {
            const errorLog = new SmsLog({
                sentBy: req.username,
                tuitionCode: tuitionCode || '',
                premiumCode: premiumCode || '',
                category: category || 'General',
                phone: phone || 'Unknown',
                message: message || 'N/A',
                status: 'failed'
            });
            await errorLog.save();
        } catch (logErr) {
            console.error('Error saving failed SMS log:', logErr.message);
        }
        return res.status(500).json({ success: false, statusMessage: err.message || 'Unknown error' });
    }
});

// Send Bulk SMS (accepts an array of phone numbers or a comma-separated string)
router.post('/send-bulk', authMiddleware, async (req, res) => {
    const { phones, message, tuitionCode, premiumCode, category } = req.body;
    try {
        if (!phones || !message) {
            return res.status(400).json({ success: false, statusMessage: 'Phones and message are required' });
        }

        // Convert array to comma-separated string if needed
        const msisdn = Array.isArray(phones) ? phones.join(',') : phones;
        const phoneList = Array.isArray(phones) ? phones : phones.split(',');

        const isUnicode = /[^\u0000-\u007F]/.test(message);
        const encodedMessage = encodeURIComponent(message);
        const { apiKey, senderId } = getSmsConfig();

        let apiUrl = `https://api.automas.com.bd/smsapiv3?apikey=${apiKey}&sender=${senderId}&msisdn=${msisdn}&smstext=${encodedMessage}`;

        if (isUnicode) {
            apiUrl += `&smsformat=8`;
        }

        const apiResponse = await axios.get(apiUrl);
        const smsStatus = apiResponse.data?.response?.[0]?.status;
        const isSuccess = (smsStatus === 0);

        // Save Bulk logs
        const logs = phoneList.map(p => ({
            sentBy: req.username,
            tuitionCode: tuitionCode || '',
            premiumCode: premiumCode || '',
            category: category || 'General',
            phone: p.trim(),
            message: message,
            status: isSuccess ? 'success' : 'failed'
        }));
        await SmsLog.insertMany(logs);

        return res.json({ success: true, apiResponse: apiResponse.data });
    } catch (err) {
        console.error('Bulk SMS sending failed:', err.message || err);
        try {
            const phoneList = Array.isArray(phones) ? phones : (phones ? phones.split(',') : []);
            if (phoneList.length > 0) {
                const logs = phoneList.map(p => ({
                    sentBy: req.username,
                    tuitionCode: tuitionCode || '',
                    premiumCode: premiumCode || '',
                    category: category || 'General',
                    phone: p.trim(),
                    message: message || 'N/A',
                    status: 'failed'
                }));
                await SmsLog.insertMany(logs);
            }
        } catch (logErr) {
            console.error('Error saving failed Bulk SMS logs:', logErr.message);
        }
        return res.status(500).json({ success: false, statusMessage: err.message || 'Unknown error' });
    }
});

// Send Dynamic SMS (different messages to different recipients in JSON format)
router.post('/send-dynamic', authMiddleware, async (req, res) => {
    const { messages, category } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ success: false, statusMessage: 'Valid messages array is required' });
    }

    const { apiKey, senderId } = getSmsConfig();

    const logs = [];
    let successCount = 0;
    let failedCount = 0;

    for (const m of messages) {
        let phone = (m.msisdn || '').trim();
        if (phone.startsWith('01')) {
            phone = '88' + phone;
        } else if (phone.startsWith('+8801')) {
            phone = phone.replace('+', '');
        }

        const isUnicode = /[^\u0000-\u007F]/.test(m.smstext);
        const encodedMessage = encodeURIComponent(m.smstext);
        let apiUrl = `https://api.automas.com.bd/smsapiv3?apikey=${apiKey}&sender=${senderId}&msisdn=${phone}&smstext=${encodedMessage}`;
        if (isUnicode) {
            apiUrl += `&smsformat=8`;
        }

        let isSuccess = false;
        try {
            console.log(`[SMS DEBUG] Sending dynamic item to ${phone} using single v3 API`);
            const apiResponse = await axios.get(apiUrl);
            const smsStatus = apiResponse.data?.response?.[0]?.status;
            if (smsStatus === 0) {
                isSuccess = true;
                successCount++;
            } else {
                console.error(`[SMS DEBUG] Automas returned status ${smsStatus} for ${phone}`);
                failedCount++;
            }
        } catch (err) {
            console.error(`[SMS DEBUG] Request failed for ${phone}:`, err.message);
            failedCount++;
        }

        logs.push({
            sentBy: req.username || 'System',
            tuitionCode: m.tuitionCode || req.body.tuitionCode || '',
            premiumCode: m.premiumCode || req.body.premiumCode || '',
            category: m.category || category || 'Proposal',
            phone: m.msisdn,
            message: m.smstext,
            status: isSuccess ? 'success' : 'failed'
        });
    }

    try {
        await SmsLog.insertMany(logs);
    } catch (logErr) {
        console.error('Error saving SMS logs:', logErr.message);
    }

    if (successCount > 0) {
        return res.json({ 
            success: true, 
            statusMessage: `Successfully sent ${successCount} messages. ${failedCount > 0 ? `Failed to send ${failedCount} messages.` : ''}`
        });
    } else {
        return res.status(500).json({ 
            success: false, 
            statusMessage: `Failed to send all ${messages.length} messages. Please check the logs.` 
        });
    }
});

// Check SMS Balance
router.get('/balance', authMiddleware, async (req, res) => {
    try {
        const { apiKey } = getSmsConfig();
        const apiUrl = `https://api.automas.com.bd/getbalancev3?apikey=${apiKey}`;

        const apiResponse = await axios.get(apiUrl);
        return res.json({ success: true, balance: apiResponse.data?.response });
    } catch (err) {
        console.error('Checking balance failed:', err.message || err);
        return res.status(500).json({ success: false, statusMessage: err.message || 'Unknown error' });
    }
});

// Kept /send endpoint for backwards compatibility
router.post('/send', authMiddleware, async (req, res) => {
    const { phone, message, tuitionCode, premiumCode, category } = req.body;
    try {
        if (!phone || !message) {
            return res.status(400).json({ success: false, statusMessage: 'Phone and message are required' });
        }

        const isUnicode = /[^\u0000-\u007F]/.test(message);
        const encodedMessage = encodeURIComponent(message);
        const { apiKey, senderId } = getSmsConfig();

        let apiUrl = `https://api.automas.com.bd/smsapiv3?apikey=${apiKey}&sender=${senderId}&msisdn=${phone}&smstext=${encodedMessage}`;
        if (isUnicode) {
            apiUrl += `&smsformat=8`;
        }

        const apiResponse = await axios.get(apiUrl);
        const smsStatus = apiResponse.data?.response?.[0]?.status;
        const isSuccess = (smsStatus === 0);

        const newLog = new SmsLog({
            sentBy: req.username,
            tuitionCode: tuitionCode || '',
            premiumCode: premiumCode || '',
            category: category || 'General',
            phone: phone,
            message: message,
            status: isSuccess ? 'success' : 'failed'
        });
        await newLog.save();

        if (isSuccess) {
            return res.json({ success: true, apiResponse: apiResponse.data });
        } else {
            return res.json({ success: false, statusMessage: `SMS API status ${smsStatus}`, apiResponse: apiResponse.data });
        }
    } catch (err) {
        try {
            const errorLog = new SmsLog({
                sentBy: req.username,
                tuitionCode: tuitionCode || '',
                premiumCode: premiumCode || '',
                category: category || 'General',
                phone: phone || 'Unknown',
                message: message || 'N/A',
                status: 'failed'
            });
            await errorLog.save();
        } catch (logErr) {
            console.error('Error saving failed /send SMS log:', logErr.message);
        }
        return res.status(500).json({ success: false, statusMessage: err.message || 'Unknown error' });
    }
});

// Get SMS logs (server-side pagination, search, filters)
router.get('/logs', strictAuthMiddleware, async (req, res) => {
    try {
        const { page = 1, limit = 50, search = '', status = '', category = '', premiumCode = '' } = req.query;
        const filter = {};

        if (status) {
            filter.status = status;
        }

        if (category) {
            filter.category = new RegExp(category, 'i');
        }

        if (premiumCode) {
            filter.premiumCode = premiumCode;
        }

        if (search) {
            const searchRegex = new RegExp(search, 'i');
            filter.$or = [
                { phone: searchRegex },
                { sentBy: searchRegex },
                { message: searchRegex },
                { tuitionCode: searchRegex },
                { premiumCode: searchRegex },
                { category: searchRegex }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await SmsLog.countDocuments(filter);
        const logs = await SmsLog.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        // Map tuition application status for each log
        const tuitionCodes = [...new Set(logs.map(log => log.tuitionCode).filter(Boolean))];
        const appliesMap = new Map();
        if (tuitionCodes.length > 0) {
            const applies = await TuitionApply.find({ tuitionCode: { $in: tuitionCodes } })
                .select('premiumCode tuitionCode status')
                .lean();

            applies.forEach(app => {
                const status = app.status || 'pending';
                if (app.tuitionCode && app.premiumCode) {
                    appliesMap.set(`${app.tuitionCode.trim()}_pc_${app.premiumCode.trim()}`, status);
                }
            });
        }

        const logsWithApplyStatus = logs.map(log => {
            const cleanTuitionCode = log.tuitionCode ? log.tuitionCode.trim() : '';
            const cleanPremiumCode = log.premiumCode ? log.premiumCode.trim() : '';

            let appliedStatus = null;
            if (cleanTuitionCode && cleanPremiumCode) {
                if (appliesMap.has(`${cleanTuitionCode}_pc_${cleanPremiumCode}`)) {
                    appliedStatus = appliesMap.get(`${cleanTuitionCode}_pc_${cleanPremiumCode}`);
                }
            }

            return {
                ...log,
                hasApplied: appliedStatus !== null,
                applicationStatus: appliedStatus
            };
        });

        res.json({
            success: true,
            logs: logsWithApplyStatus,
            total,
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit))
        });
    } catch (err) {
        console.error('Fetching SMS logs failed:', err.message);
        res.status(500).json({ success: false, message: err.message || 'Unknown error' });
    }
});

module.exports = router;
