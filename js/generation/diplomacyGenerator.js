/* Generates the diplomatic landscape based on a complex opinion system */

import { OPINION_MODIFIERS } from '../core/config.js';

/**Builds an adjacency graph for all polities
 * @param {object} world The world object*/
function buildPolityAdjacencyGraph(world) {
    world.polityAdjacency = new Map();
    world.polities.forEach(p => world.polityAdjacency.set(p.id, new Set()));

    for (let y = 0; y < world.polityGrid.length; y++) {
        for (let x = 0; x < world.polityGrid[y].length; x++) {
            const polityId = world.polityGrid[y][x];
            if (polityId === null) continue;

            [[1, 0], [0, 1]].forEach(([dx, dy]) => {
                const nx = x + dx, ny = y + dy;
                if (nx < world.polityGrid[y].length && ny < world.polityGrid.length) {
                    const neighborId = world.polityGrid[ny][nx];
                    if (neighborId !== null && polityId !== neighborId) {
                        world.polityAdjacency.get(polityId).add(neighborId);
                        world.polityAdjacency.get(neighborId).add(neighborId);
                    }
                }
            });
        }
    }
}

/**Calculates the opinion of every polity towards every other polity
 * @param {object} world The world object*/

function calculateAllOpinions(world) {
    world.polities.forEach(p1 => {
        p1.opinions = new Map();
        world.polities.forEach(p2 => {
            if (p1.id === p2.id) return;

            let opinion = 0;
            const p1Culture = world.cultures[world.counties.get(p1.capitalCountyId).culture];
            const p2Culture = world.cultures[world.counties.get(p2.capitalCountyId).culture];
            const p1Religion = world.religions[world.counties.get(p1.capitalCountyId).religion];
            const p2Religion = world.religions[world.counties.get(p2.capitalCountyId).religion];

            // Culture
            if (p1Culture && p2Culture) {
                if (p1Culture.id === p2Culture.id) {
                    opinion += OPINION_MODIFIERS.SAME_CULTURE_GROUP;
                } else {
                    opinion += OPINION_MODIFIERS.DIFFERENT_CULTURE_GROUP;
                }
            }
            
            // Religion
            if (p1Religion && p2Religion) {
                if (p1Religion.id === p2Religion.id) {
                    opinion += OPINION_MODIFIERS.SAME_RELIGION;
                } else {
                    opinion += OPINION_MODIFIERS.DIFFERENT_RELIGION;
                }
            }

            // Borders
            if (world.polityAdjacency.get(p1.id).has(p2.id)) {
                opinion += OPINION_MODIFIERS.BORDER_FRICTION;
            }

            // Power Differential (p1's opinion of p2)
            const powerRatio = p2.power / p1.power;
            opinion += (1 - powerRatio) * OPINION_MODIFIERS.POWER_DIFFERENCE_SCALE;

            // Dynasty
            if (p1.dynasty && p2.dynasty && p1.dynasty.name === p1.dynasty.name) {
                opinion += OPINION_MODIFIERS.SAME_DYNASTY;
            }
            
            // Suzerain/Vassal relationship
            if (p1.suzerain === p2.id) opinion += OPINION_MODIFIERS.IS_SUZERAIN;
            if (p1.vassals.has(p2.id)) opinion += OPINION_MODIFIERS.HAS_VASSAL;


            p1.opinions.set(p2.id, Math.round(opinion));
        });
    });
}

/**Simulates diplomatic actions like alliances and wars based on opinions
 * @param {object} world The world object
 * @param {function(): number} rand The seeded random function*/

function simulateDiplomaticActions(world, rand) {
    const topLevelPolities = Array.from(world.topLevelPolities);

    topLevelPolities.forEach(p1Id => {
        const p1 = world.polities.get(p1Id);
        if (!p1) return;

        // Sort other polities by opinion
        const sortedOpinions = Array.from(p1.opinions.entries()).sort((a, b) => b[1] - a[1]);

        // Form Alliances (Lowered threshold from 80 to 60)
        for (const [p2Id, opinion] of sortedOpinions) {
            if (p1.allies.size >= 2) break; // Limit allies
            const p2 = world.polities.get(p2Id);
            if (p2 && p2.suzerain === null && !p1.allies.has(p2Id) && p2.allies.size < 2) {
                if (opinion > (OPINION_MODIFIERS.ALLY_THRESHOLD - 20) + (rand() * 25)) {
                    p1.allies.add(p2Id);
                    p2.allies.add(p1Id);
                }
            }
        }

        // Declare Wars (Raised threshold from -100 to -75)
        for (let i = sortedOpinions.length - 1; i >= 0; i--) {
            const [p2Id, opinion] = sortedOpinions[i];
            if (p1.atWarWith.size >= 1) break; // Limit wars
            const p2 = world.polities.get(p2Id);
            if (p2 && p2.suzerain === null && !p1.atWarWith.has(p2Id)) {
                if (opinion < (OPINION_MODIFIERS.WAR_THRESHOLD + 25) - (rand() * 30)) {
                    // Check if they are neighbors for a CB
                    if (world.polityAdjacency.get(p1.id).has(p2.id)) {
                        p1.atWarWith.add(p2Id);
                        p2.atWarWith.add(p1Id);
                    }
                }
            }
        }
    });
}

/**
 * Checks for and triggers civil wars based on a direct power comparison of the entire rebellious bloc.
 * @param {object} world The world object.
 */
function simulateRebellions(world) {
    world.polities.forEach(suzerain => {
        // Only top-level rulers can have civil wars, and they must have factions.
        if (suzerain.suzerain !== null || !suzerain.factions || suzerain.factions.length === 0) {
            return;
        }

        let hasRebelliousSpark = false;
        let totalFactionPower = 0;
        const allRebelliousMembers = new Set();

        // Calculate the total power of all factions and check for the 100% LD spark.
        suzerain.factions.forEach(faction => {
            const factionLeader = world.polities.get(faction.leader);
            if (factionLeader && factionLeader.libertyDesire >= 100) {
                hasRebelliousSpark = true;
            }
            totalFactionPower += faction.power;
            faction.members.forEach(memberId => allRebelliousMembers.add(memberId));
        });

        // Check the two conditions for a massive civil war
        if (hasRebelliousSpark && totalFactionPower > (suzerain.realmPower || suzerain.power)) {
            // THE REALM SHATTERS
            // The suzerain is now at war with every member of every faction.
            suzerain.atWarWith = new Set([...suzerain.atWarWith, ...allRebelliousMembers]);
            
            // Every rebel is now at war with the suzerain.
            allRebelliousMembers.forEach(memberId => {
                const member = world.polities.get(memberId);
                if (member) {
                    member.atWarWith.add(suzerain.id);
                }
            });
        }
    });
}


/**The main function to generate the entire diplomatic landscape
 * @param {object} world The world object
 * @param {function(): number} rand The seeded random function*/

export function generateDiplomacy(world, rand) {
    buildPolityAdjacencyGraph(world);
    calculateAllOpinions(world);
    simulateDiplomaticActions(world, rand);
    simulateRebellions(world);
}