const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
    tuitionCode: { type: String },
    phone: { type: String },
    name: { type: String },
    number: { type: String },
    employeeId: { type: String },
    employeeName: { type: String },
    createdBy: { type: String },
    status: { type: String },
    note: { type: String },
    followUpDate: { type: Date },
    followUpComment: { type: String }
}, {
    timestamps: true
});

const Lead = mongoose.model('Lead', leadSchema);
module.exports = Lead;