const mongoose = require('mongoose');

const smsLogSchema = new mongoose.Schema({
    sentBy: { 
        type: String, 
        required: true,
        default: 'System'
    },
    tuitionCode: { 
        type: String, 
        default: '' 
    },
    premiumCode: { 
        type: String, 
        default: '' 
    },
    category: {
        type: String,
        default: 'General'
    },
    phone: { 
        type: String, 
        required: true 
    },
    message: { 
        type: String, 
        required: true 
    },
    status: { 
        type: String, 
        enum: ['success', 'failed'],
        required: true 
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

const SmsLog = mongoose.model('SmsLog', smsLogSchema);
module.exports = SmsLog;
