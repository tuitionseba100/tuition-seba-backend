const mongoose = require('mongoose');

const loginHistorySchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    username: { type: String },
    timestamp: { 
        type: Date, 
        default: Date.now 
    },
    ip: { type: String },
    userAgent: { type: String },
    location: { type: String } // Optional: can be populated later
});

const LoginHistory = mongoose.model('LoginHistory', loginHistorySchema);
module.exports = LoginHistory;
