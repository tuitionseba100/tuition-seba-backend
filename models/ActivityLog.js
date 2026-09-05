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

activityLogSchema.index({ timestamp: -1 });
activityLogSchema.index({ module: 1, action: 1, timestamp: -1 });
activityLogSchema.index({ user: 1, timestamp: -1 });
activityLogSchema.index({ tuitionCode: 1, timestamp: -1 });

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);
module.exports = ActivityLog;
