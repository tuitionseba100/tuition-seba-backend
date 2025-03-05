const mongoose = require('mongoose');

const guardianApplySchema = new mongoose.Schema({
    name: { type: String },
    phone: { type: String, required: true },
    address: { type: String },
    studentClass: { type: String },
    teacherGender: { type: String },
    characteristics: { type: String },
    status: { type: String },
    comment: { type: String, default: "" },
    appliedAt: { type: Date, default: Date.now }
});

const GuardianApply = mongoose.model('GuardianApply', guardianApplySchema);
module.exports = GuardianApply;