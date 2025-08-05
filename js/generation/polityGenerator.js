/* Generates the base political entities (Polities) for the world
This replaces the old Nation > Province > County hierarchy with a more flexible system*/

import { GRID_WIDTH, GRID_HEIGHT, BIOMES, BASE_DEVELOPMENT, DEVELOPMENT_CORES } from '../core/config.js';
import { randomName } from '../core/utils.js';

/**Generates the base county-level divisions for the entire map
 * @param {object} world The world object
 * @param {function(): number} rand The seeded random function
 * @param {Set<string>} usedNames A set of already used names*/

function generateCounties(world, rand, usedNames) {
    const COUNTY_COUNT = Math.floor((GRID_WIDTH * GRID_HEIGHT) / 100); // Target ~100 tiles per county
    const capitals = [];
    for (let i = 0; i < COUNTY_COUNT; i++) {
        let x, y, tile;
        do {
            x = Math.floor(rand() * GRID_WIDTH);
            y = Math.floor(rand() * GRID_HEIGHT);
            tile = world.tiles[y * GRID_WIDTH + x];
        } while (tile.biome.cost >= 1000); // Must be on land
        capitals.push({ id: i, x, y });
        world.counties.set(i, {
            id: i,
            name: randomName(rand, usedNames),
            capitalSeed: { x, y },
            tiles: new Set()
        });
    }

    // Expansion pass to assign all tiles to a county
    const frontier = [];
    const costs = new Map();
    capitals.forEach(cap => {
        const tileIndex = cap.y * GRID_WIDTH + cap.x;
        costs.set(tileIndex, 0);
        world.countyGrid[cap.y][cap.x] = cap.id;
        frontier.push({ x: cap.x, y: cap.y, cost: 0 });
    });

    let head = 0;
    while (head < frontier.length) {
        const current = frontier[head++];
        const tileIndex = current.y * GRID_WIDTH + current.x;

        [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dx, dy]) => {
            const nx = current.x + dx, ny = current.y + dy;
            if (nx >= 0 && nx < GRID_WIDTH && ny >= 0 && ny < GRID_HEIGHT) {
                const neighborIndex = ny * GRID_WIDTH + nx;
                const neighborTile = world.tiles[neighborIndex];
                if (neighborTile.biome.cost < 1000 && !costs.has(neighborIndex)) {
                    costs.set(neighborIndex, current.cost + 1);
                    world.countyGrid[ny][nx] = world.countyGrid[current.y][current.x];
                    frontier.push({ x: nx, y: ny, cost: current.cost + 1 });
                }
            }
        });
    }

    // Populate the tiles set for each county
    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            const countyId = world.countyGrid[y][x];
            if (countyId !== null) {
                world.counties.get(countyId).tiles.add(y * GRID_WIDTH + x);
            }
        }
    }
}

/** Calculates the development for every county
 * @param {object} world The world object
 * @param {function(): number} rand The seeded random function*/

function calculateCountyDevelopment(world, rand) {
    const devCores = [];
    for (let i = 0; i < DEVELOPMENT_CORES; i++) {
        let x, y;
        do {
            x = Math.floor(rand() * GRID_WIDTH);
            y = Math.floor(rand() * GRID_HEIGHT);
        } while (world.tiles[y * GRID_WIDTH + x].biome.cost >= 1000);
        devCores.push({ x, y, strength: 2 + rand() * 8 });
    }

    world.counties.forEach(county => {
        if (county.tiles.size === 0) {
            county.development = 0;
            return;
        }
        let totalBiomeDev = 0, landTileCount = 0, avgTileX = 0, avgTileY = 0;
        county.tiles.forEach(tileIndex => {
            const tile = world.tiles[tileIndex];
            avgTileX += tile.x; avgTileY += tile.y;
            if (tile.biome.cost < 1000) {
                totalBiomeDev += tile.biome.dev;
                landTileCount++;
            }
        });

        if (landTileCount === 0) { county.development = 0; return; }
        avgTileX /= county.tiles.size; avgTileY /= county.tiles.size;

        let coreBonus = 0;
        for (const core of devCores) {
            const dist = Math.hypot(avgTileX - core.x, avgTileY - core.y);
            const influenceRadius = GRID_WIDTH / 7;
            if (dist < influenceRadius) {
                coreBonus += (1 - (dist / influenceRadius)) * core.strength;
            }
        }
        const avgBiomeDev = totalBiomeDev / landTileCount;
        let finalDev = BASE_DEVELOPMENT + (avgBiomeDev * 2) + coreBonus + ((rand() - 0.5) * 2);
        county.development = Math.round(Math.max(1, finalDev));
    });
}

/**Groups counties into small, duchy-sized polities
 * @param {object} world The world object
 * @param {function(): number} rand The seeded random function
 * @param {Set<string>} usedNames A set of already used names*/

export function generateBasePolities(world, rand, usedNames) {
    generateCounties(world, rand, usedNames);
    calculateCountyDevelopment(world, rand);

    const POLITY_COUNT = Math.floor(world.counties.size / 5); // Target ~5 counties per polity
    const polityCapitals = [];
    const sortedCounties = Array.from(world.counties.values()).sort((a, b) => b.development - a.development);

    // Select the most developed counties as polity capitals
    for (const county of sortedCounties) {
        if (polityCapitals.length >= POLITY_COUNT) break;
        polityCapitals.push(county);
    }

    // Create the polity objects
    polityCapitals.forEach((capitalCounty, i) => {
        const polity = {
            id: i,
            name: randomName(rand, usedNames),
            title: 'County', // Default title for now
            capitalCountyId: capitalCounty.id,
            directCounties: new Set(),
            vassals: new Set(), // Vassals will be other polities
            suzerain: null,
            power: 0
        };
        world.polities.set(i, polity);
        world.topLevelPolities.add(i); // All are independent initially
    });

    // Assign all other counties to the nearest polity capital
    world.counties.forEach(county => {
        let closestCapitalDist = Infinity;
        let closestPolityId = -1;
        polityCapitals.forEach((capital, polityId) => {
            const dist = Math.hypot(county.capitalSeed.x - capital.capitalSeed.x, county.capitalSeed.y - capital.capitalSeed.y);
            if (dist < closestCapitalDist) {
                closestCapitalDist = dist;
                closestPolityId = polityId;
            }
        });
        if (closestPolityId !== -1) {
            const polity = world.polities.get(closestPolityId);
            polity.directCounties.add(county.id);
            county.polityId = closestPolityId;
        }
    });

    // Calculate polity power and create the polityGrid for rendering
    world.polityGrid = Array(GRID_HEIGHT).fill(null).map(() => Array(GRID_WIDTH).fill(null));
    world.polities.forEach(polity => {
        let totalPower = 0;
        polity.directCounties.forEach(countyId => {
            const county = world.counties.get(countyId);
            totalPower += county.development;
            county.tiles.forEach(tileIndex => {
                const x = tileIndex % GRID_WIDTH;
                const y = Math.floor(tileIndex / GRID_WIDTH);
                world.polityGrid[y][x] = polity.id;
            });
        });
        polity.power = totalPower;
    });
}
