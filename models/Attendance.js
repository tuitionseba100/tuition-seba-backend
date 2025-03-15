const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    userName: { type: String, required: true },
    role: { type: String, required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, default: null },
    duration: { type: String, default: null },
});

module.exports = mongoose.model('Attendance', AttendanceSchema);
