const express = require('express');
const router = express.Router();
const axios = require('axios');
const https = require('https');

// Axios instance with SSL disabled (as before)
const axiosInstance = axios.create({
    httpsAgent: new https.Agent({
        rejectUnauthorized: false
    })
});

const SMS_CONFIG = {
    apiKey: process.env.SMS_API_KEY || 'a0d26e48e3a0d1c3859e42127ab678d2',
    senderId: process.env.SMS_SENDER_ID || '8809617621855',
    baseURL: 'https://bsms.automas.com.bd/api'
};

// Map status codes to messages
function getStatusMessage(statusCode) {
    const statusCodes = {
        0: 'Success',
        101: 'Invalid Message Length',
        102: 'Sender Not Valid',
        103: 'Authentication Failed',
        104: 'Invalid User',
        105: 'Invalid MSISDN',
        106: 'Incorrect API Key',
        107: 'User Account Suspended',
        108: 'IP Address Not Allowed',
        109: 'API Access Not Allowed',
        110: 'Do Not Disturb (DND)',
        111: 'Spam Word Detected in Message',
        1000: 'Insufficient Balance',
        2300: 'Destination Route Issue',
        2400: 'Destination Route Not Permitted',
        3300: 'System Error',
        2000: 'Destination Provider Unavailable',
        3000: 'Destination Provider Unavailable',
        4000: 'Destination Provider Unavailable'
    };
    return statusCodes[statusCode] || 'Unknown Status Code';
}

// ==========================
// Send Single SMS
// ==========================
router.post('/send', async (req, res) => {
    try {
        const { msisdn, message, type = 'text', scheduledDateTime = '' } = req.body;

        if (!msisdn || !message) {
            return res.status(400).json({
                success: false,
                message: 'Phone number and message are required'
            });
        }

        if (message.length > 160) {
            return res.status(400).json({
                success: false,
                message: 'Message exceeds 160 characters for single SMS'
            });
        }

        const requestBody = {
            apikey: SMS_CONFIG.apiKey,       // corrected
            sender: SMS_CONFIG.senderId,     // corrected
            type: type,
            scheduledDateTime: scheduledDateTime,
            smstext: message,                // corrected
            contacts: msisdn                 // ok
        };

        const response = await axiosInstance.post(
            `${SMS_CONFIG.baseURL}/smsapiv4`,
            requestBody,
            { headers: { 'Content-Type': 'application/json' } }
        );

        const statusCode = response.data.response[0].status;
        const statusMessage = getStatusMessage(statusCode);

        res.status(200).json({
            success: statusCode === 0,
            data: response.data,
            statusMessage: statusMessage
        });

    } catch (error) {
        console.error('SMS sending error:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to send SMS',
            error: error.response?.data || error.message
        });
    }
});

// ==========================
// Send Bulk SMS
// ==========================
router.post('/send-bulk', async (req, res) => {
    try {
        const { contacts, message, type = 'text', scheduledDateTime = '' } = req.body;

        if (!contacts || !message) {
            return res.status(400).json({
                success: false,
                message: 'Contacts array and message are required'
            });
        }

        if (!Array.isArray(contacts) || contacts.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Contacts must be a non-empty array'
            });
        }

        const contactString = contacts.join('+');

        const requestBody = {
            apikey: SMS_CONFIG.apiKey,       // corrected
            sender: SMS_CONFIG.senderId,     // corrected
            type: type,
            scheduledDateTime: scheduledDateTime,
            smstext: message,                // corrected
            contacts: contactString
        };

        const response = await axiosInstance.post(
            `${SMS_CONFIG.baseURL}/smsapiv4`,
            requestBody,
            { headers: { 'Content-Type': 'application/json' } }
        );

        res.status(200).json({
            success: true,
            data: response.data,
            totalSent: response.data.response.length
        });

    } catch (error) {
        console.error('Bulk SMS sending error:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to send bulk SMS',
            error: error.response?.data || error.message
        });
    }
});

// ==========================
// Send Dynamic SMS (Different message per number)
// ==========================
router.post('/send-dynamic', async (req, res) => {
    try {
        const { messages } = req.body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Messages array is required with format: [{id, msisdn, smstext}]'
            });
        }

        const requestBody = {
            apikey: SMS_CONFIG.apiKey,
            sender: SMS_CONFIG.senderId,
            messages: messages
        };

        const response = await axiosInstance.post(
            `${SMS_CONFIG.baseURL}/smsapimany`,
            requestBody,
            { headers: { 'Content-Type': 'application/json' } }
        );

        res.status(200).json({
            success: true,
            data: response.data,
            totalSent: response.data.response.length
        });

    } catch (error) {
        console.error('Dynamic SMS sending error:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to send dynamic SMS',
            error: error.response?.data || error.message
        });
    }
});

// ==========================
// Check SMS Balance
// ==========================
router.get('/balance', async (req, res) => {
    try {
        const response = await axiosInstance.get(
            `${SMS_CONFIG.baseURL}/getbalancev3`,
            { params: { apikey: SMS_CONFIG.apiKey } }
        );

        res.status(200).json({
            success: true,
            balance: response.data.response
        });

    } catch (error) {
        console.error('Balance check error:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to check balance',
            error: error.response?.data || error.message
        });
    }
});

module.exports = router;
