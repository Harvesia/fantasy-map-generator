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

/** Forms the Royal Demesne by having top-level rulers claim the most valuable counties from their vassals
 * @param {object} world The world object
 * @param {Array<object>} topLevelPolities The list of independent realm leaders
*/
function formRoyalDemenes(world, topLevelPolities) {
    topLevelPolities.forEach(ruler => {
        if (ruler.vassals.size === 0) return;

        // 1. Identify all counties controlled by direct vassals
        const vassalCounties = [];
        ruler.vassals.forEach(vassalId => {
            const vassal = world.polities.get(vassalId);
            vassal.directCounties.forEach(countyId => {
                vassalCounties.push({ countyId, originalVassalId: vassalId });
            });
        });

        // 2. Assess and sort by value (development)
        vassalCounties.sort((a, b) => {
            const devA = world.counties.get(a.countyId).development;
            const devB = world.counties.get(b.countyId).development;
            return devB - devA;
        });

        // 3. The King claims the top 15% of counties
        const claimPercentage = 0.15;
        const countiesToClaim = vassalCounties.slice(0, Math.floor(vassalCounties.length * claimPercentage));

        // 4. Transfer the land
        countiesToClaim.forEach(({ countyId, originalVassalId }) => {
            const originalVassal = world.polities.get(originalVassalId);
            const county = world.counties.get(countyId);

            // Remove county from vassal
            originalVassal.directCounties.delete(countyId);
            // Add county to ruler's direct holdings
            ruler.directCounties.add(countyId);
            // Update the county's owner
            county.polityId = ruler.id;
        });
    });
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
            const suzerainCapital = world.counties.get(suzerain.capitalCountyId);
            const targetCapital = world.counties.get(targetPolity.capitalCountyId);

            const dist = Math.hypot(
                suzerainCapital.capitalSeed.x - targetCapital.capitalSeed.x,
                suzerainCapital.capitalSeed.y - targetCapital.capitalSeed.y
            );

            let score = suzerain.power / (dist + 1);

            if (suzerainCapital.culture !== undefined && suzerainCapital.culture === targetCapital.culture) score *= 1.5;
            if (suzerainCapital.religion !== undefined && suzerainCapital.religion === targetCapital.religion) score *= 2.0;
            else score *= 0.75;

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

    // 3. Preliminary Title Assignment
    const topLevelPolities = [];
    world.polities.forEach(p => { if (p.suzerain === null) topLevelPolities.push(p); });
    
    world.polities.forEach(polity => {
        let realmPower = polity.power;
        polity.vassals.forEach(vassalId => { realmPower += world.polities.get(vassalId).power * 0.5; });
        polity.realmPower = realmPower;
        polity.realmCounties = polity.directCounties.size;
        polity.realmAvgDevelopment = polity.realmPower / polity.realmCounties;
    });
    
    function assignTitlesRecursively(polity) {
        polity.title = getPolityTitle(polity, world);
        polity.vassals.forEach(vassalId => assignTitlesRecursively(world.polities.get(vassalId)));
    }
    topLevelPolities.forEach(p => assignTitlesRecursively(p));

    // 4. Create the Royal Demesne
    formRoyalDemenes(world, topLevelPolities);

    // 5. Vassal Realignment Pass for more complex hierarchies
    const ambitiousVassals = [];
    world.polities.forEach(p => {
        if (p.suzerain !== null && (p.title === 'Duchy' || p.title === 'Principality')) {
            ambitiousVassals.push(p);
        }
    });

    ambitiousVassals.forEach(vassal => {
        const suzerain = world.polities.get(vassal.suzerain);
        const potentialTargets = Array.from(suzerain.vassals)
            .map(id => world.polities.get(id))
            .filter(p => p.id !== vassal.id && p.power < vassal.power * 0.5);

        potentialTargets.forEach(target => {
            const distToVassal = Math.hypot(
                world.counties.get(vassal.capitalCountyId).capitalSeed.x - world.counties.get(target.capitalCountyId).capitalSeed.x,
                world.counties.get(vassal.capitalCountyId).capitalSeed.y - world.counties.get(target.capitalCountyId).capitalSeed.y
            );
            const distToSuzerain = Math.hypot(
                world.counties.get(suzerain.capitalCountyId).capitalSeed.x - world.counties.get(target.capitalCountyId).capitalSeed.x,
                world.counties.get(suzerain.capitalCountyId).capitalSeed.y - world.counties.get(target.capitalCountyId).capitalSeed.y
            );

            if (distToVassal < distToSuzerain * 0.5) {
                suzerain.vassals.delete(target.id);
                vassal.vassals.add(target.id);
                target.suzerain = vassal.id;
            }
        });
    });

    // 6. Handle remaining independent polities
    // 6. Handle remaining independent polities
    availablePolities.forEach(polityId => {
        const polity = world.polities.get(polityId);
        polity.government = GOVERNMENT_TYPES.FEUDAL_KINGDOM;
    });

    // 7. Generate Realm Laws for independent realms
    realmLeaders.forEach(realm => {
        realm.laws = {};

        // Crown Authority
        const caRoll = rand();
        if (realm.realmCounties > 30 && realm.government === GOVERNMENT_TYPES.IMPERIAL_CONFEDERATION) {
            realm.laws.crownAuthority = 'Low';
        } else if (caRoll < 0.33) {
            realm.laws.crownAuthority = 'Low';
        } else if (caRoll < 0.66) {
            realm.laws.crownAuthority = 'Medium';
        } else {
            realm.laws.crownAuthority = 'High';
        }

        // Succession Law
        const succRoll = rand();
        if (succRoll < 0.6) {
            realm.laws.succession = 'Primogeniture';
        } else if (succRoll < 0.9) {
            realm.laws.succession = 'Confederate Partition';
        } else {
            realm.laws.succession = 'Elective Monarchy';
        }
    });

    // 7. Final, definitive power calculation and title assignment
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
    
    topLevelPolities.forEach(p => assignTitlesRecursively(p));

    world.topLevelPolities.clear();
    world.polities.forEach(polity => { if (polity.suzerain === null) world.topLevelPolities.add(polity.id); });
}