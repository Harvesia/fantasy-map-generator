import { GRID_WIDTH, GRID_HEIGHT, COUNTIES_PER_CULTURE, CULTURE_HEARTH_MIN_DISTANCE_FACTOR, CULTURAL_RELIGION_SPAWN_CHANCE, MIN_UNIVERSALIST_RELIGIONS, MAX_UNIVERSALIST_RELIGIONS, BASE_RELIGIOUS_RESISTANCE, FRINGE_RELIGION_RESISTANCE_BONUS, UNIVERSALIST_RELIGION_RESISTANCE_REDUCTION } from '../core/config.js';
import { randomName, getCountyAdjacency } from '../core/utils.js';

/**Generates a more varied and authentic-sounding name for a religion
 * @param {string} baseName The base name, often from a culture or founder
 * @param {function(): number} rand The seeded random function
 * @param {string} type The type of religion ('cultural' or 'universalist')
 * @returns {{name: string, subType: string}} An object containing the religion's name and its subtype*/

function randomReligionName(baseName, rand, type = 'universalist') {
    let name = baseName;
    let subType = 'mainstream'; // Default subtype

    if (/[aeiou]$/i.test(name)) name = name.slice(0, -1);

    if (type === 'cultural') {
        const suffixRoll = rand();
        if (suffixRoll < 0.4) name = name + "ism";
        else if (suffixRoll < 0.8) name = name + "ianity";
        else name = `The Faith of ${name}`;
        return { name, subType };
    }

    const roll = rand();
    const suffixRoll = rand();
    if (roll < 0.4) {
        if (suffixRoll < 0.5) name = name + "ism";
        else if (suffixRoll < 0.8) name = name + "ianity";
        else name = name + "an Faith";
    } else if (roll < 0.8) {
        if (suffixRoll < 0.3) name = `The Way of ${baseName}`;
        else if (suffixRoll < 0.6) name = `The Faith of ${baseName}`;
        else { name = `The Cult of ${baseName}`; subType = 'fringe'; }
    } else { name = `${baseName}n Heresy`; subType = 'fringe'; }
    return { name, subType };
}

/**Spreads a feature (culture or subculture) from hearths based on terrain
 * @param {object} world The world object
 * @param {Array<object>} hearths List of hearths
 * @param {string} propertyToSet The county property to set ('culture' or 'subCulture')
 * @param {Map<number, Set<number>>} countyAdjacency The pre-calculated adjacency graph
 * @param {Map<number, Set<number>>} [allowedTerritory=null] Optional map where key is hearth ID and value is a Set of county IDs the hearth can spread to*/

function spreadByTerrain(world, hearths, propertyToSet, countyAdjacency, allowedTerritory = null) {
    const costs = new Map();
    const frontier = [];
    world.counties.forEach(c => costs.set(c.id, Infinity));

    hearths.forEach(hearth => {
        costs.set(hearth.countyId, 0);
        world.counties.get(hearth.countyId)[propertyToSet] = hearth.id;
        frontier.push({ countyId: hearth.countyId, cost: 0, id: hearth.id });
    });

    while (frontier.length > 0) {
        frontier.sort((a, b) => a.cost - b.cost);
        const current = frontier.shift();

        if (countyAdjacency.has(current.countyId)) {
            countyAdjacency.get(current.countyId).forEach(neighborId => {
                if (allowedTerritory && !allowedTerritory.get(current.id)?.has(neighborId)) return;

                const neighborCounty = world.counties.get(neighborId);
                let travelCost = 10;
                let avgBiomeCost = 0;
                neighborCounty.tiles.forEach(tileIdx => { avgBiomeCost += world.tiles[tileIdx].biome.cost; });
                travelCost += avgBiomeCost / neighborCounty.tiles.size;

                const newCost = current.cost + travelCost;
                if (newCost < costs.get(neighborId)) {
                    costs.set(neighborId, newCost);
                    neighborCounty[propertyToSet] = current.id;
                    frontier.push({ countyId: neighborId, cost: newCost, id: current.id });
                }
            });
        }
    }
}


