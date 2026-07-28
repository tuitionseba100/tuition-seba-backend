const mongoose = require('mongoose');
const dns = require('node:dns');

// Set global DNS servers to resolve MongoDB SRV records reliably
dns.setServers(['8.8.8.8', '1.1.1.1']);

require('dotenv').config();

const ExistingGuardian = require('./models/ExistingGuardian');
const Tuition = require('./models/Tuition');

async function seed() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(process.env.DB_URI);
        console.log('Connected to MongoDB.');

        const guardians = await ExistingGuardian.find({});
        console.log(`Found ${guardians.length} guardians to process.`);

        let processedCount = 0;
        let updatedCount = 0;

        for (const guardian of guardians) {
            processedCount++;
            if (guardian.tuitionCodes && guardian.tuitionCodes.length > 0) {
                // Find all corresponding tuitions
                const tuitionsFromDb = await Tuition.find({
                    tuitionCode: { $in: guardian.tuitionCodes }
                }).lean();

                const tuitionMap = {};
                for (const t of tuitionsFromDb) {
                    tuitionMap[t.tuitionCode] = {
                        tuitionId: t._id,
                        status: t.status || 'pending'
                    };
                }

                // Construct tuitions array
                const newTuitions = guardian.tuitionCodes.map(code => {
                    const info = tuitionMap[code];
                    return {
                        tuitionId: info ? info.tuitionId : null,
                        code: code,
                        status: info ? info.status : 'pending'
                    };
                });

                guardian.tuitions = newTuitions;
                await guardian.save();
                updatedCount++;
            }

            if (processedCount % 50 === 0 || processedCount === guardians.length) {
                console.log(`Processed ${processedCount}/${guardians.length} guardians...`);
            }
        }

        console.log(`Successfully completed. Seeded/updated ${updatedCount} guardians with tuition statuses and IDs.`);
    } catch (err) {
        console.error('Error during seeding:', err);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
    }
}

seed();
