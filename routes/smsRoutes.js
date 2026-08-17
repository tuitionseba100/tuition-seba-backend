const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const router = express.Router();
const SmsLog = require('../models/SmsLog');

// Flexible auth middleware to extract user name for logging
const authMiddleware = (req, res, next) => {
    const token = req.header('Authorization');
    const xUserName = req.headers['x-user-name'];

    if (token) {
        try {
            const verified = jwt.verify(token, 'mahedi1000abcdefgh100');
            req.user = verified;
            req.username = xUserName || 'Admin';
        } catch (err) {
            console.error('Invalid token in SMS routes:', err.message);
        }
    } else if (xUserName) {
        req.username = xUserName;
    }

    if (!req.username) {
        req.username = 'System';
    }
    next();
};

// Strict auth middleware for reading logs
const strictAuthMiddleware = (req, res, next) => {
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

// Send single SMS
router.post('/send-single', authMiddleware, async (req, res) => {
    const { phone, message, tuitionCode, premiumCode, category } = req.body;
    try {
        if (!phone || !message) {
            return res.status(400).json({ success: false, statusMessage: 'Phone and message are required' });
        }

        const isUnicode = /[^\u0000-\u007F]/.test(message);
        const encodedMessage = encodeURIComponent(message);
        let apiKey = process.env.SMS_API_KEY || 'd63053e5066920d85c08ce2bae2e3b2c';
        let senderId = process.env.SMS_SENDER_ID || '8809617621855';

        apiKey = apiKey.trim();
        senderId = senderId.trim();

        console.log(`[SMS DEBUG] Sending SMS to ${phone} using apiKey: "${apiKey}", senderId: "${senderId}"`);

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
        let apiKey = process.env.SMS_API_KEY || 'd63053e5066920d85c08ce2bae2e3b2c';
        let senderId = process.env.SMS_SENDER_ID || '8809617621855';

        apiKey = apiKey.trim();
        senderId = senderId.trim();

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
    try {
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ success: false, statusMessage: 'Valid messages array is required' });
        }

        let apiKey = process.env.SMS_API_KEY || 'd63053e5066920d85c08ce2bae2e3b2c';
        let senderId = process.env.SMS_SENDER_ID || '8809617621855';

        apiKey = apiKey.trim();
        senderId = senderId.trim();

        const apiResponse = await axios.post('https://api.automas.com.bd/smsapimany', {
            apikey: apiKey,
            sender: senderId,
            messages: messages
        });

        const smsStatus = apiResponse.data?.response?.[0]?.status;
        const isSuccess = (smsStatus === 0);

        // Save logs for each dynamic message
        const logs = messages.map(m => ({
            sentBy: req.username,
            tuitionCode: m.tuitionCode || req.body.tuitionCode || '',
            premiumCode: m.premiumCode || req.body.premiumCode || '',
            category: m.category || category || 'General',
            phone: m.msisdn,
            message: m.smstext,
            status: isSuccess ? 'success' : 'failed'
        }));
        await SmsLog.insertMany(logs);

        return res.json({ success: true, apiResponse: apiResponse.data });
    } catch (err) {
        console.error('Dynamic SMS sending failed:', err.message || err);
        try {
            if (Array.isArray(messages)) {
                const logs = messages.map(m => ({
                    sentBy: req.username,
                    tuitionCode: m.tuitionCode || req.body.tuitionCode || '',
                    premiumCode: m.premiumCode || req.body.premiumCode || '',
                    category: m.category || category || 'General',
                    phone: m.msisdn || 'Unknown',
                    message: m.smstext || 'N/A',
                    status: 'failed'
                }));
                await SmsLog.insertMany(logs);
            }
        } catch (logErr) {
            console.error('Error saving failed Dynamic SMS logs:', logErr.message);
        }
        return res.status(500).json({ success: false, statusMessage: err.message || 'Unknown error' });
    }
});

// Check SMS Balance
router.get('/balance', async (req, res) => {
    try {
        let apiKey = process.env.SMS_API_KEY || 'd63053e5066920d85c08ce2bae2e3b2c';
        apiKey = apiKey.trim();
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
        let apiKey = process.env.SMS_API_KEY || 'd63053e5066920d85c08ce2bae2e3b2c';
        let senderId = process.env.SMS_SENDER_ID || '8809617621855';

        apiKey = apiKey.trim();
        senderId = senderId.trim();

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
        const { page = 1, limit = 50, search = '', status = '', category = '' } = req.query;
        const filter = {};

        if (status) {
            filter.status = status;
        }

        if (category) {
            filter.category = new RegExp(category, 'i');
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

        res.json({
            success: true,
            logs,
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
