import { GOVERNMENT_TYPES } from '../core/config.js';

const FEUDAL_HIERARCHY = ['Empire', 'Kingdom', ['Grand Duchy', 'Principality'], 'Duchy', 'County', 'Barony'];

function getTitleRank(title) {
    for (let i = 0; i < FEUDAL_HIERARCHY.length; i++) {
        const rank = FEUDAL_HIERARCHY[i];
        if (Array.isArray(rank) && rank.includes(title)) return i;
        if (rank === title) return i;
    }
    return -1;
}

function getFeudalTitle(polity, rand) {
    const power = polity.realmPower;
    const numVassals = polity.vassals.size;

    if (power > 1000) return 'Empire';
    if (power > 500) return 'Kingdom';
    if (power > 200) {
        return rand() > 0.5 ? 'Grand Duchy' : 'Principality';
    }
    if (power > 100) return 'Duchy';
    if (power > 30) return 'County';
    if (power >= 10) return 'Barony';
    return 'Barony';
}

export function getPolityTitle(polity, world) {
    const rand = world.rand; // Get the seeded random function from the world object

    if (polity.suzerain) {
        const suzerain = world.polities.get(polity.suzerain);
        if (suzerain.government === GOVERNMENT_TYPES.IMPERIAL_CONFEDERATION) return 'Principality';
        if (suzerain.government === GOVERNMENT_TYPES.TRIBAL_FEDERATION) return 'Chieftaincy';
        
        const suzerainRank = getTitleRank(suzerain.title);
        if (suzerainRank === -1) { // Suzerain is not a feudal title
            return getFeudalTitle(polity, rand);
        }

        let vassalTitle = getFeudalTitle(polity, rand);
        let vassalRank = getTitleRank(vassalTitle);

        if (vassalRank <= suzerainRank) {
            const newRank = suzerainRank + 1;
            if (newRank < FEUDAL_HIERARCHY.length) {
                const newTitleOrTitles = FEUDAL_HIERARCHY[newRank];
                if (Array.isArray(newTitleOrTitles)) {
                    return newTitleOrTitles[Math.floor(rand() * newTitleOrTitles.length)];
                }
                return newTitleOrTitles;
            } else {
                return FEUDAL_HIERARCHY[FEUDAL_HIERARCHY.length - 1];
            }
        }
        return vassalTitle;
    }

    // Independent polities
    switch (polity.government) {
        case GOVERNMENT_TYPES.FEUDAL_KINGDOM:
        case GOVERNMENT_TYPES.IMPERIAL_CONFEDERATION:
            const title = getFeudalTitle(polity, rand);
            if (title === 'Barony') {
                return 'County';
            }
            return title;
        case GOVERNMENT_TYPES.TRIBAL_FEDERATION:
            if (polity.realmPower > 100 && polity.vassals.size > 0) return 'High Chieftaincy';
            return 'Chieftaincy';
        case GOVERNMENT_TYPES.MERCHANT_REPUBLIC:
            if (polity.realmPower > 200 && polity.realmAvgDevelopment > 20) return 'Serene Republic';
            return 'Republic';
        default:
            return getFeudalTitle(polity, rand);
    }
}

/** Makes a preliminary guess at a title based on raw power, to prevent powerful realms from being vassalized early.
 * @param {number} power The polity's initial power.
 * @returns {string} A preliminary title guess.
*/
export function getPreliminaryTitle(power) {
    if (power > 600) return 'Empire';
    if (power > 350) return 'Kingdom';
    if (power > 200) return 'Principality'; // Represents the Grand Duchy/Principality tier
    return 'Other';
}