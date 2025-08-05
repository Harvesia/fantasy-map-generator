import { randomName } from '../core/utils.js';

/**
 * Simulates a pre-history of large, fallen empires to create a more organic and historically-grounded world.
 * @param {object} world The world object.
 * @param {function(): number} rand The seeded random function.
 * @param {Set<string>} usedNames A set of already used names.
 */
export function simulateHistory(world, rand, usedNames) {
    const sortedPolities = Array.from(world.polities.values()).sort((a, b) => b.power - a.power);
    const availablePolities = new Set(sortedPolities.map(p => p.id));
    const ancientEmpires = [];
    const numAncientEmpires = 1 + Math.floor(rand() * 3); // 1-3 empires

    // 1. Create Ancient Empires
    for (let i = 0; i < numAncientEmpires && i < sortedPolities.length; i++) {
        const leader = sortedPolities[i];
        if (availablePolities.has(leader.id)) {
            const empire = {
                id: `ancient_${i}`,
                name: `Ancient Empire of ${randomName(rand, usedNames)}`,
                leader: leader,
                vassals: new Set()
            };
            ancientEmpires.push(empire);
            availablePolities.delete(leader.id);
        }
    }

    // 2. Aggressive Expansion Pass
    const allClaims = [];
    ancientEmpires.forEach(empire => {
        availablePolities.forEach(polityId => {
            const targetPolity = world.polities.get(polityId);
            const leaderCapital = world.counties.get(empire.leader.capitalCountyId);
            const targetCapital = world.counties.get(targetPolity.capitalCountyId);
            const dist = Math.hypot(
                leaderCapital.capitalSeed.x - targetCapital.capitalSeed.x,
                leaderCapital.capitalSeed.y - targetCapital.capitalSeed.y
            );
            // Simple score based on leader power and inverse distance
            const score = empire.leader.power / (dist + 1);
            allClaims.push({ empire, target: targetPolity, score });
        });
    });

    allClaims.sort((a, b) => b.score - a.score);

    allClaims.forEach(claim => {
        if (availablePolities.has(claim.target.id)) {
            claim.empire.vassals.add(claim.target);
            availablePolities.delete(claim.target.id);
        }
    });

    // 3. Imprint Culture and Collapse
    let protoCultureId = 0;
    ancientEmpires.forEach(empire => {
        const newCulture = {
            id: world.cultures.length,
            name: `${empire.name} Culture`,
            color: ''
        };
        world.cultures.push(newCulture);

        // Imprint culture on all member polities
        empire.vassals.forEach(vassal => {
            vassal.directCounties.forEach(countyId => {
                world.counties.get(countyId).culture = newCulture.id;
            });
        });
        // Also imprint on the leader's counties
        empire.leader.directCounties.forEach(countyId => {
            world.counties.get(countyId).culture = newCulture.id;
        });

        // The empire is now a memory. Its vassals are left behind.
    });

    // Note: We don't delete the polities, we just leave them with a shared culture.
    // The main formRealms function will now run on this fractured landscape.
}
