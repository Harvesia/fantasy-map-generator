/* Forms large realms by grouping the base polities into complex hierarchies*/

import { GOVERNMENT_TYPES } from '../core/config.js';
import { randomName } from '../core/utils.js';
import { getPolityTitle, getPreliminaryTitle } from './titleGenerator.js';

/**Generates subordinate polities within a given set of counties
 * @param {object} world The world object
 * @param {function(): number} rand The seeded random function
 * @param {Set<string>} usedNames A set of already used names
 * @param {Set<number>} targetCountyIds The set of county IDs to generate polities within
 * @param {number} polityIdOffset The starting ID for newly generated polities*/
function generateSubordinatePolities(world, rand, usedNames, targetCountyIds, polityIdOffset) {
    const politiesToGenerate = Array.from(targetCountyIds).map(id => world.counties.get(id));
    const POLITY_COUNT = Math.max(1, Math.floor(politiesToGenerate.length / 5)); // Target ~5 counties per polity, at least 1
    const polityCapitals = [];
    const sortedCounties = politiesToGenerate.sort((a, b) => b.development - a.development);

    // Select the most developed counties as polity capitals
    for (const county of sortedCounties) {
        if (polityCapitals.length >= POLITY_COUNT) break;
        polityCapitals.push(county);
    }

    // Create the polity objects
    polityCapitals.forEach((capitalCounty, i) => {
        const polity = {
            id: polityIdOffset + i,
            name: randomName(rand, usedNames),
            title: 'County', // Default title for now, will be refined later
            capitalCountyId: capitalCounty.id,
            directCounties: new Set(),
            vassals: new Set(),
            suzerain: null,
            power: 0,
            government: GOVERNMENT_TYPES.FEUDAL_KINGDOM, // Default government
        };
        world.polities.set(polity.id, polity);
    });

    // Assign all other counties to the nearest polity capital
    politiesToGenerate.forEach(county => {
        let closestCapitalDist = Infinity;
        let closestPolityId = -1;
        polityCapitals.forEach((capital) => {
            const dist = Math.hypot(county.capitalSeed.x - capital.capitalSeed.x, county.capitalSeed.y - capital.capitalSeed.y);
            if (dist < closestCapitalDist) {
                closestCapitalDist = dist;
                closestPolityId = capital.id; // Use the actual polity ID
            }
        });
        if (closestPolityId !== -1) {
            const polity = world.polities.get(closestPolityId);
            polity.directCounties.add(county.id);
            county.polityId = closestPolityId;
        }
    });

    // Calculate polity power
    world.polities.forEach(polity => {
        if (polity.id >= polityIdOffset && polity.id < polityIdOffset + POLITY_COUNT) { // Only process newly generated polities
            let totalPower = 0;
            polity.directCounties.forEach(countyId => {
                const county = world.counties.get(countyId);
                totalPower += county.development;
            });
            polity.power = totalPower;
            polity.avgDevelopment = totalPower / polity.directCounties.size;
        }
    });

    return polityCapitals.map(c => c.id); // Return IDs of the newly created polities
}

/**The main function to form realms from the base polities
 * @param {object} world The world object
 * @param {function(): number} rand The seeded random function*/

