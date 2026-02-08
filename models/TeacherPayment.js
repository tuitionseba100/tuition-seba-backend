const mongoose = require('mongoose');

const teacherPaymentSchema = new mongoose.Schema({
    tuitionCode: { type: String, required: true },
    paymentType: { type: String },
    paymentNumber: { type: String },
    personalPhone: { type: String },
    transactionId: { type: String },
    createdBy: { type: String },
    updatedBy: { type: String },
    amount: { type: Number },
    name: { type: String },
    note: { type: String },
    comment: { type: String },
    discount: { type: String },
    totalAmount: { type: String },
    dueAmount: { type: String },
    status: { type: String },
    requestedAt: { type: Date, default: Date.now },
    commentFromAgent: { type: String },
});

const TeacherPayment = mongoose.model('TeacherPayment', teacherPaymentSchema);
module.exports = TeacherPayment;