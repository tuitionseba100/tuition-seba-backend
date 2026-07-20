require('dotenv').config();
const mongoose = require('mongoose');
const dns = require('dns');
const RegTeacher = require('./models/RegTeacher');

// Fix DNS resolution issues on the local machine
dns.setServers(['8.8.8.8', '8.8.4.4']);

const backfillPaymentDates = async () => {
    try {
        await mongoose.connect(process.env.DB_URI);
        console.log("Connected to MongoDB.");

        const filter = {
            $and: [
                { createdAt: { $exists: true, $ne: null } },
                { paymentDate: { $exists: false } },
                { amount: { $exists: true, $nin: ["", null] } }
            ]
        };

        const teachers = await RegTeacher.find(filter);
        console.log(`Found ${teachers.length} teachers to update.`);

        let updatedCount = 0;

        for (const teacher of teachers) {
            teacher.paymentDate = teacher.createdAt;
            await teacher.save({ validateModifiedOnly: true });
            updatedCount++;
        }

        console.log(`Successfully updated ${updatedCount} records.`);

    } catch (err) {
        console.error("Error during backfill:", err);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB.");
    }
};

backfillPaymentDates();
