const mongoose = require('mongoose');


const paymentSchema = new mongoose.Schema({
    tuitionCode: { type: String, required: true },
    tuitionId: { type: String, required: true },
    paymentReceivedDate: { type: Date },
    duePayDate: { type: Date },
    paymentType: { type: String },
    transactionId: { type: String },
    tutorName: { type: String },
    tutorNumber: { type: String },
    paymentNumber: { type: String },
    receivedTk: { type: String },
    paymentStatus: { type: String },
    duePayment: { type: String },
    comment: { type: String },
    totalReceivedTk: { type: String }
});

const Payment = mongoose.model('Payment', paymentSchema);
module.exports = Payment;