import { GRID_WIDTH, GRID_HEIGHT } from '../core/config.js';

/**
 * Assigns a unique, visually distinct color to each nation.
 * @param {object} world - The world object.
 * @param {function(): number} rand - The seeded random function.
 */
export function colorNations(world, rand) {
    const nations = Array.from(world.nations.values());
    const nationCount = nations.length;
    if (nationCount === 0) return;

    // Use a starting hue to randomize the color palette for each generation
    const startHue = rand() * 360;
    nations.forEach((nation, i) => {
        const hue = (startHue + (i / nationCount) * 360) % 360;
        nation.color = `hsl(${Math.floor(hue)}, 70%, 50%)`;
        nation.defaultColor = nation.color;
    });

    // Adjust color for vassals to show their status
    nations.forEach(nation => {
        if (nation.suzerain !== null) {
            nation.color = nation.color.replace("70%", "40%").replace("50%", "40%");
        }
    });
}

/**
 * Assigns a unique, visually distinct color to each item in a sociology group (cultures or religions).
 * @param {object} world - The world object.
 * @param {function(): number} rand - The seeded random function.
 * @param {string} sociologyType - The type of group to color ('cultures' or 'religions').
 */
export function colorSociology(world, rand, sociologyType) {
    const items = world[sociologyType];
    if (!items || items.length === 0) return;

    if (sociologyType === 'cultures') {
        // Color culture groups
        const cultureGroups = world.cultures;
        const groupCount = cultureGroups.length;
        const startHue = rand() * 360;
        cultureGroups.forEach((group, i) => {
            const hue = (startHue + (i / groupCount) * 360) % 360;
            group.color = `hsl(${Math.floor(hue)}, 70%, 65%)`;
        });

        // Color sub-cultures based on their parent group
        world.subCultures.forEach(subCulture => {
            const parentGroup = world.cultures.find(cg => cg.id === subCulture.parentCultureId);
            if (parentGroup) {
                const parentHue = parseFloat(parentGroup.color.match(/hsl\((\d+)/)[1]);
                const hueShift = (rand() - 0.5) * 20; // Shift hue slightly
                const satShift = 60 + rand() * 20; // Vary saturation
                const lightShift = 60 + rand() * 20; // Vary lightness
                subCulture.color = `hsl(${(parentHue + hueShift + 360) % 360}, ${satShift}%, ${lightShift}%)`;
            }
        });

    } else if (sociologyType === 'religions') {
        const dynamicReligions = items.filter(r => r.id !== 0);
        const itemCount = dynamicReligions.length;
        const startHue = rand() * 360;
        
        // Handle Folk Religion separately with a hardcoded color
        const folkReligion = items.find(r => r.id === 0);
        if (folkReligion) {
            folkReligion.color = 'hsl(0, 0%, 50%)'; // A neutral grey
        }

        // Color the rest of the religions dynamically
        dynamicReligions.forEach((item, i) => {
            const hue = (startHue + (i / itemCount) * 360) % 360;
            item.color = `hsl(${Math.floor(hue)}, 70%, 65%)`;
        });
    }
}
