const mongoose = require('mongoose');


const paymentSchema = new mongoose.Schema({
    tuitionCode: { type: String, required: true },
    tuitionId: { type: String, required: true },
    paymentReceivedDate: { type: Date, required: true },
    paymentType: { type: String, required: true },
    transactionId: { type: String, required: true },
    receivedTk: { type: Number, required: true },
    duePayment: { type: Number, required: true },
    comment: { type: String, required: true },
});

const Payment = mongoose.model('Payment', paymentSchema);
module.exports = Payment;