const express = require('express');
const axios = require('axios');
const router = express.Router();

// Send single SMS
router.post('/send-single', async (req, res) => {
    try {
        const { phone, message } = req.body;

        if (!phone || !message) {
            return res.status(400).json({ success: false, statusMessage: 'Phone and message are required' });
        }

        const isUnicode = /[^\u0000-\u007F]/.test(message);
        const encodedMessage = encodeURIComponent(message);
        const apiKey = process.env.SMS_API_KEY || 'd63053e5066920d85c08ce2bae2e3b2c';
        const senderId = process.env.SMS_SENDER_ID || '8809617621855';

        let apiUrl = `https://api.automas.com.bd/smsapiv3?apikey=${apiKey}&sender=${senderId}&msisdn=${phone}&smstext=${encodedMessage}`;
        
        if (isUnicode) {
            apiUrl += `&smsformat=8`;
        }

        const apiResponse = await axios.get(apiUrl);
        const smsStatus = apiResponse.data?.response?.[0]?.status;

        if (smsStatus === 0) {
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
        return res.status(500).json({ success: false, statusMessage: err.message || 'Unknown error' });
    }
});

// Send Bulk SMS (accepts an array of phone numbers or a comma-separated string)
router.post('/send-bulk', async (req, res) => {
    try {
        const { phones, message } = req.body;

        if (!phones || !message) {
            return res.status(400).json({ success: false, statusMessage: 'Phones and message are required' });
        }

        // Convert array to comma-separated string if needed
        const msisdn = Array.isArray(phones) ? phones.join(',') : phones;
        
        const isUnicode = /[^\u0000-\u007F]/.test(message);
        const encodedMessage = encodeURIComponent(message);
        const apiKey = process.env.SMS_API_KEY || 'd63053e5066920d85c08ce2bae2e3b2c';
        const senderId = process.env.SMS_SENDER_ID || '8809617621855';

        let apiUrl = `https://api.automas.com.bd/smsapiv3?apikey=${apiKey}&sender=${senderId}&msisdn=${msisdn}&smstext=${encodedMessage}`;
        
        if (isUnicode) {
            apiUrl += `&smsformat=8`;
        }

        const apiResponse = await axios.get(apiUrl);
        return res.json({ success: true, apiResponse: apiResponse.data });
    } catch (err) {
        console.error('Bulk SMS sending failed:', err.message || err);
        return res.status(500).json({ success: false, statusMessage: err.message || 'Unknown error' });
    }
});

// Send Dynamic SMS (different messages to different recipients in JSON format)
router.post('/send-dynamic', async (req, res) => {
    try {
        const { messages } = req.body; // Expects array of { id, msisdn, smstext }

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ success: false, statusMessage: 'Valid messages array is required' });
        }

        const apiKey = process.env.SMS_API_KEY || 'd63053e5066920d85c08ce2bae2e3b2c';
        const senderId = process.env.SMS_SENDER_ID || '8809617621855';

        const apiResponse = await axios.post('https://api.automas.com.bd/smsapimany', {
            apikey: apiKey,
            sender: senderId,
            messages: messages
        });

        return res.json({ success: true, apiResponse: apiResponse.data });
    } catch (err) {
        console.error('Dynamic SMS sending failed:', err.message || err);
        return res.status(500).json({ success: false, statusMessage: err.message || 'Unknown error' });
    }
});

// Check SMS Balance
router.get('/balance', async (req, res) => {
    try {
        const apiKey = process.env.SMS_API_KEY || 'd63053e5066920d85c08ce2bae2e3b2c';
        const apiUrl = `https://api.automas.com.bd/getbalancev3?apikey=${apiKey}`;

        const apiResponse = await axios.get(apiUrl);
        return res.json({ success: true, balance: apiResponse.data?.response });
    } catch (err) {
        console.error('Checking balance failed:', err.message || err);
        return res.status(500).json({ success: false, statusMessage: err.message || 'Unknown error' });
    }
});

// Kept /send endpoint for backwards compatibility
router.post('/send', async (req, res) => {
    try {
        const { phone, message } = req.body;
        if (!phone || !message) {
            return res.status(400).json({ success: false, statusMessage: 'Phone and message are required' });
        }

        const isUnicode = /[^\u0000-\u007F]/.test(message);
        const encodedMessage = encodeURIComponent(message);
        const apiKey = process.env.SMS_API_KEY || 'd63053e5066920d85c08ce2bae2e3b2c';
        const senderId = process.env.SMS_SENDER_ID || '8809617621855';

        let apiUrl = `https://api.automas.com.bd/smsapiv3?apikey=${apiKey}&sender=${senderId}&msisdn=${phone}&smstext=${encodedMessage}`;
        if (isUnicode) {
            apiUrl += `&smsformat=8`;
        }

        const apiResponse = await axios.get(apiUrl);
        const smsStatus = apiResponse.data?.response?.[0]?.status;

        if (smsStatus === 0) {
            return res.json({ success: true, apiResponse: apiResponse.data });
        } else {
            return res.json({ success: false, statusMessage: `SMS API status ${smsStatus}`, apiResponse: apiResponse.data });
        }
    } catch (err) {
        return res.status(500).json({ success: false, statusMessage: err.message || 'Unknown error' });
    }
});

module.exports = router;
