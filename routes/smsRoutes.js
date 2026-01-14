const express = require('express');
const axios = require('axios');
const router = express.Router();

// Your API key and approved sender ID
const SMS_API_KEY = 'a0d26e48e3a0d1c3859e42127ab678d2';
const SMS_SENDER_ID = '8809617621855';

/**
 * POST /api/sms/send
 * Body: { phone: "01891644064", message: "Your message here" }
 */
router.post('/send', async (req, res) => {
    try {
        const { phone, message } = req.body;

        if (!phone || !message) {
            return res.status(400).json({
                success: false,
                message: 'Phone and message are required'
            });
        }

        // Prepare request body for Automas API
        const requestBody = {
            api_key: SMS_API_KEY,
            senderid: SMS_SENDER_ID,
            type: 'text',           // single SMS
            scheduledDateTime: '',  // send immediately
            msg: message,
            contacts: phone
        };

        // Send SMS via Automas API
        const response = await axios.post(
            'https://bsms.automas.com.bd/api/smsapiv4',
            requestBody,
            { headers: { 'Content-Type': 'application/json' } }
        );

        const apiResponse = response.data.response[0];

        if (apiResponse.status === 0) {
            res.status(200).json({
                success: true,
                message: `SMS sent successfully to ${apiResponse.msisdn}`,
                msisdn: apiResponse.msisdn,
                id: apiResponse.id
            });
        } else {
            res.status(500).json({
                success: false,
                message: `SMS failed to send to ${apiResponse.msisdn}`,
                rawResponse: apiResponse
            });
        }

    } catch (error) {
        console.error('SMS sending error:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to send SMS',
            error: error.response?.data || error.message
        });
    }
});

module.exports = router;
