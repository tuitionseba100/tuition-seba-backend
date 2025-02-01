const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // No encryption
    role: { type: String, required: true },
    status: { type: String, default: 'approved' }, // 'approved', 'pending'
});

const User = mongoose.model('User', userSchema);
module.exports = User;
