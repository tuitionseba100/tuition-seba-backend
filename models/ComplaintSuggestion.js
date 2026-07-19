const mongoose = require('mongoose');

const complaintSuggestionSchema = new mongoose.Schema({
    type: { type: String, enum: ['complain', 'suggestion'], required: true },
    category: { type: String, required: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    teacherCode: { type: String },
    description: { type: String, required: true },
    isSpam: { type: Boolean, default: false },
    isBest: { type: Boolean, default: false },
    status: { type: String, enum: ['Pending', 'In Progress', 'Resolved', 'Dismissed', 'Spam (Dismissed)'], default: 'Pending' },
    adminComment: { type: String },
    createdAt: { type: Date, default: Date.now }
});

const ComplaintSuggestion = mongoose.model('ComplaintSuggestion', complaintSuggestionSchema);
module.exports = ComplaintSuggestion;
