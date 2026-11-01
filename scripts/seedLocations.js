require('dotenv').config();
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose');
const pkg = require('bangladesh-location-data');
const Location = require('../models/Location');

function formatTitle(str) {
    if (!str) return '';
    return str
        .trim()
        .toLowerCase()
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

// Format Pouroshova names cleanly
function formatPourosovaName(rawTitle) {
    let clean = formatTitle(rawTitle);
    clean = clean
        .replace(/pourashava/gi, 'Pouroshova')
        .replace(/pourosova/gi, 'Pouroshova')
        .replace(/paurasabha/gi, 'Pouroshova')
        .replace(/municipality/gi, 'Pouroshova')
        .trim();
    if (!clean.toLowerCase().includes('pouroshova')) {
        clean = `${clean} Pouroshova`;
    }
    return clean;
}

// Metropolitan thana cleaner
function cleanThanaName(rawTitle) {
    const map = {
        'pachlish': 'Panchlaish',
        'patanga': 'Patenga',
        'dabalmuring': 'Double Mooring',
        'halishohor': 'Halishahar',
        'pahartoli': 'Pahartali',
        'khulsi': 'Khulshi',
        'kotowali': 'Kotwali',
        'kotoyali': 'Kotwali',
        'Chattatagram port': 'Chattogram Port',
        'Bayazid Bostami': 'Bayazid Bostami',
        'Bakalia': 'Bakalia',
        'Chandgaon': 'Chandgaon',
        'mohammudpur': 'Mohammadpur',
        'mothijhil': 'Motijheel',
        'lalbag': 'Lalbagh',
        'kadamtoli': 'Kadamtali',
        'shahbag': 'Shahbagh',
        'shampur': 'Shyampur',
        'khilgao': 'Khilgaon',
        'hazaribag': 'Hazaribagh',
        'gandaria': 'Gandaria',
        'poltan': 'Paltan',
        'sabujbag': 'Sabujbagh',
        'mirpur': 'Mirpur',
        'uttara': 'Uttara',
        'gulshan': 'Gulshan',
        'banani': 'Banani',
        'badda': 'Badda',
        'adabor': 'Adabor',
        'kafrul': 'Kafrul',
        'cantonment': 'Cantonment',
        'ramna': 'Ramna',
        'rampura': 'Rampura',
        'tejgaon': 'Tejgaon',
        'tejgao ca': 'Tejgaon I/A',
        'pallabi': 'Pallabi',
        'shahali': 'Shah Ali',
        'turag': 'Turag',
        'uttar khan': 'Uttarkhan',
        'dakkhinkhan': 'Dakkhinkhan',
        'bimanbondor': 'Airport (Bimanbandar)',
        'Bhatara': 'Bhatara',
        'hatirjhil': 'Hatirjheel',
        'khilkhet': 'Khilkhet',
        'shere Bangla Nagar': 'Sher-e-Bangla Nagar',
        'new market': 'New Market',
        'Jatrabari': 'Jatrabari',
        'Demra': 'Demra',
        'Kamrangirchor': 'Kamrangirchar',
        'sutrapur': 'Sutrapur',
        'Shahjahanpur': 'Shahjahanpur'
    };
    return map[rawTitle] || formatTitle(rawTitle);
}

// Chittagong 74 Areas mapped by Thana / Upazila
const CHITTAGONG_THANA_AREAS = {
    'Panchlaish': [
        '2 Number Gate', 'Gec', 'Muradpur', 'Panchlaish', 'Solokbohor',
        'Soloshohor'
    ],
    'Bayazid Bostami': [
        'Oxyzen', 'Baizid', 'Baluchara', 'Aturar Depo', 'Shershah', 'Polytechnic More'
    ],
    'Khulshi': [
        'Khulsi', 'Tiger Pass', 'Foyezlake', 'Ambagan'
    ],
    'Pahartali': [
        'Pahartali', 'Ak Khan', 'Akbarshah', 'Alongkar', 'Baroquerter',
        'City Gate', 'Cornelhut', 'Firozsah', 'Sagorika'
    ],
    'Double Mooring': [
        'Agrabad', 'Agrbad CDA', 'Barek Building', 'Dewanhat', 'Chowmohoni',
        'Commerce college road', 'Cuna Factory road', 'Eidgah kacha rasta'
    ],
    'Kotwali': [
        'Andorkillah', 'Anayet Bazar', 'Chawkbazar', 'CRB', 'Dampara',
        'Dewanbazar', 'Didar Market', 'Firingibazar', 'Jamalkhan', 'Jubilee Road',
        'Kajir dewri', 'Kapasgola', 'Kotoali', 'Lalkhan Bazar', 'Love lane',
        'Mehedibag', 'Nalapara', 'Nandan kanon', 'New Market', 'Wasa'
    ],
    'Halishahar': [
        'Halishohor', 'Boropol', 'Noyabazar'
    ],
    'Bakalia': [
        'Bakalia accese road', 'Kalamia Bazar', 'Kolpolok Abasik',
        'Rahattarpol', 'Noton Bridge'
    ],
    'Chandgaon': [
        'Chandgao', 'Baddarhat', 'Bahir Signal', 'Kalurghat',
        'Kaptai Rastar Matha', 'Khaja Road', 'Mohora'
    ],
    'Patenga': [
        'Patenga', 'Katgor', 'Bandartila', 'Cement Crossing',
        'Freeport', 'Miler Matha', 'Saltgola Crossing', 'Stillmil Bazar'
    ],
    'Chattogram Port': [
        'Customs', 'Majirghat', 'Nimtola', 'Sadharghat', 'West Madarbari', 'Kodomtoli'
    ]
};

// Chittagong Upazila specific areas
const CHITTAGONG_UPAZILA_SPECIFIC = {
    'Hathazari': {
        'Fathepur': ['CU Campus'],
        'Fatehpur': ['CU Campus'],
        'Chikondandi': ['Aman bazar'],
        'Chikandandi': ['Aman bazar'],
        'Hathazari (Pourosova)': ['Hathazari Bus Stand', 'College Gate', 'Hathazari Sadar']
    },
    'Sitakunda': {
        'Sitakunda (Pourosova)': ['Sitakunda Sadar', 'Bazar Area'],
        'Bhatiari': ['Vatiyari', 'Bhatiari Station Area']
    },
    'Patiya': {
        'Patiya (Pourosova)': ['Patiya Sadar', 'Station Road', 'Thana More']
    },
    'Boalkhali': {
        'Boalkhali (Pourosova)': ['Boalkhali Sadar', 'Sakpura']
    },
    'Fatikchhari': {
        'Fatikchhari (Pourosova)': ['Fatikchhari Sadar', 'Bibek More'],
        'Nazirhat (Pourosova)': ['Nazirhat Sadar', 'Bazar Area']
    },
    'Raozan': {
        'Raozan (Pourosova)': ['Raozan Sadar', 'Pahartali More']
    },
    'Rangunia': {
        'Rangunia (Pourosova)': ['Rangunia Sadar', 'Dhamairhat']
    },
    'Banshkhali': {
        'Banshkhali (Pourosova)': ['Banshkhali Sadar', 'Thana More', 'Bus Stand', 'Ward 1', 'Ward 2', 'Ward 3', 'Ward 4', 'Ward 5', 'Ward 6', 'Ward 7', 'Ward 8', 'Ward 9']
    },
    'Satkania': {
        'Satkania (Pourosova)': ['Satkania Sadar', 'Keranihat', 'Bazar More', 'Ward 1', 'Ward 2', 'Ward 3', 'Ward 4', 'Ward 5', 'Ward 6', 'Ward 7', 'Ward 8', 'Ward 9']
    },
    'Mirsharai': {
        'Mirsharai (Pourosova)': ['Mirsharai Sadar', 'Bazar Area'],
        'Baraiyarhat (Pourosova)': ['Baraiyarhat Sadar', 'Bazar Area']
    },
    'Sandwip': {
        'Sandwip (Pourosova)': ['Sandwip Sadar', 'Bazar Area']
    },
    'Chandanaish': {
        'Chandanaish (Pourosova)': ['Chandanaish Sadar', 'Bazar Area'],
        'Dohazari (Pourosova)': ['Dohazari Sadar', 'Station Road']
    }
};

// Dhaka Thana tuition areas
const DHAKA_THANA_AREAS = {
    'Dhanmondi': [
        'Dhanmondi 27', 'Dhanmondi 32', 'Shankar', 'Zigatola', 'Science Lab', 'Sobhanbagh'
    ],
    'Mirpur': [
        'Mirpur 1', 'Mirpur 2', 'Mirpur 6', 'Mirpur 10', 'Mirpur 11', 'Mirpur 12',
        'Mirpur 14', 'Mirpur DOHS', 'Kazipara', 'Shewrapara', 'Rupnagar'
    ],
    'Uttara': [
        'Uttara Sector 1', 'Uttara Sector 3', 'Uttara Sector 4', 'Uttara Sector 5',
        'Uttara Sector 7', 'Uttara Sector 9', 'Uttara Sector 10', 'Uttara Sector 11',
        'Uttara Sector 12', 'Uttara Sector 13', 'Uttara Sector 14', 'Uttara Sector 18', 'Airport Area'
    ],
    'Gulshan': [
        'Gulshan 1', 'Gulshan 2', 'Niketan', 'Police Plaza Area'
    ],
    'Banani': [
        'Banani', 'Banani DOHS', 'Kakoli'
    ],
    'Mohammadpur': [
        'Ring Road', 'Town Hall', 'Tajmahal Road', 'Noorjahan Road', 'Salimullah Road',
        'Japan Garden City', 'Bosila'
    ],
    'Badda': [
        'Badda', 'Middle Badda', 'North Badda', 'South Badda', 'Aftabnagar'
    ],
    'Bhatara': [
        'Bashundhara R/A', 'Sayednagar', 'Natun Bazar'
    ],
    'Khilgaon': [
        'Khilgaon', 'Taltola', 'Gorashan'
    ],
    'Rampura': [
        'Rampura', 'Banasree', 'Ulan'
    ],
    'Tejgaon': [
        'Tejgaon', 'Farmgate', 'Green Road', 'Indira Road'
    ],
    'Motijheel': [
        'Motijheel', 'Dilkusha', 'Arambagh'
    ],
    'Lalbagh': [
        'Lalbagh', 'Azimpur', 'Plassey'
    ],
    'New Market': [
        'New Market', 'Nilkhet', 'Dhaka College Area'
    ],
    'Shahbagh': [
        'Shahbagh', 'DU Campus', 'Paribagh', 'Bangla Motor'
    ],
    'Jatrabari': [
        'Jatrabari', 'Sayedabad', 'Dhalpur', 'Dania'
    ],
    'Kafrul': [
        'Kafrul', 'Senpara Parbata', 'Ibrahimpur'
    ],
    'Cantonment': [
        'Cantonment', 'Dhaka Cantonment', 'Matikata'
    ]
};

async function seed() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(process.env.DB_URI);
        console.log('MongoDB connected successfully.');

        console.log('Clearing old location records and indexes...');
        await Location.deleteMany({});
        try {
            await Location.collection.dropIndexes();
        } catch (e) {
            console.log('No prior indexes to drop');
        }
        await Location.syncIndexes();
        console.log('Old records cleared and indexes synced.');

        console.log('Building clean 5-Level Bangladesh Location Dataset (Division -> District -> Upazila/Thana -> Pourosova/Union/Ward -> Area)...');
        const operations = [];

        for (const div of pkg.divisions_en) {
            let divisionName = formatTitle(div.title);
            if (divisionName === 'Chattagram') divisionName = 'Chattogram';

            const districtList = pkg.districts_en[div.value] || [];
            for (const dist of districtList) {
                let districtName = formatTitle(dist.title);
                if (districtName === 'Coxsbazar') districtName = "Cox's Bazar";

                const upazilaList = pkg.upazilas_en[dist.value] || [];
                for (const upz of upazilaList) {
                    const rawUpzTitle = upz.title.trim();
                    const isCityCorp = rawUpzTitle.toLowerCase().includes('corporat') || 
                                       rawUpzTitle.toLowerCase().includes('city');

                    const unionList = pkg.unions_en[upz.value] || [];

                    // CASE 1: City Corporation -> Sub-units are Metropolitan Thanas!
                    // Elevate each thana to Upazila/Thana level
                    if (isCityCorp) {
                        for (const thanaItem of unionList) {
                            const thanaName = cleanThanaName(thanaItem.title.trim());

                            // Under this Thana, create its Ward/Center entries
                            let childAreas = [];

                            if (CHITTAGONG_THANA_AREAS[thanaName]) {
                                childAreas = [...CHITTAGONG_THANA_AREAS[thanaName]];
                            } else if (DHAKA_THANA_AREAS[thanaName]) {
                                childAreas = [...DHAKA_THANA_AREAS[thanaName]];
                            } else {
                                childAreas = [
                                    `${thanaName} Center`,
                                    'Ward 1', 'Ward 2', 'Ward 3', 'Ward 4', 'Ward 5',
                                    'Ward 6', 'Ward 7', 'Ward 8', 'Ward 9'
                                ];
                            }

                            // Clean direct name (no extra "Ward / Zone" suffix)
                            const primaryUnit = thanaName;

                            operations.push({
                                updateOne: {
                                    filter: {
                                        division: divisionName,
                                        district: districtName,
                                        upazila_thana: thanaName,
                                        pourosova_union_ward: primaryUnit
                                    },
                                    update: {
                                        $set: {
                                            division: divisionName,
                                            district: districtName,
                                            upazila_thana: thanaName,
                                            pourosova_union_ward: primaryUnit,
                                            type: 'ward',
                                            areas: childAreas,
                                            isActive: true,
                                            updatedAt: new Date()
                                        }
                                    },
                                    upsert: true
                                }
                            });
                        }
                        continue;
                    }

                    // CASE 2: Regular Upazila (Upazila -> Unions / Pourosovas -> Areas)
                    const upazilaName = formatTitle(rawUpzTitle);

                    if (unionList.length === 0) {
                        // Upazila with no unions listed
                        const defaultUnitName = `${upazilaName} Sadar`;
                        let areas = ['Center / Bazar', 'Ward 1', 'Ward 2', 'Ward 3', 'Ward 4', 'Ward 5', 'Ward 6', 'Ward 7', 'Ward 8', 'Ward 9'];

                        operations.push({
                            updateOne: {
                                filter: {
                                    division: divisionName,
                                    district: districtName,
                                    upazila_thana: upazilaName,
                                    pourosova_union_ward: defaultUnitName
                                },
                                update: {
                                    $set: {
                                        division: divisionName,
                                        district: districtName,
                                        upazila_thana: upazilaName,
                                        pourosova_union_ward: defaultUnitName,
                                        type: 'pourosova',
                                        areas: areas,
                                        isActive: true,
                                        updatedAt: new Date()
                                    }
                                },
                                upsert: true
                            }
                        });
                        continue;
                    }

                    for (const un of unionList) {
                        const rawTitle = un.title.trim();
                        const lower = rawTitle.toLowerCase();

                        // Pouroshovas have explicit titles or ID in range 4540..4900 (as assigned in bangladesh-location-data)
                        const isPourosova = lower.includes('pouro') ||
                                            lower.includes('paur') ||
                                            lower.includes('muni') ||
                                            (un.value >= 4540 && un.value <= 4900 && !lower.includes('union') && !lower.endsWith('up'));

                        let unitName = isPourosova ? formatPourosovaName(rawTitle) : formatTitle(rawTitle);
                        let unitType = isPourosova ? 'pourosova' : 'union';

                        // Check specific custom areas
                        let areas = [];
                        const upzConfig = CHITTAGONG_UPAZILA_SPECIFIC[upazilaName];
                        if (upzConfig) {
                            const normalizeStr = s => s.toLowerCase().replace(/pouroshova/g, 'pourosova').replace(/[^a-z0-9]/g, '');
                            const targetKey = normalizeStr(unitName);
                            const rawKey = normalizeStr(rawTitle);
                            const foundKey = Object.keys(upzConfig).find(k => {
                                const n = normalizeStr(k);
                                return n === targetKey || n === rawKey || targetKey.startsWith(n) || n.startsWith(targetKey);
                            });
                            if (foundKey) {
                                areas = [...upzConfig[foundKey]];
                            }
                        }

                        if (areas.length === 0) {
                            const baseName = unitName.replace(/ pouroshova/i, '').trim();
                            const defaultLabel = isPourosova ? `${baseName} Sadar` : 'Bazar / Center';
                            areas = [
                                defaultLabel,
                                'Ward 1', 'Ward 2', 'Ward 3', 'Ward 4', 'Ward 5',
                                'Ward 6', 'Ward 7', 'Ward 8', 'Ward 9'
                            ];
                        }
                        operations.push({
                            updateOne: {
                                filter: {
                                    division: divisionName,
                                    district: districtName,
                                    upazila_thana: upazilaName,
                                    pourosova_union_ward: unitName
                                },
                                update: {
                                    $set: {
                                        division: divisionName,
                                        district: districtName,
                                        upazila_thana: upazilaName,
                                        pourosova_union_ward: unitName,
                                        type: unitType,
                                        areas: areas,
                                        isActive: true,
                                        updatedAt: new Date()
                                    }
                                },
                                upsert: true
                            }
                        });
                    }
                }
            }
        }

        console.log(`Prepared ${operations.length} location records.`);
        console.log('Writing in batches to MongoDB...');

        const BATCH_SIZE = 500;
        for (let i = 0; i < operations.length; i += BATCH_SIZE) {
            const batch = operations.slice(i, i + BATCH_SIZE);
            await Location.bulkWrite(batch, { ordered: false });
            console.log(`Saved batch ${i + 1} to ${Math.min(i + BATCH_SIZE, operations.length)} / ${operations.length}`);
        }

        console.log('✅ 5-Level Location hierarchy seeded successfully!');
        const total = await Location.countDocuments();
        console.log(`Total active units in database: ${total}`);

        process.exit(0);
    } catch (err) {
        console.error('❌ Error during seeding:', err);
        process.exit(1);
    }
}

seed();
