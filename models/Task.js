const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
    employeeName: { type: String },
    employeeId: { type: String, required: true },
    employeeRole: { type: String },
    task: { type: String },
    createdAt: { type: Date, default: Date.now },
    status: { type: String },
    comment: { type: String }
});

const Task = mongoose.model('GuardianApply', taskSchema);
module.exports = Task;