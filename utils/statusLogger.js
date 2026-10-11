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
const logStatusChange = async (req, moduleName, resourceId, oldStatus, newStatus, tuitionCode = null, overrideUser = null, comment = '', subStatus = '') => {
    try {
        // Log if status changed OR if a transition comment/subStatus is provided
        if (oldStatus === newStatus && !comment && !subStatus) return;

        const changedBy = overrideUser || 
            (req && req.headers ? req.headers['x-user-name'] : null) || 
            (req && req.user ? (req.user.username || req.user.name) : null) || 
            'System';

        const history = new StatusHistory({
            module: moduleName,
            resourceId: resourceId.toString(),
            tuitionCode,
            oldStatus,
            newStatus,
            subStatus: subStatus || '',
            comment: comment || '',
            changedBy
        });

        await history.save();
        return history;
    } catch (err) {
        console.error('Error logging status change:', err);
    }
};

module.exports = { logStatusChange };
