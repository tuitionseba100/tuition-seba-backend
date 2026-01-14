const express = require('express');
const router = express.Router();
const fetch = require('node-fetch'); // Node 18+ has global fetch

// Config from environment variables
const SMS_API_KEY = process.env.SMS_API_KEY || 'a0d26e48e3a0d1c3859e42127ab678d2';
const SMS_SENDER_ID = process.env.SMS_SENDER_ID || '8809617621855';

/**
 * Helper: URL encode message and build GET URL for single/bulk SMS
 */
function buildSMSUrl({ msisdn, message }) {
    const encodedMsg = encodeURIComponent(message);
    const msisdnStr = Array.isArray(msisdn) ? msisdn.join('+') : String(msisdn);
    return `https://bsms.automas.com.bd/api/smsapiv3?apikey=${SMS_API_KEY}&sender=${SMS_SENDER_ID}&msisdn=${msisdnStr}&smstext=${encodedMsg}`;
}

// -------------------- Single SMS --------------------
router.post('/send', async (req, res) => {
    try {
        const { msisdn, message } = req.body;

        if (!msisdn || !message) {
            return res.status(400).json({ success: false, message: 'Phone number and message are required' });
        }

        const url = buildSMSUrl({ msisdn, message });
        const response = await fetch(url, { method: 'GET' });
        const data = await response.json();

        res.status(200).json({
            success: data.status === 0,
            data,
            statusMessage: data.status === 0 ? 'SMS Sent Successfully' : 'SMS Failed'
        });
    } catch (error) {
        console.error('Single SMS error:', error);
        res.status(500).json({ success: false, message: 'Failed to send SMS', error: error.message });
    }
});

// -------------------- Bulk SMS --------------------
router.post('/send-bulk', async (req, res) => {
    try {
        const { contacts, message } = req.body;

        if (!contacts || !Array.isArray(contacts) || contacts.length === 0 || !message) {
            return res.status(400).json({ success: false, message: 'Contacts array and message are required' });
        }

        const url = buildSMSUrl({ msisdn: contacts, message });
        const response = await fetch(url, { method: 'GET' });
        const data = await response.json();

        res.status(200).json({
            success: true,
            data,
            totalSent: contacts.length
        });
    } catch (error) {
        console.error('Bulk SMS error:', error);
        res.status(500).json({ success: false, message: 'Failed to send bulk SMS', error: error.message });
    }
});

// -------------------- Dynamic SMS --------------------
router.post('/send-dynamic', async (req, res) => {
    try {
        const { messages } = req.body; // [{ id, msisdn, smstext }]

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ success: false, message: 'Messages array is required' });
        }

        // Send dynamic SMS using their /smsapimany endpoint (POST JSON)
        const response = await fetch('https://bsms.automas.com.bd/api/smsapimany', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                apikey: SMS_API_KEY,
                sender: SMS_SENDER_ID,
                messages: messages.map(m => ({
                    id: m.id,
                    msisdn: String(m.msisdn),
                    smstext: m.smstext
                }))
            })
        });

        const data = await response.json();

        res.status(200).json({
            success: true,
            totalSent: data.response.length,
            data
        });
    } catch (error) {
        console.error('Dynamic SMS error:', error);
        res.status(500).json({ success: false, message: 'Failed to send dynamic SMS', error: error.message });
    }
});

// -------------------- Check SMS Balance --------------------
router.get('/balance', async (req, res) => {
    try {
        const url = `https://bsms.automas.com.bd/api/getbalancev3?apikey=${SMS_API_KEY}`;
        const response = await fetch(url, { method: 'GET' });
        const data = await response.json();

        res.status(200).json({ success: true, balance: data.response });
    } catch (error) {
        console.error('Balance check error:', error);
        res.status(500).json({ success: false, message: 'Failed to check balance', error: error.message });
    }
});

module.exports = router;
