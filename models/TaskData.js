const mongoose = require('mongoose');

const taskDataSchema = new mongoose.Schema({
    employeeName: { type: String },
    employeeId: { type: String, required: true },
    tuitionCode: { type: String },
    tuitionId: { type: String },
    employeeRole: { type: String },
    task: { type: String },
    createdAt: { type: Date, default: Date.now },
    status: { type: String },
    comment: { type: String }
});

const TaskData = mongoose.model('TaskData', taskDataSchema);
module.exports = TaskData;