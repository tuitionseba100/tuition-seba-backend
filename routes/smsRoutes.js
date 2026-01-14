const express = require('express');
const axios = require('axios');
const router = express.Router();

// POST endpoint to send SMS
router.post('/send-sms', async (req, res) => {
    try {
        const { number, message } = req.body;

        if (!number || !message) {
            return res.status(400).json({ error: 'Number and message are required' });
        }

        const encodedMessage = encodeURIComponent(message);

        const apiUrl = `https://bsms.automas.com.bd/api/smsapiv3?apikey=c72211cb4ba10d6e2435045554b7d4d6&sender=8809617621855&msisdn=${number}&smstext=${encodedMessage}`;

        const response = await axios.get(apiUrl);

        res.json({
            status: 'success',
            apiResponse: response.data
        });

    } catch (error) {
        console.error('SMS sending failed:', error.message);
        res.status(500).json({ status: 'fail', error: error.message });
    }
});

module.exports = router;
