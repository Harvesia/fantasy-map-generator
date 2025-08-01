// Generates rulers and dynasties for the world's polities

import { randomName } from '../core/utils.js';
import { firstNames, GOVERNMENT_TYPES } from '../core/config.js';

/**Generates a unique dynasty for a polity
 * @param {object} world The world object
 * @param {function(): number} rand The seeded random function
 * @param {Set<string>} usedNames A set of already used names to ensure uniqueness
 * @param {object} polity The polity for which to generate a dynasty
 * @returns {{name: string, originCulture: number} | null} The generated dynasty object, or null for republics*/

function generateDynasty(world, rand, usedNames, polity) { // Added 'world' parameter
    if (polity.government === GOVERNMENT_TYPES.MERCHANT_REPUBLIC) {
        return null; // Republics don't have dynasties
    }

    const baseName = rand() > 0.5 ? polity.name : randomName(rand, usedNames);
    let dynastyName = baseName;

    if (rand() > 0.7) {
        dynastyName = "von " + dynastyName;
    } else if (rand() > 0.4) {
        dynastyName += "id";
    }

    usedNames.add(dynastyName);
    const capitalCounty = world.counties.get(polity.capitalCountyId);
    return {
        name: dynastyName,
        originCulture: capitalCounty ? capitalCounty.culture : 0
    };
}

/**Generates a ruler for a given polity
 * @param {function(): number} rand The seeded random function
 * @param {object} polity The polity the ruler belongs to
 * @returns {{firstName: string, stats: {adm: number, dip: number, mil: number}}} The generated ruler object*/

function generateRuler(rand, polity) {
    const firstName = firstNames[Math.floor(rand() * firstNames.length)];
    
    // Generate stats on a bell curve (by summing two random numbers)
    const adm = Math.floor(rand() * 4) + Math.floor(rand() * 4); // 0-6
    const dip = Math.floor(rand() * 4) + Math.floor(rand() * 4); // 0-6
    const mil = Math.floor(rand() * 4) + Math.floor(rand() * 4); // 0-6

    return {
        firstName: firstName,
        stats: { adm, dip, mil }
    };
}

/**The main function to assign rulers and dynasties to all polities in the world
 * @param {object} world The world object
 * @param {function(): number} rand The seeded random function
 * @param {Set<string>} usedNames A set of already used names*/

export function assignRulers(world, rand, usedNames) {
    world.polities.forEach(polity => {
        // Pass 'world' into generateDynasty
        const dynasty = generateDynasty(world, rand, usedNames, polity);
        const ruler = generateRuler(rand, polity);

        polity.dynasty = dynasty;
        polity.ruler = ruler;
    });
}
