const express = require('express');
const axios = require('axios');
const router = express.Router();

router.post('/send', async (req, res) => {
    try {
        const { phone, message } = req.body;

        if (!phone || !message) {
            return res.status(400).json({ success: false, statusMessage: 'Phone and message are required' });
        }

        // URL encode message
        const encodedMessage = encodeURIComponent(message);

        // Single SMS API URL
        const apiUrl = `https://bsms.automas.com.bd/api/smsapiv3?apikey=c72211cb4ba10d6e2435045554b7d4d6&sender=8809617621855&msisdn=${phone}&smstext=${encodedMessage}`;

        // Call the SMS API
        const apiResponse = await axios.get(apiUrl);

        // Check API response status (0 = success)
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
        console.error('SMS sending failed:', err.message || err);
        return res.status(500).json({ success: false, statusMessage: err.message || 'Unknown error' });
    }
});

module.exports = router;