export function formRealms(world, rand) {
    const sortedPolities = Array.from(world.polities.values()).sort((a, b) => b.power - a.power);
    const availablePolities = new Set(sortedPolities.map(p => p.id));
    const realmLeaders = [];
    const MAX_NATIONS = 50;

    // 1. Identify all independent realm leaders first, up to the maximum
    sortedPolities.forEach(polity => {
        if (availablePolities.has(polity.id) && realmLeaders.length < MAX_NATIONS) {
            const prelimTitle = getPreliminaryTitle(polity.power);
            if (['Empire', 'Kingdom', 'Principality'].includes(prelimTitle)) {
                polity.government = prelimTitle === 'Empire' ? GOVERNMENT_TYPES.IMPERIAL_CONFEDERATION : GOVERNMENT_TYPES.FEUDAL_KINGDOM;
                availablePolities.delete(polity.id);
                realmLeaders.push(polity);
            }
        }
    });

    // 2. Vassalization via a claim system to allow for exclaves
    const allClaims = [];
    realmLeaders.forEach(suzerain => {
        availablePolities.forEach(polityId => {
            const targetPolity = world.polities.get(polityId);
            const dist = Math.hypot(
                world.counties.get(suzerain.capitalCountyId).capitalSeed.x - world.counties.get(targetPolity.capitalCountyId).capitalSeed.x,
                world.counties.get(suzerain.capitalCountyId).capitalSeed.y - world.counties.get(targetPolity.capitalCountyId).capitalSeed.y
            );
            const score = suzerain.power / (dist + 1);
            allClaims.push({ suzerain, target: targetPolity, score });
        });
    });

    allClaims.sort((a, b) => b.score - a.score);

    allClaims.forEach(claim => {
        if (claim.target.suzerain === null && availablePolities.has(claim.target.id)) {
            claim.target.suzerain = claim.suzerain.id;
            claim.suzerain.vassals.add(claim.target.id);
            availablePolities.delete(claim.target.id);
        }
    });

    // 3. Duchies can 'sub-infeudate' a limited number of minor vassals
    // First, assign preliminary titles to identify Duchies
    world.polities.forEach(p => { p.title = getPolityTitle(p, world); });

    world.polities.forEach(polity => {
        if (polity.title === 'Duchy' && polity.suzerain !== null) {
            const suzerain = world.polities.get(polity.suzerain);
            const powerCap = polity.power * 0.10;
            let currentVassalPower = 0;

            const potentialVassals = Array.from(suzerain.vassals)
                .map(id => world.polities.get(id))
                .filter(v => v.id !== polity.id && v.power < powerCap)
                .sort((a, b) => a.power - b.power);

            for (const targetVassal of potentialVassals) {
                if (currentVassalPower + targetVassal.power <= powerCap) {
                    suzerain.vassals.delete(targetVassal.id);
                    polity.vassals.add(targetVassal.id);
                    targetVassal.suzerain = polity.id;
                    currentVassalPower += targetVassal.power;
                }
            }
        }
    });

    // 4. Handle remaining independent polities
    availablePolities.forEach(polityId => {
        const polity = world.polities.get(polityId);
        polity.government = GOVERNMENT_TYPES.FEUDAL_KINGDOM;
    });

    // 5. Final, definitive power calculation and title assignment
    const finalCalculatedStats = new Map();
    function finalCalculateRealmStats(polity) {
        if (finalCalculatedStats.has(polity.id)) return finalCalculatedStats.get(polity.id);
        let totalPower = polity.power;
        let totalCounties = polity.directCounties.size;

        if (polity.vassals.size > 0) {
            let primaryVassalId = -1;
            let maxVassalPower = -1;
            polity.vassals.forEach(vassalId => {
                const vassalStats = finalCalculateRealmStats(world.polities.get(vassalId));
                if (vassalStats.totalPower > maxVassalPower) {
                    maxVassalPower = vassalStats.totalPower;
                    primaryVassalId = vassalId;
                }
            });
            polity.vassals.forEach(vassalId => {
                const vassalStats = finalCalculatedStats.get(vassalId);
                const contributionRate = (vassalId === primaryVassalId) ? 0.40 : 0.20;
                totalPower += contributionRate * vassalStats.totalPower;
                totalCounties += vassalStats.totalCounties;
            });
        }
        const stats = { totalPower, totalCounties };
        finalCalculatedStats.set(polity.id, stats);
        return stats;
    }
    world.polities.forEach(polity => {
        const stats = finalCalculateRealmStats(polity);
        polity.realmPower = stats.totalPower;
        polity.realmCounties = stats.totalCounties;
        polity.realmAvgDevelopment = stats.totalCounties > 0 ? stats.totalPower / stats.totalCounties : 0;
    });
    
    const topLevelPolities = [];
    world.polities.forEach(p => { if (p.suzerain === null) topLevelPolities.push(p); });
    function assignTitlesRecursively(polity) {
        polity.title = getPolityTitle(polity, world);
        polity.vassals.forEach(vassalId => assignTitlesRecursively(world.polities.get(vassalId)));
    }
    topLevelPolities.forEach(p => assignTitlesRecursively(p));

    world.topLevelPolities.clear();
    world.polities.forEach(polity => { if (polity.suzerain === null) world.topLevelPolities.add(polity.id); });
}