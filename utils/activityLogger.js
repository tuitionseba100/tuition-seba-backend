const ActivityLog = require('../models/ActivityLog');

/**
 * Logs an activity to the database.
 * @param {Object} req - The Express request object.
 * @param {string} action - The action performed (Create, Edit, Delete).
 * @param {string} module - The module name (Tuition, Payment, TeacherPayment).
 * @param {string} resourceId - The ID of the resource affected.
 * @param {Object} details - Additional details (before/after states or important fields).
 */
const logActivity = async (req, action, module, resourceId, details, overrideUser = null) => {
    try {
        const user = overrideUser || req.headers['x-user-name'] || 'System';
        
        // Extract tuitionCode if present in importantFields or explicitly passed in details
        let tuitionCode = details.tuitionCode;
        if (!tuitionCode && details.importantFields && details.importantFields.tuitionCode) {
            tuitionCode = details.importantFields.tuitionCode;
        }

        const log = new ActivityLog({
            user,
            action,
            module,
            resourceId,
            tuitionCode,
            details
        });
        await log.save();
    } catch (err) {
        console.error('Error logging activity:', err);
    }
};

/**
 * Compares two objects and returns the differences.
 * @param {Object} before - The object state before change.
 * @param {Object} after - The object state after change.
 * @returns {Object} { before: {}, after: {} }
 */
const getDifferences = (before, after) => {
    const b = {};
    const a = {};

    // Get all keys from both objects
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

    for (const key of keys) {
        // Skip Mongoose internal fields or timestamps if not needed
        if (['_id', '__v', 'createdAt', 'updatedAt'].includes(key)) continue;

        const valBefore = before[key];
        const valAfter = after[key];

        // Check for difference (simple equality check for now)
        if (JSON.stringify(valBefore) !== JSON.stringify(valAfter)) {
            b[key] = valBefore;
            a[key] = valAfter;
        }
    }

    return { before: b, after: a };
};

module.exports = { logActivity, getDifferences };
