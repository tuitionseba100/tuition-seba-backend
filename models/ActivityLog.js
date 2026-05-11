const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
    user: { type: String, required: true },
    action: { type: String, enum: ['Create', 'Edit', 'Delete'], required: true },
    module: { type: String, required: true },
    resourceId: { type: String, required: true },
    tuitionCode: { type: String },
    details: {
        before: { type: mongoose.Schema.Types.Mixed },
        after: { type: mongoose.Schema.Types.Mixed },
        importantFields: { type: mongoose.Schema.Types.Mixed }
    },
    timestamp: { type: Date, default: Date.now }
});

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);
module.exports = ActivityLog;
