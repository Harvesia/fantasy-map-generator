// factionNameGenerator.js
// Generates names for political factions based on context and type.

/**
 * Generates a name for a faction.
 * @param {object} faction The faction object.
 * @param {object} leader The leader of the faction.
 * @param {object} suzerain The suzerain of the realm.
 * @param {object} world The entire world object for context.
 * @param {function} rand The seeded random function.
 * @returns {string} The generated faction name.
 */
export function generateFactionName(faction, leader, suzerain, world, rand) {
    const patternRoll = rand();

    switch (faction.type) {
        case 'Independence':
            if (patternRoll < 0.5) {
                const cultureName = world.cultures[leader.culture]?.name || leader.name;
                const adjective = cultureName.endsWith('n') ? cultureName + 'ian' : cultureName + 'n';
                return `The ${adjective} Liberation Front`;
            }
            const capital = world.counties.get(leader.capitalCountyId);
            return `The League of ${capital.name}`;

        case 'Claimant':
            if (leader.dynasty && patternRoll < 0.6) {
                return `The ${leader.dynasty.name} Restoration`;
            }
            return `The Lords for ${leader.ruler.firstName}`;

        case 'Lower Crown Authority':
            if (patternRoll < 0.5) {
                return `The ${suzerain.title}'s Loyal Opposition`;
            }
            const capitalCity = world.counties.get(leader.capitalCountyId);
            return `The ${capitalCity.name} League`;

        default:
            return "The Disgruntled Lords";
    }
}
