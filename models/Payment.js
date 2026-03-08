const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    tuitionCode: { type: String, required: true },
    tuitionId: { type: String },
    createdBy: { type: String },
    updatedBy: { type: String },
    paymentReceivedDate: { type: Date },
    paymentReceivedDate2: { type: Date },
    paymentReceivedDate3: { type: Date },
    paymentReceivedDate4: { type: Date },
    duePayDate: { type: Date },
    paymentType: { type: String },
    paymentType2: { type: String },
    paymentType3: { type: String },
    paymentType4: { type: String },
    transactionId: { type: String },
    tutorName: { type: String },
    tutorNumber: { type: String },
    paymentNumber: { type: String },
    paymentNumber2: { type: String },
    paymentNumber3: { type: String },
    paymentNumber4: { type: String },
    receivedTk: { type: String },
    receivedTk2: { type: String },
    receivedTk3: { type: String },
    receivedTk4: { type: String },
    paymentStatus: { type: String },
    duePayment: { type: String },
    comment: { type: String },
    totalReceivedTk: { type: String },
    reference: { type: String },
    createdAt: { type: String },
    tuitionSalary: { type: String },
    totalPaymentTk: { type: String }, //total payment tk
    discount: { type: String },
    comment1: { type: String },
    comment2: { type: String },
    comment3: { type: String }
});

const Payment = mongoose.model('Payment', paymentSchema);
module.exports = Payment;