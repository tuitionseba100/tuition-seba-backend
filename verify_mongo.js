const mongoose = require('mongoose');
const dns = require('node:dns');
require('dotenv').config();

dns.setServers(['8.8.8.8', '1.1.1.1']);

console.log('Connecting to MongoDB...');
mongoose.connect(process.env.DB_URI)
    .then(() => {
        console.log('Verification Successful: MongoDB connected');
        process.exit(0);
    })
    .catch(err => {
        console.error('Verification Failed: MongoDB connection error:', err);
        process.exit(1);
    });
