const mongoose = require('mongoose');

const serviceChargeSchema = new mongoose.Schema({
    referenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'RefundPayment' },
    tuitionCode: { type: String },
    name: { type: String },
    paymentNumber: { type: String },
    personalPhone: { type: String },
    amount: { type: Number },
    comment: { type: String },
    date: { type: Date },
    createdAt: { type: Date, default: Date.now },
    modifiedAt: { type: Date },
    createdBy: { type: String },
    updatedBy: { type: String },
    status: { type: String, default: 'completed' }
});

const ServiceCharge = mongoose.model('ServiceCharge', serviceChargeSchema);
module.exports = ServiceCharge;
