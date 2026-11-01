const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
    division: { 
        type: String, 
        required: true, 
        trim: true, 
        index: true 
    },
    district: { 
        type: String, 
        required: true, 
        trim: true, 
        index: true 
    },
    upazila_thana: { 
        type: String, 
        required: true, 
        trim: true, 
        index: true 
    },
    pourosova_union_ward: { 
        type: String, 
        required: true, 
        trim: true, 
        index: true 
    },
    type: { 
        type: String, 
        enum: ['pourosova', 'union', 'ward', 'other'], 
        default: 'union' 
    },
    areas: [{ 
        type: String, 
        trim: true 
    }],
    isActive: { 
        type: Boolean, 
        default: true 
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    },
    updatedAt: { 
        type: Date, 
        default: Date.now 
    }
}, {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Backward compatibility virtuals
locationSchema.virtual('upazila').get(function() {
    return this.upazila_thana;
});

locationSchema.virtual('pourosova_union').get(function() {
    return this.pourosova_union_ward;
});

// Compound unique index for uniqueness at Level 1 -> 2 -> 3 -> 4
locationSchema.index(
    { division: 1, district: 1, upazila_thana: 1, pourosova_union_ward: 1 }, 
    { unique: true }
);

// Text search index for global search
locationSchema.index({
    division: 'text',
    district: 'text',
    upazila_thana: 'text',
    pourosova_union_ward: 'text',
    areas: 'text'
});

const Location = mongoose.model('Location', locationSchema);

module.exports = Location;

