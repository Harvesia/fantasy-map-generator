import { generateFactionName } from './factionNameGenerator.js';

/**
 * Recursively gathers all vassals under a given polity.
 * @param {object} polity The polity to start from.
 * @param {Map<number, object>} polityMap A map of all polities.
 * @returns {Array<object>} A flat array of all vassal objects.
 */
function getAllVassals(polity, polityMap) {
    let allVassals = [];
    if (!polity.vassals) return allVassals;

    polity.vassals.forEach(vassalId => {
        const vassal = polityMap.get(vassalId);
        if (vassal) {
            allVassals.push(vassal);
            allVassals = allVassals.concat(getAllVassals(vassal, polityMap));
        }
    });
    return allVassals;
}


/**
 * Main entry point for generating all internal political data.
 * @param {object} world The entire world object.
 */
export function generateInternalPolitics(world) {
    const allPolities = Array.from(world.polities.values());
    // Create a quick lookup map for efficiency
    const polityMap = new Map(allPolities.map(p => [p.id, p]));

    // First pass: Calculate liberty desire for all vassals
    for (const polity of allPolities) {
        if (polity.suzerain !== null) {
            calculateLibertyDesire(polity, polityMap);
        }
    }

    // Second pass: Generate factions within each top-level realm
    for (const polity of allPolities) {
        if (polity.suzerain === null) { // Only generate factions for independent realms
            generateFactions(polity, polityMap, world);
        }
    }
}

/**
 * Calculates the liberty desire for a single vassal.
 * @param {object} vassal The vassal polity object.
 * @param {Map<number, object>} polityMap A map of all polities for quick lookup.
 */
function calculateLibertyDesire(vassal, polityMap) {
    const directSuzerain = polityMap.get(vassal.suzerain);
    if (!directSuzerain) {
        vassal.libertyDesire = 0;
        return;
    }

    // --- FINAL LIBERTY DESIRE RE-REWORK ---

    // 1. Find the top-level ruler of the entire realm.
    let topLevelSuzerain = directSuzerain;
    while (topLevelSuzerain.suzerain !== null) {
        topLevelSuzerain = polityMap.get(topLevelSuzerain.suzerain);
        if (!topLevelSuzerain) {
            vassal.libertyDesire = 0;
            return;
        }
    }

    // 2. Relative power multiplier is HALVED again from 40 to 20.
    const vassalRealmPower = vassal.realmPower || vassal.power || 0;
    const topLevelRealmPower = topLevelSuzerain.realmPower || topLevelSuzerain.power || 1;
    let libertyDesire = (vassalRealmPower / topLevelRealmPower) * 20;

    // 3. Opinion of the DIRECT lord remains critical.
    const opinionOfDirectSuzerain = (vassal.opinions && vassal.opinions.has(directSuzerain.id)) ? vassal.opinions.get(directSuzerain.id) : 0;
    vassal.opinionOfSuzerain = opinionOfDirectSuzerain;
    libertyDesire -= opinionOfDirectSuzerain * 0.5;

    // 4. The diplomatic skill of the DIRECT lord is now more important. (Increased from 3 to 4)
    if (directSuzerain.ruler && directSuzerain.ruler.stats) {
        libertyDesire -= directSuzerain.ruler.stats.dip * 4;
    }

    // 5. Crown Authority bonuses are HALVED.
    if (topLevelSuzerain.laws) {
        switch (topLevelSuzerain.laws.crownAuthority) {
            case 'Medium': libertyDesire += 5; break;
            case 'High': libertyDesire += 10; break;
        }
    }

    vassal.libertyDesire = Math.min(100, Math.max(0, Math.round(libertyDesire)));
}


/**
 * Generates political factions within a realm, merging where necessary.
 * @param {object} suzerain The top-level ruler of the realm.
 * @param {Map<number, object>} polityMap A map of all polities for quick lookup.
 * @param {object} world The entire world object.
 */
