const mongoose = require('mongoose');

const chatDB = mongoose.createConnection(process.env.CHAT_DB_URI, {
    maxPoolSize: 20,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
});

chatDB.on('connected', () => console.log('Shared Chat Database connected successfully'));
chatDB.on('error', (err) => console.error('Shared Chat Database connection error:', err));

module.exports = chatDB;
