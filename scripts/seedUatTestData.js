require('dotenv').config();
const mongoose = require('mongoose');
const Payment = require('../models/Payment');

async function seedUatData() {
    try {
        const uri = process.env.DB_URI || process.env.MONGODB_URI;
        if (!uri) {
            console.error('DB_URI / MONGODB_URI not found in environment');
            process.exit(1);
        }

        await mongoose.connect(uri);
        console.log('Connected to MongoDB');

        // Test Record 1: Normal UAT payment / Duplicate test
        const testCode1 = 'UAT-TEST-01';
        await Payment.findOneAndUpdate(
            { tuitionCode: testCode1 },
            {
                tuitionCode: testCode1,
                premiumCode: 'UAT-TEACHER-01',
                tutorName: 'bKash UAT Tester',
                tutorNumber: '01973920728',
                totalPaymentTk: '100',
                receivedTk: '0',
                duePayment: '100',
                paymentStatus: 'Due',
                createdAt: new Date().toISOString()
            },
            { upsert: true, new: true }
        );
        console.log(`Test record 1 created/updated: Tuition Code ${testCode1}`);

        // Test Record 2: For duplicate check or alternative test
        const testCode2 = 'UAT-TEST-02';
        await Payment.findOneAndUpdate(
            { tuitionCode: testCode2 },
            {
                tuitionCode: testCode2,
                premiumCode: 'UAT-TEACHER-02',
                tutorName: 'bKash UAT Tester 2',
                tutorNumber: '01973920728',
                totalPaymentTk: '100',
                receivedTk: '0',
                duePayment: '100',
                paymentStatus: 'Due',
                createdAt: new Date().toISOString()
            },
            { upsert: true, new: true }
        );
        console.log(`Test record 2 created/updated: Tuition Code ${testCode2}`);

        await mongoose.disconnect();
        console.log('Done!');
        process.exit(0);
    } catch (err) {
        console.error('Seeding failed:', err);
        process.exit(1);
    }
}

seedUatData();
