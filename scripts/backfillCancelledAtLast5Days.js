const mongoose = require('mongoose');
const dns = require('node:dns');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Ensure DNS works reliably on all networks for MongoDB SRV
dns.setServers(['8.8.8.8', '1.1.1.1']);

const TuitionApply = require('../models/TuitionApply');
const StatusHistory = require('../models/StatusHistory');

async function run() {
    const isDryRun = process.argv.includes('--dry-run');

    console.log('--- BACKFILL CANCELLED_AT SCRIPT (LAST 5 DAYS) ---');
    console.log(`Mode: ${isDryRun ? 'DRY-RUN (No changes will be written)' : 'LIVE (Will update database)'}`);

    if (!process.env.DB_URI) {
        console.error('ERROR: DB_URI not found in environment.');
        process.exit(1);
    }

    await mongoose.connect(process.env.DB_URI);
    console.log('MongoDB connected successfully.\n');

    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    console.log(`Looking for records created or cancelled since: ${fiveDaysAgo.toISOString()}`);

    // Step 1: Find recent cancellation logs from StatusHistory in the last 5 days
    const recentLogs = await StatusHistory.find({
        module: 'TuitionApply',
        newStatus: new RegExp('^cancelled by teacher$', 'i'),
        timestamp: { $gte: fiveDaysAgo }
    }).sort({ timestamp: -1 }).lean();

    const loggedResourceIds = [...new Set(recentLogs.map(l => l.resourceId))];

    // Step 2: Find TuitionApply records that either:
    // a) Match one of the recent cancel logs, OR
    // b) Have appliedAt >= fiveDaysAgo and status = 'cancelled by teacher'
    // and do NOT already have cancelledAt set
    const candidates = await TuitionApply.find({
        status: new RegExp('^cancelled by teacher$', 'i'),
        $or: [
            { _id: { $in: loggedResourceIds } },
            { appliedAt: { $gte: fiveDaysAgo } }
        ],
        $and: [
            { $or: [{ cancelledAt: { $exists: false } }, { cancelledAt: null }] }
        ]
    }).lean();

    console.log(`Found ${candidates.length} candidate record(s) needing cancelledAt.\n`);

    let updatedCount = 0;

    for (const apply of candidates) {
        // Find best timestamp from StatusHistory
        const matchLog = recentLogs.find(l => l.resourceId === apply._id.toString());
        let cancelTimestamp = null;
        let source = '';

        if (matchLog && matchLog.timestamp) {
            cancelTimestamp = matchLog.timestamp;
            source = 'StatusHistory';
        } else {
            // If no status history log exists, fallback to appliedAt
            cancelTimestamp = apply.appliedAt || new Date();
            source = 'appliedAt fallback';
        }

        console.log(`- [${apply.tuitionCode || 'NO-CODE'}] ID: ${apply._id} | Teacher: ${apply.name || '-'} (${apply.phone || '-'})`);
        console.log(`    Target cancelledAt: ${new Date(cancelTimestamp).toISOString()} (Source: ${source})`);

        if (!isDryRun) {
            await TuitionApply.updateOne(
                { _id: apply._id },
                { $set: { cancelledAt: cancelTimestamp } }
            );
            console.log(`    -> UPDATED successfully.`);
        }
        updatedCount++;
    }

    console.log(`\nFinished! Total records ${isDryRun ? 'identified' : 'updated'}: ${updatedCount}`);
    await mongoose.disconnect();
    console.log('MongoDB disconnected.');
}

run().catch(err => {
    console.error('Fatal error during migration:', err);
    process.exit(1);
});
