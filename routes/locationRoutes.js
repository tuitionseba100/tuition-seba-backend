const express = require('express');
const router = express.Router();
const Location = require('../models/Location');
const { authMiddleware } = require('../middleware/auth');

// 1. Get statistics overview
router.get('/stats', authMiddleware, async (req, res) => {
    try {
        const totalUnits = await Location.countDocuments();
        const divisions = await Location.distinct('division');
        const districts = await Location.distinct('district');
        const upazilas = await Location.distinct('upazila_thana');

        res.json({
            success: true,
            stats: {
                totalDivisions: divisions.length,
                totalDistricts: districts.length,
                totalUpazilasThanas: upazilas.length,
                totalPourosovaUnionWards: totalUnits
            }
        });
    } catch (err) {
        console.error('Error fetching location stats:', err);
        res.status(500).json({ success: false, message: 'Server error fetching location stats' });
    }
});

// 2. Get distinct Divisions
router.get('/divisions', async (req, res) => {
    try {
        const divisions = await Location.distinct('division');
        divisions.sort((a, b) => a.localeCompare(b));
        res.json({ success: true, divisions });
    } catch (err) {
        console.error('Error fetching divisions:', err);
        res.status(500).json({ success: false, message: 'Server error fetching divisions' });
    }
});

// 3. Get distinct Districts (optionally filter by division)
router.get('/districts', async (req, res) => {
    try {
        const { division } = req.query;
        const filter = {};
        if (division) filter.division = division;

        const districts = await Location.distinct('district', filter);
        districts.sort((a, b) => a.localeCompare(b));
        res.json({ success: true, districts });
    } catch (err) {
        console.error('Error fetching districts:', err);
        res.status(500).json({ success: false, message: 'Server error fetching districts' });
    }
});

// 4. Get distinct Upazilas / Thanas (optionally filter by division & district)
router.get('/upazilas', async (req, res) => {
    try {
        const { division, district } = req.query;
        const filter = {};
        if (division) filter.division = division;
        if (district) filter.district = district;

        const upazilas = await Location.distinct('upazila_thana', filter);
        upazilas.sort((a, b) => a.localeCompare(b));
        res.json({ success: true, upazilas });
    } catch (err) {
        console.error('Error fetching upazilas/thanas:', err);
        res.status(500).json({ success: false, message: 'Server error fetching upazilas/thanas' });
    }
});

// 5. Get Pourosovas, Unions & Wards (filter by district and upazila/thana)
router.get('/pourosova-unions', async (req, res) => {
    try {
        const { division, district, upazila, upazila_thana } = req.query;
        const targetUpazila = upazila_thana || upazila;
        const filter = {};
        if (division) filter.division = division;
        if (district) filter.district = district;
        if (targetUpazila) filter.upazila_thana = targetUpazila;

        const units = await Location.find(filter)
            .select('division district upazila_thana pourosova_union_ward type areas isActive')
            .sort({ pourosova_union_ward: 1 })
            .lean();

        // Map for frontend convenience
        const mappedUnits = units.map(u => ({
            ...u,
            upazila: u.upazila_thana,
            pourosova_union: u.pourosova_union_ward
        }));

        res.json({ success: true, units: mappedUnits });
    } catch (err) {
        console.error('Error fetching pourosova-unions:', err);
        res.status(500).json({ success: false, message: 'Server error fetching pourosova-unions' });
    }
});

