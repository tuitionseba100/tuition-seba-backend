const mongoose = require('mongoose');

const existingGuardianSchema = new mongoose.Schema({
    guardianNumber: { type: String, required: true, unique: true, index: true },
    tuitionCodes: [{ type: String }],
    tuitions: [{
        tuitionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tuition' },
        code: { type: String, required: true },
        status: { type: String }
    }],
    areas: [{ type: String }],
    classes: [{ type: String }],
    subjects: [{ type: String }],
    guardianBehavior: { type: String, default: "" },
    isSpam: { type: Boolean, default: false, index: true },
    isBestGuardian: { type: Boolean, default: false, index: true },
    lastTuitionDate: { type: Date }
}, {
    timestamps: true
});

const ExistingGuardian = mongoose.model('ExistingGuardian', existingGuardianSchema);
module.exports = ExistingGuardian;
