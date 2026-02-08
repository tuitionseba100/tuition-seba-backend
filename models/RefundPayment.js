const mongoose = require('mongoose');

const refundPaymentSchema = new mongoose.Schema({
    tuitionCode: { type: String, required: true },
    paymentType: { type: String },
    createdBy: {type: String},
    updatedBy: {type: String},
    paymentNumber: { type: String },
    personalPhone: { type: String },
    amount: { type: Number },
    name: { type: String },
    note: { type: String },
    comment: { type: String },
    status: { type: String },
    requestedAt: { type: Date, default: Date.now },
    commentFromAgent: { type: String },
});

const RefundPayment = mongoose.model('RefundPayment', refundPaymentSchema);
module.exports = RefundPayment;