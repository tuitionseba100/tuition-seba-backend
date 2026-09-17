const axios = require('axios');
const SmsLog = require('../models/SmsLog');

/**
 * Helper to send SMS via Automas API and log the attempt to SmsLog
 * @param {Object} param0 
 * @param {string} param0.phone - Recipient phone number
 * @param {string} param0.message - SMS content
 * @param {string} [param0.tuitionCode] - Associated tuition code
 * @param {string} [param0.premiumCode] - Associated teacher premium code
 * @param {string} [param0.category='General'] - Category (e.g., 'Registration', 'Verification', 'Proposal')
 * @param {string} [param0.sentBy='system'] - Username or system
 */
async function sendSms({ phone, message, tuitionCode = '', premiumCode = '', category = 'General', sentBy = 'system' }) {
    try {
        if (!phone || !message) {
            return { success: false, statusMessage: 'Phone and message are required' };
        }

        let apiKey = (process.env.SMS_API_KEY || 'd63053e5066920d85c08ce2bae2e3b2c').trim();
        let senderId = (process.env.SMS_SENDER_ID || '8809617621855').trim();

        const isUnicode = /[^\u0000-\u007F]/.test(message);
        const encodedMessage = encodeURIComponent(message);

        let apiUrl = `https://api.automas.com.bd/smsapiv3?apikey=${apiKey}&sender=${senderId}&msisdn=${phone}&smstext=${encodedMessage}`;
        if (isUnicode) {
            apiUrl += `&smsformat=8`;
        }

        const apiResponse = await axios.get(apiUrl);
        const smsStatus = apiResponse.data?.response?.[0]?.status;
        const isSuccess = (smsStatus === 0);

        // Save SMS Log
        const newLog = new SmsLog({
            sentBy: sentBy || 'system',
            tuitionCode: tuitionCode || '',
            premiumCode: premiumCode || '',
            category: category || 'General',
            phone: phone,
            message: message,
            status: isSuccess ? 'success' : 'failed'
        });
        await newLog.save();

        if (isSuccess) {
            return { success: true, apiResponse: apiResponse.data };
        } else {
            console.error(`[SMS] Failed to send SMS to ${phone}. Status code: ${smsStatus}`, apiResponse.data);
            return {
                success: false,
                statusMessage: `SMS API returned status ${smsStatus}`,
                apiResponse: apiResponse.data
            };
        }
    } catch (err) {
        console.error('Error sending SMS:', err.message || err);
        try {
            const errorLog = new SmsLog({
                sentBy: sentBy || 'system',
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
        return { success: false, error: err.message };
    }
}

module.exports = { sendSms };
