const mongoose = require('mongoose');

const statusHistorySchema = new mongoose.Schema({
    module: { 
        type: String, 
        enum: ['RegTeacher', 'TuitionApply', 'Tuition'], 
        required: true 
    },
    resourceId: { 
        type: String, 
        required: true 
    },
    tuitionCode: { 
        type: String 
    },
    oldStatus: { 
        type: String 
    },
    newStatus: { 
        type: String, 
        required: true 
    },
    changedBy: { 
        type: String, 
        required: true 
    },
    timestamp: { 
        type: Date, 
        default: Date.now 
    }
});

statusHistorySchema.index({ timestamp: -1 });
statusHistorySchema.index({ module: 1, resourceId: 1, timestamp: -1 });
statusHistorySchema.index({ module: 1, newStatus: 1, timestamp: -1 });
statusHistorySchema.index({ tuitionCode: 1, timestamp: -1 });
statusHistorySchema.index({ changedBy: 1, timestamp: -1 });

module.exports = mongoose.model('StatusHistory', statusHistorySchema);
