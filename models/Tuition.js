const mongoose = require('mongoose');

const tuitionSchema = new mongoose.Schema({
    tuitionCode: { type: String, required: true },
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
    status: String,
    note: String,
    taskAssignedTo: String,
    tutorNumber: String,
    updatedBy: String,
    lastAvailableCheck: { type: Date },
    lastUpdate: { type: Date },
    lastUpdaeComment: { type: String },
    nextUpdateDate: { type: Date },
    nexrUpdateComment: { type: String },
    comment1: { type: String },
    comment2: { type: String },
    isWhatsappApply: { type: Boolean, default: false },
    joining: { type: String, default: '' },
    isUrgent: { type: Boolean, default: false },
}, {
    timestamps: true
});

const Tuition = mongoose.model('Tuition', tuitionSchema);
module.exports = Tuition;
