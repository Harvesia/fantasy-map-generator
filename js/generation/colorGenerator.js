/* Assigns colors to various generated world entities. */

/**Assigns a unique, visually distinct color to each polity, respecting realm hierarchies
 * @param {object} world The world object
 * @param {function(): number} rand The seeded random function*/
export function colorPolities(world, rand) {
    const topLevelPolities = Array.from(world.topLevelPolities).map(id => world.polities.get(id));
    const realmCount = topLevelPolities.length;
    if (realmCount === 0) return;

    // Use a random starting hue and the golden angle to ensure colors are well-distributed and varied
    const startHue = rand() * 360;
    const goldenAngle = 137.5;

    // First, assign a unique base color to each independent realm leader
    topLevelPolities.forEach((polity, i) => {
        if (!polity) return;
        const hue = (startHue + (i * goldenAngle)) % 360;
        // Using a higher lightness (60%) for better vibrancy
        polity.color = `hsl(${Math.floor(hue)}, 70%, 60%)`;
        polity.defaultColor = polity.color;
    });

    // Then, assign colors to all vassals based on their top-level suzerain's color
    world.polities.forEach(polity => {
        if (polity.suzerain !== null) {
            let topLevelSuzerain = polity;
            // Traverse up the vassal chain to find the ultimate realm leader
            while (topLevelSuzerain && topLevelSuzerain.suzerain !== null) {
                topLevelSuzerain = world.polities.get(topLevelSuzerain.suzerain);
            }

            if (topLevelSuzerain && topLevelSuzerain.defaultColor) {
                // Vassals get a slightly darker, less saturated version of their realm's color
                polity.color = topLevelSuzerain.defaultColor.replace("70%", "55%").replace("60%", "45%");
                polity.defaultColor = polity.color;
            } else {
                // Fallback for orphaned vassals, though this shouldn't happen
                polity.color = `hsl(0, 0%, 30%)`;
                polity.defaultColor = polity.color;
            }
        }
    });
}

/**
 * Assigns a unique, visually distinct color to each item in a sociology group
 * @param {object} world The world object
 * @param {function(): number} rand The seeded random function
 * @param {string} sociologyType The type of group to color ('cultures' or 'religions')*/

export function colorSociology(world, rand, sociologyType) {
    const items = world[sociologyType];
    if (!items || items.length === 0) return;

    if (sociologyType === 'cultures') {
        const cultureGroups = world.cultures;
        const groupCount = cultureGroups.length;
        const startHue = rand() * 360;
        cultureGroups.forEach((group, i) => {
            const hue = (startHue + (i / groupCount) * 360) % 360;
            group.color = `hsl(${Math.floor(hue)}, 70%, 65%)`;
        });

        world.subCultures.forEach(subCulture => {
            const parentGroup = world.cultures.find(cg => cg.id === subCulture.parentCultureId);
            if (parentGroup) {
                const parentHue = parseFloat(parentGroup.color.match(/hsl\((\d+)/)[1]);
                const hueShift = (rand() - 0.5) * 20;
                const satShift = 60 + rand() * 20;
                const lightShift = 60 + rand() * 20;
                subCulture.color = `hsl(${(parentHue + hueShift + 360) % 360}, ${satShift}%, ${lightShift}%)`;
            }
        });

    } else if (sociologyType === 'religions') {
        const dynamicReligions = items.filter(r => r.id !== 0);
        const itemCount = dynamicReligions.length;
        const startHue = rand() * 360;
        
        const folkReligion = items.find(r => r.id === 0);
        if (folkReligion) {
            folkReligion.color = 'hsl(0, 0%, 50%)';
        }

        dynamicReligions.forEach((item, i) => {
            const hue = (startHue + (i / itemCount) * 360) % 360;
            item.color = `hsl(${Math.floor(hue)}, 70%, 65%)`;
        });
    }
}
