const mongoose = require('mongoose');

const tuitionApplySchema = new mongoose.Schema({
    tuitionCode: { type: String, required: true },
    tuitionId: { type: String, required: true },
    premiumCode: { type: String },
    name: { type: String },
    phone: { type: String },
    institute: { type: String },
    createdBy: { type: String },
    updatedBy: { type: String },
    department: { type: String },
    address: { type: String },
    status: { type: String },
    comment: { type: String },
    commentForTeacher: { type: String },
    isSpam: { type: Boolean, default: false },
    isBest: { type: Boolean, default: false },
    isExpress: { type: Boolean, default: false },
    hasDue: { type: Boolean, default: false },
    appliedAt: { type: Date, default: Date.now }
});

const TuitionApply = mongoose.model('TuitionApply', tuitionApplySchema);
module.exports = TuitionApply;