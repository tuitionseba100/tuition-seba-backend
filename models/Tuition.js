const mongoose = require('mongoose');

const tuitionSchema = new mongoose.Schema({
    tuitionCode: { type: String, required: true, unique: true, index: true },
    isPublish: { type: Boolean, default: true },
    wantedTeacher: String,
    student: String,
    institute: String,
    class: String,
    medium: String,
    subject: String,
    time: String,
    day: String,
    salary: String,
    location: String,
    area: String,
    guardianNumber: String,
    city: String,
    status: String,
    note: String,
    taskAssignedTo: String,
    tutorNumber: String,
    createdBy: String,
    updatedBy: String,
    lastAvailableCheck: { type: Date },
    lastUpdate: { type: Date },
    lastUpdateComment: { type: String },
    nextUpdateDate: { type: Date },
    nextUpdateComment: { type: String },
    comment1: { type: String },
    comment2: { type: String },
    isWhatsappApply: { type: Boolean, default: false },
    joining: { type: String, default: '' },
    isUrgent: { type: Boolean, default: false },
    isPaymentCreated: { type: Boolean, default: false },
    assignedTo: { type: String, default: '' },
    isSpamGuardian: { type: Boolean, default: false },
    isBestGuardian: { type: Boolean, default: false },
    isReviewDone: { type: Boolean, default: false },
    isSoftDelete: { type: Boolean, default: false },
}, {
    timestamps: true
});

const Tuition = mongoose.model('Tuition', tuitionSchema);
module.exports = Tuition;
