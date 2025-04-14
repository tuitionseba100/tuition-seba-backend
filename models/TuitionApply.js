const mongoose = require('mongoose');

const tuitionApplySchema = new mongoose.Schema({
    tuitionCode: { type: String, required: true },
    tuitionId: { type: String, required: true },
    name: { type: String },
    phone: { type: String },
    institute: { type: String },
    department: { type: String },
    address: { type: String },
    status: { type: String },
    comment: { type: String },
    appliedAt: { type: Date, default: Date.now }
});

const TuitionApply = mongoose.model('TuitionApply', tuitionApplySchema);
module.exports = TuitionApply;