// 6. Get Areas for a specific unit (by locationId or query)
router.get('/areas', async (req, res) => {
    try {
        const { locationId, division, district, upazila, upazila_thana, pourosova_union, pourosova_union_ward } = req.query;
        let unit = null;

        if (locationId) {
            unit = await Location.findById(locationId).lean();
        } else {
            const targetUpazila = upazila_thana || upazila;
            const targetUnit = pourosova_union_ward || pourosova_union;

            if (targetUnit && targetUpazila) {
                const filter = {
                    upazila_thana: targetUpazila,
                    pourosova_union_ward: targetUnit
                };
                if (district) filter.district = district;
                if (division) filter.division = division;
                unit = await Location.findOne(filter).lean();
            }
        }

        if (!unit) {
            return res.json({ success: true, areas: [] });
        }

        res.json({
            success: true,
            locationId: unit._id,
            division: unit.division,
            district: unit.district,
            upazila: unit.upazila_thana,
            upazila_thana: unit.upazila_thana,
            pourosova_union: unit.pourosova_union_ward,
            pourosova_union_ward: unit.pourosova_union_ward,
            type: unit.type,
            areas: unit.areas || []
        });
    } catch (err) {
        console.error('Error fetching areas:', err);
        res.status(500).json({ success: false, message: 'Server error fetching areas' });
    }
});

// 7. Add Area to a Pourosova/Union/Ward
router.post('/areas', authMiddleware, async (req, res) => {
    try {
        const { locationId, area, division, district, upazila, upazila_thana, pourosova_union, pourosova_union_ward } = req.body;
        if (!area || !area.trim()) {
            return res.status(400).json({ success: false, message: 'Area name is required' });
        }

        const trimmedArea = area.trim();
        let targetLocation = null;

        if (locationId) {
            targetLocation = await Location.findById(locationId);
        } else {
            const targetUpz = upazila_thana || upazila;
            const targetPnw = pourosova_union_ward || pourosova_union;
            if (division && district && targetUpz && targetPnw) {
                targetLocation = await Location.findOne({
                    division,
                    district,
                    upazila_thana: targetUpz,
                    pourosova_union_ward: targetPnw
                });
            }
        }

        if (!targetLocation) {
            return res.status(404).json({ success: false, message: 'Location unit not found' });
        }

        if (targetLocation.areas.includes(trimmedArea)) {
            return res.status(400).json({ success: false, message: 'Area already exists in this unit' });
        }

        targetLocation.areas.push(trimmedArea);
        targetLocation.updatedAt = new Date();
        await targetLocation.save();

        res.json({
            success: true,
            message: 'Area added successfully',
            areas: targetLocation.areas,
            location: targetLocation
        });
    } catch (err) {
        console.error('Error adding area:', err);
        res.status(500).json({ success: false, message: 'Server error adding area' });
    }
});

// 8. Remove Area from a unit
router.delete('/areas', authMiddleware, async (req, res) => {
    try {
        const { locationId, area } = req.body;
        if (!locationId || !area) {
            return res.status(400).json({ success: false, message: 'locationId and area are required' });
        }

        const updated = await Location.findByIdAndUpdate(
            locationId,
            { 
                $pull: { areas: area.trim() },
                $set: { updatedAt: new Date() }
            },
            { new: true }
        );

        if (!updated) {
            return res.status(404).json({ success: false, message: 'Location unit not found' });
        }

        res.json({
            success: true,
            message: 'Area removed successfully',
            areas: updated.areas
        });
    } catch (err) {
        console.error('Error removing area:', err);
        res.status(500).json({ success: false, message: 'Server error removing area' });
    }
});

// 9. Global Search
router.get('/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.trim().length < 2) {
            return res.json({ success: true, results: [] });
        }

        const regex = new RegExp(q.trim(), 'i');
        const results = await Location.find({
            $or: [
                { areas: regex },
                { pourosova_union_ward: regex },
                { upazila_thana: regex },
                { district: regex }
            ]
        })
        .select('division district upazila_thana pourosova_union_ward type areas')
        .limit(25)
        .lean();

        const mappedResults = results.map(r => ({
            ...r,
            upazila: r.upazila_thana,
            pourosova_union: r.pourosova_union_ward
        }));

        res.json({ success: true, results: mappedResults });
    } catch (err) {
        console.error('Error searching locations:', err);
        res.status(500).json({ success: false, message: 'Server error searching locations' });
    }
});

module.exports = router;