function generateFactions(suzerain, polityMap, world) {
    suzerain.factions = [];
    const MAX_FACTIONS = 5;
    
    const directVassals = Array.from(suzerain.vassals).map(id => polityMap.get(id)).filter(Boolean);
    if (directVassals.length === 0) return;

    let potentialLeaders = directVassals.filter(v => v.libertyDesire > 50 && v.opinionOfSuzerain < 0);
    potentialLeaders.sort((a,b) => (b.realmPower || b.power) - (a.realmPower || a.power));

    const factionedVassals = new Set();

    // Helper to add a lord and all their sub-vassals to a faction
    const addLordAndHierarchy = (lord, faction) => {
        if (factionedVassals.has(lord.id)) return;

        const hierarchy = [lord, ...getAllVassals(lord, polityMap)];
        hierarchy.forEach(member => {
            if (!factionedVassals.has(member.id)) {
                faction.members.push(member.id);
                faction.power += member.realmPower || member.power || 0;
                factionedVassals.add(member.id);
            }
        });
    };

    for (const leader of potentialLeaders) {
        if (factionedVassals.has(leader.id)) continue;

        // Determine what type of faction this leader would form
        const leaderCulture = world.cultures.find(c => c.id === world.counties.get(leader.capitalCountyId).culture);
        const suzerainCulture = world.cultures.find(c => c.id === world.counties.get(suzerain.capitalCountyId).culture);
        let factionType = 'Lower Crown Authority';
        if (leader.libertyDesire > 75 && leaderCulture?.id !== suzerainCulture?.id) {
            factionType = 'Independence';
        }

        // Check if a faction of this type already exists
        let existingFaction = suzerain.factions.find(f => f.type === factionType);

        if (existingFaction) {
            // If it exists, merge this leader and their hierarchy into it
            addLordAndHierarchy(leader, existingFaction);
        } else if (suzerain.factions.length < MAX_FACTIONS) {
            // If not, and we have room, create a new faction
            const newFaction = {
                leader: leader.id,
                type: factionType,
                name: '', 
                members: [],
                power: 0
            };
            newFaction.name = generateFactionName(newFaction, leader, suzerain, world, world.rand);
            
            addLordAndHierarchy(leader, newFaction);

            // Only add the new faction if it has members (which it should)
            if (newFaction.members.length > 0) {
                 suzerain.factions.push(newFaction);
            }
        }
    }

    // Now, invite other direct vassals to the newly formed/merged factions
    directVassals.forEach(vassal => {
        if (factionedVassals.has(vassal.id)) return;

        suzerain.factions.forEach(faction => {
            // Re-check to ensure we don't add someone who was just added as part of another lord's hierarchy
            if(factionedVassals.has(vassal.id)) return; 
            
            if (shouldVassalJoinFaction(vassal, polityMap.get(faction.leader), faction.type, suzerain, world)) {
                addLordAndHierarchy(vassal, faction);
            }
        });
    });

    // Final cleanup: remove any factions that ended up with just one member (the leader)
    suzerain.factions = suzerain.factions.filter(f => f.members.length > 1);
}


/**
 * Determines if a direct vassal should join a given faction.
 * @param {object} vassal The vassal to check.
 * @param {object} leader The faction leader.
 * @param {string} factionType The type of the faction.
 * @param {object} suzerain The top-level suzerain of the realm.
 * @param {object} world The entire world object.
 * @returns {boolean} True if the vassal should join, false otherwise.
 */
function shouldVassalJoinFaction(vassal, leader, factionType, suzerain, world) {
    if (!vassal || !leader) return false;

    const opinionOfLeader = (vassal.opinions && vassal.opinions.has(leader.id)) ? vassal.opinions.get(leader.id) : 0;
    if (opinionOfLeader < 10) {
        return false;
    }

    if (vassal.opinionOfSuzerain > 40) {
        return false;
    }

    if (vassal.libertyDesire < 35) return false;
    
    const opinion = vassal.opinionOfSuzerain;

    switch (factionType) {
        case 'Independence':
             const vassalCulture = world.cultures.find(c => c.id === world.counties.get(vassal.capitalCountyId).culture);
             const leaderCulture = world.cultures.find(c => c.id === world.counties.get(leader.capitalCountyId).culture);
            return (vassalCulture?.id === leaderCulture?.id && opinion < -10 && vassal.libertyDesire > 65);
        case 'Lower Crown Authority':
            const dipBonus = suzerain?.ruler?.stats?.dip < 4 ? 15 : 0;
            return (opinion < 20 && (vassal.libertyDesire + dipBonus) > 50);
        default:
            return false;
    }
}