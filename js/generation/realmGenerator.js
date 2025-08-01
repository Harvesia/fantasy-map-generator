/* Forms large realms by grouping the base polities into complex hierarchies*/

import { GOVERNMENT_TYPES } from '../core/config.js';

/**The main function to form realms from the base polities
 * @param {object} world The world object
 * @param {function(): number} rand The seeded random function*/

export function formRealms(world, rand) {
    const sortedPolities = Array.from(world.polities.values()).sort((a, b) => b.power - a.power);
    const availablePolities = new Set(sortedPolities.map(p => p.id));

    // Attempt to form an Imperial Confederation
    // Criteria: Most powerful polity, high chance if it has high development
    const potentialEmperor = sortedPolities[0];
    const avgDev = potentialEmperor.power / potentialEmperor.directCounties.size;
    if (avgDev > 12 && rand() > 0.5) {
        potentialEmperor.government = GOVERNMENT_TYPES.IMPERIAL_CONFEDERATION;
        potentialEmperor.title = 'Emperor';
        availablePolities.delete(potentialEmperor.id);

        const imperialRadius = Math.sqrt(potentialEmperor.power) * 2.5;
        world.polities.forEach(vassalPolity => {
            if (availablePolities.has(vassalPolity.id)) {
                const dist = Math.hypot(
                    world.counties.get(potentialEmperor.capitalCountyId).capitalSeed.x - world.counties.get(vassalPolity.capitalCountyId).capitalSeed.x,
                    world.counties.get(potentialEmperor.capitalCountyId).capitalSeed.y - world.counties.get(vassalPolity.capitalCountyId).capitalSeed.y
                );
                if (dist < imperialRadius) {
                    vassalPolity.suzerain = potentialEmperor.id;
                    vassalPolity.title = 'Prince';
                    potentialEmperor.vassals.add(vassalPolity.id);
                    availablePolities.delete(vassalPolity.id);
                }
            }
        });
    }

    // Form Feudal Kingdoms and Tribal Federations from remaining powerful polities
    sortedPolities.forEach(polity => {
        if (availablePolities.has(polity.id)) {
            // Decide government type for this new realm leader
            const avgDev = polity.power / polity.directCounties.size;
            const primaryCultureGroup = world.cultures[world.counties.get(polity.capitalCountyId).culture];
            
            if (avgDev < 8 && primaryCultureGroup && rand() > 0.4) {
                polity.government = GOVERNMENT_TYPES.TRIBAL_FEDERATION;
                polity.title = 'High Chieftain';
            } else {
                polity.government = GOVERNMENT_TYPES.FEUDAL_KINGDOM;
                polity.title = 'King';
            }
            availablePolities.delete(polity.id);

            // Absorb or vassalize neighbors
            const realmRadius = Math.sqrt(polity.power) * 1.5;
            sortedPolities.forEach(targetPolity => {
                if (availablePolities.has(targetPolity.id)) {
                     const dist = Math.hypot(
                        world.counties.get(polity.capitalCountyId).capitalSeed.x - world.counties.get(targetPolity.capitalCountyId).capitalSeed.x,
                        world.counties.get(polity.capitalCountyId).capitalSeed.y - world.counties.get(targetPolity.capitalCountyId).capitalSeed.y
                    );

                    if (dist < realmRadius) {
                        // Tribal Federations only vassalize their own culture group
                        if (polity.government === GOVERNMENT_TYPES.TRIBAL_FEDERATION) {
                            const targetCultureGroup = world.cultures[world.counties.get(targetPolity.capitalCountyId).culture];
                            if (targetCultureGroup && targetCultureGroup.id === primaryCultureGroup.id) {
                                targetPolity.suzerain = polity.id;
                                targetPolity.title = 'Chieftain';
                                polity.vassals.add(targetPolity.id);
                                availablePolities.delete(targetPolity.id);
                            }
                        } else { // Feudal Kingdoms are more aggressive
                             targetPolity.suzerain = polity.id;
                             targetPolity.title = 'Duke';
                             polity.vassals.add(targetPolity.id);
                             availablePolities.delete(targetPolity.id);
                        }
                    }
                }
            });
        }
    });

    // Any remaining small polities become independent city-states or merchant republics
    availablePolities.forEach(polityId => {
        const polity = world.polities.get(polityId);
        const avgDev = polity.power / polity.directCounties.size;
        if (avgDev > 15 && polity.directCounties.size < 3) {
             polity.government = GOVERNMENT_TYPES.MERCHANT_REPUBLIC;
             polity.title = 'Doge';
        } else {
            polity.government = GOVERNMENT_TYPES.FEUDAL_KINGDOM; // Small independent duchy
            polity.title = 'Duke';
        }
    });

    // Finalize the list of top-level, independent polities
    world.topLevelPolities.clear();
    world.polities.forEach(polity => {
        if (polity.suzerain === null) {
            world.topLevelPolities.add(polity.id);
        }
    });
}
