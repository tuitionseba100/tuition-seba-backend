const StatusHistory = require('../models/StatusHistory');

/**
 * Logs a status transition to the StatusHistory collection.
 * @param {Object} req - The Express request object.
 * @param {string} moduleName - The module name ('RegTeacher', 'TuitionApply', 'Tuition').
 * @param {string} resourceId - The database ID of the document.
 * @param {string} oldStatus - The status before update.
 * @param {string} newStatus - The status after update.
 * @param {string} [tuitionCode] - Optional code for quick lookup.
 * @param {string} [overrideUser] - Override performer of the action.
 */
const logStatusChange = async (req, moduleName, resourceId, oldStatus, newStatus, tuitionCode = null, overrideUser = null) => {
    try {
        // Only log if the status actually changed
        if (oldStatus === newStatus) return;

        const changedBy = overrideUser || req.headers['x-user-name'] || 'System';

        const history = new StatusHistory({
            module: moduleName,
            resourceId: resourceId.toString(),
            tuitionCode,
            oldStatus,
            newStatus,
            changedBy
        });

        await history.save();
    } catch (err) {
        console.error('Error logging status change:', err);
    }
};

module.exports = { logStatusChange };
