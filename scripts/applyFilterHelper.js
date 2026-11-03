const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'routes', 'regTeacherRoutes.js');
let raw = fs.readFileSync(filePath, 'utf8');

const isCRLF = raw.includes('\r\n');
let content = raw.replace(/\r\n/g, '\n');

const startMarker = "router.get('/getTableData', authMiddleware, async (req, res) => {";
const endMarker = "router.get('/check-exists', async (req, res) => {";

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
    console.error('Markers not found!');
    process.exit(1);
}

const replacement = `// Helper to construct uniform teacher filters for /getTableData and /summary
function buildTeacherFilter(query) {
    const {
        premiumCode = '',
        phone = '',
        status,
        gender,
        name,
        currentArea,
        uniCode,
        department,
        referStatus,
        referPersonPhone = '',
        isInfoVerified,
        city,
        division,
        district,
        thana
    } = query;

    const filter = {};
    const andConditions = [];

    if (isInfoVerified !== undefined && isInfoVerified !== '') {
        const isVerified = isInfoVerified === 'true' || isInfoVerified === true;
        filter.isInfoVerified = isVerified ? true : { $ne: true };
    }

    if (premiumCode && premiumCode.trim()) {
        filter.premiumCode = new RegExp(escapeRegex(premiumCode.trim()), 'i');
    }

    if (phone && phone.trim()) {
        const pRegex = new RegExp(escapeRegex(phone.trim()), 'i');
        andConditions.push({
            $or: [
                { phone: pRegex },
                { alternativePhone: pRegex },
                { whatsapp: pRegex }
            ]
        });
    }

    if (department && department.trim()) {
        const deptRegex = new RegExp(escapeRegex(department.trim()), 'i');
        andConditions.push({
            $or: [
                { department: deptRegex },
                { mastersDept: deptRegex },
                { honorsDept: deptRegex }
            ]
        });
    }

    // City / Division filter
    const targetDivision = (division || city || '').trim();
    if (targetDivision) {
        let divPattern = escapeRegex(targetDivision);
        if (/^(chittagong|chattogram)$/i.test(targetDivision)) {
            divPattern = '(?:chittagong|chattogram)';
        }
        const divRegex = new RegExp('^' + divPattern + '$', 'i');
        andConditions.push({
            $or: [
                { division: divRegex },
                { city: divRegex }
            ]
        });
    }

    // District filter
    if (district && district.trim()) {
        const distRegex = new RegExp('^' + escapeRegex(district.trim()) + '$', 'i');
        andConditions.push({
            $or: [
                { district: distRegex },
                { city: distRegex }
            ]
        });
    }

    // Thana filter
    if (thana && thana.trim()) {
        const thanaRegex = new RegExp('^' + escapeRegex(thana.trim()) + '$', 'i');
        andConditions.push({
            $or: [
                { thana: thanaRegex },
                { currentArea: new RegExp(escapeRegex(thana.trim()), 'i') }
            ]
        });
    }

    if (status && status.trim()) {
        filter.status = status.trim();
    }

    if (gender && gender.trim()) {
        filter.gender = gender.trim();
    }

    if (name && name.trim()) {
        filter.name = new RegExp(escapeRegex(name.trim()), 'i');
    }

    if (currentArea && currentArea.trim()) {
        filter.currentArea = new RegExp(escapeRegex(currentArea.trim()), 'i');
    }

    if (uniCode) {
        if (uniCode === 'Not Assigned') {
            filter.uniCode = { $in: [null, ''] };
        } else if (uniCode.trim()) {
            filter.uniCode = new RegExp(escapeRegex(uniCode.trim()), 'i');
        }
    }

    if (referStatus && referStatus.trim()) {
        filter.referStatus = referStatus.trim();
    }

    if (referPersonPhone && referPersonPhone.trim()) {
        filter.referPersonPhone = new RegExp(escapeRegex(referPersonPhone.trim()), 'i');
    }

    if (andConditions.length > 0) {
        filter.$and = andConditions;
    }

    return filter;
}

router.get('/getTableData', authMiddleware, async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 50;

    const filter = buildTeacherFilter(req.query);

    try {
        const total = await RegTeacher.countDocuments(filter);
        const data = await RegTeacher.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        res.json({
            data,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalRecords: total
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/summary', authMiddleware, async (req, res) => {
    const filter = buildTeacherFilter(req.query);

    try {
        const countsAggregation = await RegTeacher.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        const counts = {
            pending: 0,
            under_review: 0,
            pending_payment: 0,
            rejected: 0,
            verified: 0,
            premium: 0,
            elite: 0
        };

        let total = 0;
        countsAggregation.forEach(item => {
            const stat = item._id?.toLowerCase();
            total += item.count;
            if (stat === 'pending') counts.pending = item.count;
            else if (stat === 'under review') counts.under_review = item.count;
            else if (stat === 'pending payment') counts.pending_payment = item.count;
            else if (stat === 'rejected') counts.rejected = item.count;
            else if (stat === 'verified') counts.verified = item.count;
            else if (stat === 'premium') counts.premium = item.count;
            else if (stat === 'elite') counts.elite = item.count;
        });

        let records = [];
        if (req.query.allData === 'true') {
            records = await RegTeacher.find(filter)
                .select('name gender currentArea academicYear mastersDept mastersUniversity honorsDept honorsUniversity premiumCode uniCode sscResult hscResult experience favoriteSubject hscGroup sscGroup school college status isInfoVerified isBiodataShow isResultShow division district thana city')
                .lean();
        }

        res.json({
            ...counts,
            total,
            allData: records
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});\n\n`;

content = content.substring(0, startIndex) + replacement + content.substring(endIndex);

fs.writeFileSync(filePath, isCRLF ? content.replace(/\n/g, '\r\n') : content, 'utf8');
console.log('Successfully updated regTeacherRoutes.js with clean filter logic!');

