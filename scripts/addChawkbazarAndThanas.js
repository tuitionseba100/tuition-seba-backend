const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');
require('dotenv').config();

const Location = require('../models/Location');

const NEW_THANAS = [
    {
        division: 'Chattogram',
        district: 'Chattogram',
        upazila_thana: 'Chawkbazar',
        pourosova_union_ward: 'Chawkbazar',
        type: 'ward',
        areas: [
            'Chawkbazar',
            'Chawkbazar Mor',
            'Gulzar Mor',
            'Chittagong College Area',
            'Mohsin College Area',
            'Probartak Mor',
            'Kapasgola',
            'Chankholer Par',
            'DC Road',
            'Katalganj',
            'Parade Corner',
            'Subash Datta Lane',
            'Dewan Bazar',
            'Badurtala',
            'Goni Bakery',
            'College Road'
        ],
        isActive: true
    },
    {
        division: 'Chattogram',
        district: 'Chattogram',
        upazila_thana: 'Chawkbazar',
        pourosova_union_ward: 'Ward 16 (Chawkbazar)',
        type: 'ward',
        areas: [
            'Chawkbazar Mor',
            'Gulzar Mor',
            'Chittagong College Area',
            'Mohsin College Area',
            'Kapasgola',
            'DC Road',
            'Katalganj',
            'Parade Corner',
            'Subash Datta Lane'
        ],
        isActive: true
    },
    {
        division: 'Chattogram',
        district: 'Chattogram',
        upazila_thana: 'Chawkbazar',
        pourosova_union_ward: 'Ward 15 (Bagmoniram)',
        type: 'ward',
        areas: [
            'Probartak Mor',
            'Chankholer Par',
            'Badurtala',
            'Golpahar',
            'Medical Hostel Area',
            'Mehedibag Road'
        ],
        isActive: true
    },
    {
        division: 'Chattogram',
        district: 'Chattogram',
        upazila_thana: 'Akbarshah',
        pourosova_union_ward: 'Akbarshah',
        type: 'ward',
        areas: [
            'Akbarshah',
            'Baroquarter',
            'Kaibalyadham',
            'Colonelhat',
            'Firojshah',
            'Lake City',
            'Bishwa Colony',
            'Foy\'s Lake',
            'City Gate'
        ],
        isActive: true
    },
    {
        division: 'Chattogram',
        district: 'Chattogram',
        upazila_thana: 'EPZ',
        pourosova_union_ward: 'EPZ',
        type: 'ward',
        areas: [
            'EPZ Area',
            'CEPZ',
            'Bandartila',
            'South Halishahar',
            'Barrister College Road',
            'Sailors Colony',
            'Freeport',
            'Noyabazar',
            'Cement Crossing'
        ],
        isActive: true
    },
    {
        division: 'Chattogram',
        district: 'Chattogram',
        upazila_thana: 'Sadarghat',
        pourosova_union_ward: 'Sadarghat',
        type: 'ward',
        areas: [
            'Sadarghat',
            'Majirghat',
            'Ferighat',
            'West Madarbari',
            'East Madarbari',
            'Nimtoli',
            'Strand Road'
        ],
        isActive: true
    }
];

async function addThanas() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.DB_URI);
        console.log('Connected.');

        let addedCount = 0;
        let updatedCount = 0;

        for (const item of NEW_THANAS) {
            const filter = {
                district: item.district,
                upazila_thana: item.upazila_thana,
                pourosova_union_ward: item.pourosova_union_ward
            };

            const existing = await Location.findOne(filter);
            if (existing) {
                // Merge areas uniquely
                const mergedAreas = Array.from(new Set([...existing.areas, ...item.areas]));
                await Location.updateOne(filter, { $set: { areas: mergedAreas, isActive: true, updatedAt: new Date() } });
                console.log(`Updated existing location: ${item.upazila_thana} -> ${item.pourosova_union_ward}`);
                updatedCount++;
            } else {
                await Location.create(item);
                console.log(`Created new location: ${item.upazila_thana} -> ${item.pourosova_union_ward}`);
                addedCount++;
            }
        }

        console.log(`\nSummary: Added ${addedCount} units, Updated ${updatedCount} units.`);

        const updatedThanas = await Location.distinct('upazila_thana', { district: 'Chattogram' });
        console.log(`\nCurrent Thanas for Chattogram in DB (total: ${updatedThanas.length}):`);
        console.log(updatedThanas.sort());

        process.exit(0);
    } catch (err) {
        console.error('Error adding thanas:', err);
        process.exit(1);
    }
}

addThanas();

