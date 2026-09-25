const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    userName: { type: String },
    name: { type: String },
    role: { type: String, required: true },
    startTime: { type: Date, required: true, index: true },
    endTime: { type: Date, default: null, index: true },
    duration: { type: String, default: null },
});

// Compound indexes for high-speed queries
AttendanceSchema.index({ userId: 1, endTime: 1 });
AttendanceSchema.index({ userId: 1, startTime: -1 });
AttendanceSchema.index({ startTime: -1 });

module.exports = mongoose.model('Attendance', AttendanceSchema);
