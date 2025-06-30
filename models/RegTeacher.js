const mongoose = require('mongoose');

const teacherSchema = new mongoose.Schema({
    name: { type: String },
    gender: { type: String },
    phone: { type: String },
    alternativePhone: { type: String },
    photo: { type: String },
    whatsapp: { type: String },
    email: { type: String },
    facebookLink: { type: String },
    familyPhone: { type: String },
    friendPhone: { type: String },
    city: { type: String },
    currentArea: { type: String },
    expectedTuitionAreas: { type: String },
    fullAddress: { type: String },
    university: { type: String },
    department: { type: String },
    academicYear: { type: String },
    medium: { type: String },
    mastersDept: { type: String },
    mastersUniversity: { type: String },
    honorsDept: { type: String },
    honorsUniversity: { type: String },
    hscGroup: { type: String },
    hscResult: { type: String },
    sscGroup: { type: String },
    sscResult: { type: String },
    experience: { type: String },
    favoriteSubject: { type: String },
    premiumCode: { type: String },
    password: { type: String },
    status: { type: String },
    transactionId: { type: String },
    paymentType: { type: String },
    amount: { type: String },
    commentFromTeacher: { type: String },
    comment: { type: String },
    createdAt: { type: Date, default: Date.now }
});

const RegTeacher = mongoose.model('RegTeacher', teacherSchema);
module.exports = RegTeacher;