/**Main function to generate cultures and religions for the world
 * @param {object} world The world object
 * @param {function(): number} rand The seeded random function
 * @param {Set<string>} usedNames A set of already used names*/

export function generateSociology(world, rand, usedNames) {
    const countyAdjacency = getCountyAdjacency(world);

    // Culture Group Generation
    const landCounties = Array.from(world.counties.values()).filter(c => c.tiles.size > 0 && c.development > 0);
    const cultureGroupHearths = [];
    if (landCounties.length > 0) {
        const sortedCounties = [...landCounties].sort((a, b) => b.development - a.development);
        const minDistance = GRID_WIDTH / CULTURE_HEARTH_MIN_DISTANCE_FACTOR;
        const targetCultureCount = Math.floor(landCounties.length / COUNTIES_PER_CULTURE) + 5;
        for (const potentialHearth of sortedCounties) {
            if (cultureGroupHearths.length >= targetCultureCount) break;
            const capital = potentialHearth.capitalSeed;
            if (!cultureGroupHearths.some(h => Math.hypot(capital.x - world.counties.get(h.countyId).capitalSeed.x, capital.y - world.counties.get(h.countyId).capitalSeed.y) < minDistance)) {
                cultureGroupHearths.push({ countyId: potentialHearth.id, id: cultureGroupHearths.length });
            }
        }
    }
    
    world.cultures = cultureGroupHearths.map(h => ({ id: h.id, name: randomName(rand, usedNames), color: '', isGroup: false }));
    if (cultureGroupHearths.length > 0) {
        spreadByTerrain(world, cultureGroupHearths, 'culture', countyAdjacency);
    }

    // Fix for cultureless islands
    const culturelessCounties = [];
    world.counties.forEach(county => {
        if (county.culture === undefined && county.tiles.size > 0) {
            culturelessCounties.push(county);
        }
    });

    if (culturelessCounties.length > 0) {
        const hearthCenters = new Map();
        cultureGroupHearths.forEach(hearth => {
            const hearthCounty = world.counties.get(hearth.countyId);
            hearthCenters.set(hearth.id, hearthCounty.capitalSeed);
        });

        culturelessCounties.forEach(county => {
            let closestHearthId = -1;
            let minDistance = Infinity;
            const countyCenter = county.capitalSeed;

            hearthCenters.forEach((center, hearthId) => {
                const dist = Math.hypot(countyCenter.x - center.x, countyCenter.y - center.y);
                if (dist < minDistance) {
                    minDistance = dist;
                    closestHearthId = hearthId;
                }
            });

            if (closestHearthId !== -1) {
                county.culture = closestHearthId;
            }
        });
    }


    // Sub Culture Generation
    world.subCultures = [];
    const cultureGroupTerritories = new Map();
    world.cultures.forEach(cg => cultureGroupTerritories.set(cg.id, new Set()));
    world.counties.forEach(c => {
        if (c.culture !== undefined) {
            if (cultureGroupTerritories.has(c.culture)) {
                cultureGroupTerritories.get(c.culture).add(c.id);
            }
        }
    });

    let subCultureIdCounter = 0;
    cultureGroupTerritories.forEach((countiesSet, cultureGroupId) => {
        const groupCounties = Array.from(countiesSet).map(id => world.counties.get(id));
        const subCultureHearths = [];
        const numSubCultures = Math.max(1, Math.floor(groupCounties.length / 15));
        const sortedGroupCounties = groupCounties.sort((a,b) => b.development - a.development);
        
        if (numSubCultures > 1) {
            world.cultures.find(cg => cg.id === cultureGroupId).isGroup = true;
        }

        for(const potentialHearth of sortedGroupCounties) {
            if (subCultureHearths.length >= numSubCultures) break;
            subCultureHearths.push({ countyId: potentialHearth.id, id: subCultureIdCounter });
            world.subCultures.push({ id: subCultureIdCounter, name: randomName(rand, usedNames), parentCultureId: cultureGroupId, color: '' });
            subCultureIdCounter++;
        }
        
        if (subCultureHearths.length === 1) {
            const singleSubCultureId = subCultureHearths[0].id;
            const parentGroupName = world.cultures.find(cg => cg.id === cultureGroupId).name;
            const subCulture = world.subCultures.find(sc => sc.id === singleSubCultureId);
            if (subCulture) subCulture.name = parentGroupName;
        }

        if (subCultureHearths.length > 0) {
            const territoryMap = new Map(subCultureHearths.map(h => [h.id, countiesSet]));
            spreadByTerrain(world, subCultureHearths, 'subCulture', countyAdjacency, territoryMap);
        }
    });

    // Fix for missing sub-cultures on isolated islands
    world.counties.forEach(county => {
        if (county.culture !== undefined && county.subCulture === undefined) {
            const parentCultureId = county.culture;
            const primarySubCulture = world.subCultures.find(sc => sc.parentCultureId === parentCultureId);
            if (primarySubCulture) {
                county.subCulture = primarySubCulture.id;
            }
        }
    });


    // Religion Generation
    world.religions = [{ id: 0, name: "Folk Religion", color: '', type: 'folk' }];
    world.counties.forEach(c => c.religion = 0);
    
    const religionHearths = [];
    let religionIdCounter = 1;
    const usedHearthCounties = new Set();

    const cultureDev = new Map();
    world.cultures.forEach(c => cultureDev.set(c.id, {topDev: 0, hearthCounty: null}));
    world.counties.forEach(county => {
        if(county.culture !== undefined) {
            const cultureInfo = cultureDev.get(county.culture);
            if(cultureInfo && county.development > cultureInfo.topDev) {
                cultureInfo.topDev = county.development;
                cultureInfo.hearthCounty = county.id;
            }
        }
    });

    cultureDev.forEach((info, cultureId) => {
        if (info.hearthCounty && info.topDev > 10 && rand() > CULTURAL_RELIGION_SPAWN_CHANCE) {
            const cultureName = world.cultures.find(c => c.id === cultureId).name;
            const religionInfo = randomReligionName(cultureName, rand, 'cultural');
            usedNames.add(religionInfo.name);
            world.religions.push({ id: religionIdCounter, name: religionInfo.name, color: '', type: 'cultural', subType: religionInfo.subType, originCulture: cultureId });
            religionHearths.push({ countyId: info.hearthCounty, religionId: religionIdCounter });
            usedHearthCounties.add(info.hearthCounty);
            religionIdCounter++;
        }
    });

    const numUniversalistReligions = MIN_UNIVERSALIST_RELIGIONS + Math.floor(rand() * (MAX_UNIVERSALIST_RELIGIONS - MIN_UNIVERSALIST_RELIGIONS + 1));
    let potentialUniversalistHearths = Array.from(world.counties.values())
        .filter(c => c.development > 15 && !usedHearthCounties.has(c.id))
        .sort((a,b) => b.development - a.development);

    // If not enough ideal hearths, relax criteria to ensure minimum is met
    if (potentialUniversalistHearths.length < numUniversalistReligions) {
        const existingHearthIds = new Set(potentialUniversalistHearths.map(c => c.id));
        const mediumDevHearths = Array.from(world.counties.values())
            .filter(c => c.development > 5 && !usedHearthCounties.has(c.id) && !existingHearthIds.has(c.id))
            .sort((a,b) => b.development - a.development);
        potentialUniversalistHearths.push(...mediumDevHearths);
    }
    
    // If STILL not enough, grab any remaining land county not already used
    if (potentialUniversalistHearths.length < numUniversalistReligions) {
        const existingHearthIds = new Set(potentialUniversalistHearths.map(c => c.id));
        const anyLandHearths = Array.from(world.counties.values())
            .filter(c => c.tiles.size > 0 && !usedHearthCounties.has(c.id) && !existingHearthIds.has(c.id))
            .sort((a,b) => b.development - a.development);
        potentialUniversalistHearths.push(...anyLandHearths);
    }

    // Now, generate the religions using the guaranteed list of hearths
    for (let i = 0; i < numUniversalistReligions && i < potentialUniversalistHearths.length; i++) {
        const hearthCounty = potentialUniversalistHearths[i];
        const religionInfo = randomReligionName(randomName(rand, usedNames), rand, 'universalist');
        usedNames.add(religionInfo.name);
        world.religions.push({ id: religionIdCounter, name: religionInfo.name, color: '', type: 'universalist', subType: religionInfo.subType, originCulture: hearthCounty.culture });
        religionHearths.push({ countyId: hearthCounty.id, religionId: religionIdCounter });
        usedHearthCounties.add(hearthCounty.id);
        religionIdCounter++;
    }

    const religionCosts = new Map();
    const religionFrontier = [];
    world.counties.forEach(c => religionCosts.set(c.id, Infinity));

    religionHearths.forEach(hearth => {
        religionCosts.set(hearth.countyId, 0);
        world.counties.get(hearth.countyId).religion = hearth.religionId;
        religionFrontier.push({ countyId: hearth.countyId, cost: 0, religionId: hearth.religionId });
    });

    while(religionFrontier.length > 0) {
        religionFrontier.sort((a,b) => a.cost - b.cost);
        const current = religionFrontier.shift();
        const spreadingReligion = world.religions.find(r => r.id === current.religionId);

        if (countyAdjacency.has(current.countyId)) {
            countyAdjacency.get(current.countyId).forEach(neighborId => {
                const neighborCounty = world.counties.get(neighborId);

                if (spreadingReligion.type === 'cultural' && neighborCounty.culture !== spreadingReligion.originCulture) return;

                let resistance = BASE_RELIGIOUS_RESISTANCE - (neighborCounty.development * 3);
                let avgBiomeCost = 0;
                neighborCounty.tiles.forEach(tileIdx => { avgBiomeCost += world.tiles[tileIdx].biome.cost; });
                resistance += avgBiomeCost / neighborCounty.tiles.size;
                
                if (spreadingReligion.type === 'universalist') {
                    if (spreadingReligion.subType === 'fringe') {
                        resistance += FRINGE_RELIGION_RESISTANCE_BONUS;
                    } else {
                        resistance -= UNIVERSALIST_RELIGION_RESISTANCE_REDUCTION;
                    }
                }

                const newCost = current.cost + Math.max(5, resistance);
                if (newCost < religionCosts.get(neighborCounty.id)) {
                    religionCosts.set(neighborCounty.id, newCost);
                    neighborCounty.religion = current.religionId;
                    religionFrontier.push({ countyId: neighborCounty.id, cost: newCost, religionId: current.religionId });
                }
            });
        }
    }

    // Populate final grids and nation data
    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            const countyId = world.countyGrid[y][x];
            if (countyId !== null) {
                const county = world.counties.get(countyId);
                if (county) {
                    world.cultureGrid[y][x] = county.culture;
                    world.subCultureGrid[y][x] = county.subCulture;
                }
            }
        }
    }

    world.nations.forEach(nation => {
        if (nation.capital) {
            const capCountyId = world.countyGrid[nation.capital.y][nation.capital.x];
            if (capCountyId !== null) {
                const capCounty = world.counties.get(capCountyId);
                if(capCounty) {
                    nation.culture = capCounty.culture;
                    nation.subCulture = capCounty.subCulture;
                    nation.religion = capCounty.religion;
                }
            }
        }
    });
}
