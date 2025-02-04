const mongoose = require('mongoose');

const tuitionSchema = new mongoose.Schema({
    tuitionCode: { type: String, required: true },
    isPublish: { type: Boolean, default: true },
    wantedTeacher: String,
    student: String,
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
    tutorNumber: String,
    joining: { type: String, default: '' },
    isUrgent: { type: Boolean, default: false },
});

const Tuition = mongoose.model('Tuition', tuitionSchema);
module.exports = Tuition;
