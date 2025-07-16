const mongoose = require('mongoose');

const phoneSchema = new mongoose.Schema({
    phone: { type: String, required: true },
    note: { type: String },
    createdAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
    isSpam: { type: Boolean, default: true },
});

const Phone = mongoose.model('Phone', phoneSchema);
module.exports = Phone;