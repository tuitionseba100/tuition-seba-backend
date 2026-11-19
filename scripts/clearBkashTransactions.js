require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');
const BkashTransaction = require('../models/BkashTransaction');

async function clearBkashData() {
    try {
        const uri = process.env.DB_URI || process.env.MONGODB_URI;
        if (!uri) {
            console.error('DB_URI not found in environment');
            process.exit(1);
        }

        console.log('Connecting to MongoDB...');
        await mongoose.connect(uri);
        console.log('Connected.');

        const count = await BkashTransaction.countDocuments();
        console.log(`Found ${count} bKash transaction record(s).`);

        if (count > 0) {
            const result = await BkashTransaction.deleteMany({});
            console.log(`Successfully cleared ${result.deletedCount} bKash transaction(s).`);
        } else {
            console.log('bKash transactions table is already empty.');
        }

        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
        process.exit(0);
    } catch (err) {
        console.error('Error clearing bKash transactions:', err);
        process.exit(1);
    }
}

clearBkashData();
