const mongoose = require('mongoose');
const dns = require('node:dns');

// Set global DNS servers to resolve MongoDB SRV records reliably
dns.setServers(['8.8.8.8', '1.1.1.1']);

require('dotenv').config();

const ChatMessage = require('./models/ChatMessage');
const ChatSession = require('./models/ChatSession');

if (!process.env.DB_URI) {
    console.error('Error: DB_URI is not set in the environment variables (.env file)');
    process.exit(1);
}

mongoose.connect(process.env.DB_URI)
    .then(async () => {
        console.log('MongoDB connected successfully. Clearing chat records...');
        
        const messageDeleteResult = await ChatMessage.deleteMany({});
        console.log(`Deleted ${messageDeleteResult.deletedCount} chat messages.`);
        
        const sessionDeleteResult = await ChatSession.deleteMany({});
        console.log(`Deleted ${sessionDeleteResult.deletedCount} chat sessions.`);
        
        console.log('All chat records successfully cleared!');
        mongoose.connection.close();
        process.exit(0);
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });
