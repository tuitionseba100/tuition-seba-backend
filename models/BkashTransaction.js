const mongoose = require('mongoose');

const bkashTransactionSchema = new mongoose.Schema({
    paymentId: { 
        type: String, 
        required: true, 
        unique: true, 
        index: true 
    },
    trxId: { 
        type: String, 
        index: true 
    },
    tuitionCode: { 
        type: String, 
        default: '',
        index: true 
    },
    premiumCode: {
        type: String,
        default: '',
        index: true
    },
    tutorNumber: { 
        type: String, 
        default: '',
        index: true
    },
    tutorName: { 
        type: String 
    },
    amount: { 
        type: Number, 
        required: true 
    },
    currency: { 
        type: String, 
        default: 'BDT' 
    },
    intent: { 
        type: String, 
        default: 'sale' 
    },
    merchantInvoiceNumber: { 
        type: String, 
        required: true, 
        unique: true, 
        index: true 
    },
    status: { 
        type: String, 
        enum: ['Initiated', 'Completed', 'Failed', 'Cancelled'], 
        default: 'Initiated',
        index: true
    },
    payerAccount: { 
        type: String 
    },
    payerType: { 
        type: String 
    },
    customerMsisdn: { 
        type: String 
    },
    bkashResponse: { 
        type: mongoose.Schema.Types.Mixed 
    },
    linkedPaymentId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Payment' 
    },
    installmentSlotAssigned: {
        type: Number
    },
    callbackReceived: { 
        type: Boolean, 
        default: false 
    },
    callbackStatus: { 
        type: String 
    },
    errorCode: { 
        type: String 
    },
    errorMessage: { 
        type: String 
    },
    executedAt: { 
        type: Date 
    },
    queryCheckedAt: { 
        type: Date 
    }
}, {
    timestamps: true
});

const BkashTransaction = mongoose.model('BkashTransaction', bkashTransactionSchema);

module.exports = BkashTransaction;

