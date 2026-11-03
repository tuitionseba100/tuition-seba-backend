require('dotenv').config();
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose');
const RegTeacher = require('../models/RegTeacher');

/**
 * Migration Script: Migrate 'city' to 'division' for legacy records
 * 
 * Safety Guarantees:
 * 1. ONLY updates `division` using MongoDB `$set`.
 * 2. Leaves `city`, `currentArea`, and all other fields strictly untouched.
 * 3. ONLY touches documents where `division` is currently empty/missing/null.
 * 4. Preserves `city` on the document as an archive/backup.
 */
async function migrateCityToDivision(dryRun = false) {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.DB_URI);
        console.log('MongoDB connected successfully.\n');

        // Condition for legacy records missing division
        const missingDivisionFilter = {
            $or: [
                { division: { $exists: false } },
                { division: null },
                { division: '' }
            ]
        };

        // 1. Preview counts
        const totalMissing = await RegTeacher.countDocuments(missingDivisionFilter);
        const ctgMatchCount = await RegTeacher.countDocuments({
            ...missingDivisionFilter,
            city: { $regex: /chittagong|chattogram/i }
        });
        const dhkMatchCount = await RegTeacher.countDocuments({
            ...missingDivisionFilter,
            city: { $regex: /dhaka/i }
        });
        
        // Check if there are other city values
        const otherCities = await RegTeacher.distinct('city', {
            ...missingDivisionFilter,
            city: { $exists: true, $nin: [/chittagong/i, /chattogram/i, /dhaka/i, null, ''] }
        });

        console.log('=== PRE-MIGRATION STATS ===');
        console.log(`Total teachers missing 'division': ${totalMissing}`);
        console.log(`- City matches Chittagong/Chattogram: ${ctgMatchCount}`);
        console.log(`- City matches Dhaka: ${dhkMatchCount}`);
        console.log(`- Other city values (if any):`, otherCities);
        console.log('===========================\n');

        if (dryRun) {
            console.log('DRY RUN ONLY. No records were modified.');
            await mongoose.disconnect();
            return;
        }

        // 2. Perform Migration for Chittagong (STRICTLY $set: { division: 'Chittagong' })
        console.log('Migrating Chittagong records...');
        const resCtg = await RegTeacher.updateMany(
            {
                ...missingDivisionFilter,
                city: { $regex: /chittagong|chattogram/i }
            },
            {
                $set: { division: 'Chittagong' }
            }
        );
        console.log(`✓ Chittagong updated: matched ${resCtg.matchedCount}, modified ${resCtg.modifiedCount}`);

        // 3. Perform Migration for Dhaka (STRICTLY $set: { division: 'Dhaka' })
        console.log('Migrating Dhaka records...');
        const resDhk = await RegTeacher.updateMany(
            {
                ...missingDivisionFilter,
                city: { $regex: /dhaka/i }
            },
            {
                $set: { division: 'Dhaka' }
            }
        );
        console.log(`✓ Dhaka updated: matched ${resDhk.matchedCount}, modified ${resDhk.modifiedCount}`);

        // 4. Verify post-migration state
        const remainingMissing = await RegTeacher.countDocuments(missingDivisionFilter);
        console.log(`\nRemaining teachers missing division: ${remainingMissing}`);
        console.log('Migration completed successfully! All other fields were strictly preserved.');

        await mongoose.disconnect();
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

// Pass --dry-run to preview without making changes
const isDry = process.argv.includes('--dry-run');
migrateCityToDivision(isDry);
