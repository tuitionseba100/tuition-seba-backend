const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, required: true },
    name: { type: String, required: true },
    status: { type: String, default: 'approved' },
    permissions: { type: [String], default: [] },
    isLocked: { type: Boolean, default: false },
    autoLock: { type: Boolean, default: false }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
module.exports = User;
