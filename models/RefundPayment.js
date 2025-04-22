const mongoose = require('mongoose');

const refundPaymentSchema = new mongoose.Schema({
    tuitionCode: { type: String, required: true },
    paymentType: { type: String },
    paymentNumber: { type: Number },
    personalPhone: { type: Number },
    amount: { type: Number },
    name: { type: String },
    note: { type: String },
    comment: { type: String },
    status: { type: String },
    requestedAt: { type: Date, default: Date.now }
});

const RefundPayment = mongoose.model('RefundPayment', refundPaymentSchema);
module.exports = RefundPayment;