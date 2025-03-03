const mongoose = require('mongoose');


const paymentSchema = new mongoose.Schema({
    tuitionCode: { type: String, required: true },
    tuitionId: { type: String, required: true },
    paymentReceivedDate: { type: Date, required: true },
    paymentType: { type: String, required: true },
    transactionId: { type: String, required: true },
    tutorName: { type: String, required: true },
    tutorNumber: { type: String, required: true },
    paymentNumber: { type: String, required: true },
    receivedTk: { type: String, required: true },
    duePayment: { type: String, required: true },
    comment: { type: String, required: true },
});

const Payment = mongoose.model('Payment', paymentSchema);
module.exports = Payment;