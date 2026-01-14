const express = require('express');
const router = express.Router();
const axios = require('axios');
const https = require('https');

// Axios instance with SSL verification disabled
const axiosInstance = axios.create({
    httpsAgent: new https.Agent({ rejectUnauthorized: false }) // <--- important
});

const SMS_CONFIG = {
    apiKey: process.env.SMS_API_KEY || 'a0d26e48e3a0d1c3859e42127ab678d2',
    senderId: process.env.SMS_SENDER_ID || '8809617621855',
    baseURL: 'https://bsms.automas.com.bd/api'
};

// Single SMS endpoint
router.post('/send', async (req, res) => {
    try {
        const { phone, message, type = 'text', scheduledDateTime = '' } = req.body;

        if (!phone || !message) {
            return res.status(400).json({ success: false, message: 'Phone and message required' });
        }

        const requestBody = {
            api_key: SMS_CONFIG.apiKey,
            senderid: SMS_CONFIG.senderId,
            type: type,
            scheduledDateTime,
            msg: message,
            contacts: phone
        };

        const response = await axiosInstance.post(
            `${SMS_CONFIG.baseURL}/smsapiv4`,
            requestBody,
            { headers: { 'Content-Type': 'application/json' } }
        );

        const statusCode = response.data.response[0].status;
        const statusMessage = statusCode === 0 ? 'Success' : 'Failed';

        res.status(200).json({
            success: statusCode === 0,
            data: response.data,
            statusMessage
        });

    } catch (err) {
        console.error('SMS sending error:', err.message || err);
        res.status(500).json({
            success: false,
            message: 'Failed to send SMS',
            error: err.message || err
        });
    }
});

module.exports = router;
