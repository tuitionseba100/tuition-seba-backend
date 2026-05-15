/**
 * ONE-TIME MIGRATION SCRIPT
 * --------------------------
 * Backfills missing phone numbers in TuitionApply records.
 * Also recalculates isSpam / isBest / isExpress from the Phone collection.
 *
 * Logic:
 *   1. Find all TuitionApply records where phone is missing/empty.
 *   2. For each, look up the RegTeacher by premiumCode.
 *   3. If found, normalize the teacher's phone.
 *   4. Check that phone against the Phone collection → set isSpam/isBest/isExpress.
 *   5. Update ONLY: phone, isSpam, isBest, isExpress — nothing else is touched.
 *   6. If no premiumCode or no teacher match or teacher has no phone → skip.
 *
 * Safety:
 *   - Uses $set with only the 4 fields above — all other fields are untouched.
 *   - Records with existing phones are excluded from the query entirely.
 *   - Dry-run mode prints what would be updated without writing to DB.
 *
 * Usage:
 *   node utils/backfillPhones.js          (live run)
 *   node utils/backfillPhones.js --dry    (dry run - no writes)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const TuitionApply = require('../models/TuitionApply');
const RegTeacher = require('../models/RegTeacher');
const Phone = require('../models/Phone');

const isDryRun = process.argv.includes('--dry');

// Normalize for comparison (strip country code, leading zeros)
function normalizePhoneForCompare(num) {
    if (!num || typeof num !== 'string') return '';
    let digits = num.replace(/\D/g, '');
    if (digits.startsWith('880')) digits = digits.slice(3);
    while (digits.startsWith('0')) digits = digits.slice(1);
    return digits;
}

// Normalize for saving (ensure 01XXXXXXXXX format)
function normalizePhoneForSave(phone) {
    if (!phone || typeof phone !== 'string') return null;
    let digits = phone.replace(/\D/g, '');
    if (!digits) return null;

    if (digits.startsWith('880')) {
        digits = digits.slice(3);
    } else if (digits.startsWith('0')) {
        // already has leading 0 — keep as is
    } else if (digits.startsWith('8')) {
        digits = '0' + digits;
    }

    // Ensure 11-digit format (01XXXXXXXXX)
    if (digits.length === 10 && !digits.startsWith('0')) {
        digits = '0' + digits;
    }

    return digits || null;
}

async function run() {
    const mongoUri = process.env.DB_URI || process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) {
        console.error('❌ DB_URI not found in .env');
        process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
    console.log(isDryRun ? '🔍 DRY RUN MODE — no writes will happen\n' : '⚡ LIVE RUN MODE — will write to DB\n');

    // Load the entire Phone collection once for spam/best/express lookup
    const phoneList = await Phone.find({ isActive: true }).lean();
    console.log(`📞 Loaded ${phoneList.length} active phone entries for spam/best/express lookup.\n`);

    // Find records where phone is missing, empty, or null
    const missingPhoneRecords = await TuitionApply.find({
        $or: [
            { phone: { $exists: false } },
            { phone: null },
            { phone: '' },
        ]
    }).select('_id premiumCode tuitionCode name').lean();

    console.log(`📋 Found ${missingPhoneRecords.length} TuitionApply records with missing phone.\n`);

    if (missingPhoneRecords.length === 0) {
        console.log('✅ Nothing to update. Exiting.');
        await mongoose.disconnect();
        return;
    }

    let updated = 0;
    let skippedNoPremiumCode = 0;
    let skippedNoTeacherMatch = 0;
    let skippedNoPhoneOnTeacher = 0;

    for (const record of missingPhoneRecords) {
        const { _id, premiumCode, tuitionCode, name } = record;

        // Skip if no premiumCode
        if (!premiumCode || premiumCode.trim() === '') {
            skippedNoPremiumCode++;
            console.log(`  ⏭ Skipped [${tuitionCode}] "${name}" — no premiumCode`);
            continue;
        }

        // Look up teacher by premiumCode
        const teacher = await RegTeacher.findOne({ premiumCode: premiumCode.trim() })
            .select('phone name')
            .lean();

        if (!teacher) {
            skippedNoTeacherMatch++;
            console.log(`  ⏭ Skipped [${tuitionCode}] "${name}" — premiumCode "${premiumCode}" not found in RegTeacher`);
            continue;
        }

        // Normalize teacher's phone for saving
        const normalizedPhone = normalizePhoneForSave(teacher.phone);

        if (!normalizedPhone) {
            skippedNoPhoneOnTeacher++;
            console.log(`  ⏭ Skipped [${tuitionCode}] "${name}" — teacher "${teacher.name}" found but has no phone`);
            continue;
        }

        // Check phone against Phone collection → isSpam / isBest / isExpress
        const normalizedForCompare = normalizePhoneForCompare(normalizedPhone);
        let isSpam = false;
        let isBest = false;
        let isExpress = false;

        for (const entry of phoneList) {
            const dbNormalized = normalizePhoneForCompare(entry.phone);
            if (dbNormalized === normalizedForCompare) {
                if (entry.isSpam) {
                    isSpam = true;
                } else if (entry.isExpress) {
                    isExpress = true;
                } else if (entry.isBest) {
                    isBest = true;
                }
                break;
            }
        }

        const tag = isSpam ? '🔴 SPAM' : isBest ? '⭐ BEST' : isExpress ? '🟢 EXPRESS' : '🔵 normal';

        // Build the update payload — ONLY these 4 fields
        const updatePayload = {
            phone: normalizedPhone,
            isSpam,
            isBest,
            isExpress,
        };

        if (isDryRun) {
            console.log(`  ✅ [DRY] [${tuitionCode}] "${name}" → phone: ${normalizedPhone} | ${tag}`);
        } else {
            await TuitionApply.findByIdAndUpdate(
                _id,
                { $set: updatePayload },
                { new: false }
            );
            console.log(`  ✅ Updated [${tuitionCode}] "${name}" → phone: ${normalizedPhone} | ${tag}`);
        }

        updated++;
    }

    console.log('\n========== SUMMARY ==========');
    console.log(`Total records with missing phone : ${missingPhoneRecords.length}`);
    console.log(`Updated (phone backfilled)       : ${updated}`);
    console.log(`Skipped (no premiumCode)         : ${skippedNoPremiumCode}`);
    console.log(`Skipped (no teacher match)       : ${skippedNoTeacherMatch}`);
    console.log(`Skipped (teacher has no phone)   : ${skippedNoPhoneOnTeacher}`);
    console.log(isDryRun ? '\n🔍 DRY RUN — no data was written.' : '\n✅ Migration complete.');

    await mongoose.disconnect();
}

run().catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
});
