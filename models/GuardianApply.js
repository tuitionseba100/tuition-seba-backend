const mongoose = require('mongoose');

const guardianApplySchema = new mongoose.Schema({
    name: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    studentClass: { type: String, required: true },
    teacherGender: { type: String, required: true },
    characteristics: { type: String, required: true },
});

const GuardianApply = mongoose.model('GuardianApply', guardianApplySchema);
module.exports = GuardianApply;