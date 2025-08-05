/* Generates the base political entities (Polities) for the world
This replaces the old Nation > Province > County hierarchy with a more flexible system*/

import { GRID_WIDTH, GRID_HEIGHT, BIOMES, BASE_DEVELOPMENT, DEVELOPMENT_CORES, GOVERNMENT_TYPES } from '../core/config.js';
import { randomName, getCountyAdjacency } from '../core/utils.js';

/**Generates the base county-level divisions for the entire map, influenced by geography
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

    // Expansion pass using Dijkstra's algorithm to respect terrain
    const frontier = []; // Priority queue for Dijkstra's
    const costs = new Map();

    capitals.forEach(cap => {
        const tileIndex = cap.y * GRID_WIDTH + cap.x;
        costs.set(tileIndex, 0);
        world.countyGrid[cap.y][cap.x] = cap.id;
        frontier.push({ index: tileIndex, cost: 0 });
    });

    frontier.sort((a, b) => a.cost - b.cost); // Initial sort

    while (frontier.length > 0) {
        const current = frontier.shift(); // Get the lowest cost tile
        const currentX = current.index % GRID_WIDTH;
        const currentY = Math.floor(current.index / GRID_WIDTH);
        const currentTile = world.tiles[current.index];
        const currentCountyId = world.countyGrid[currentY][currentX];

        [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dx, dy]) => {
            const nx = currentX + dx, ny = currentY + dy;
            if (nx >= 0 && nx < GRID_WIDTH && ny >= 0 && ny < GRID_HEIGHT) {
                const neighborIndex = ny * GRID_WIDTH + nx;
                const neighborTile = world.tiles[neighborIndex];
                if (neighborTile.biome.cost >= 1000) return; // Skip water

                // Define expansion costs based on terrain
                let moveCost = 1 + neighborTile.biome.cost;
                if (currentTile.height !== neighborTile.height) moveCost += 5;
                if (currentTile.river && !neighborTile.river) moveCost += 10;

                const newCost = costs.get(current.index) + moveCost;
                if (!costs.has(neighborIndex) || newCost < costs.get(neighborIndex)) {
                    costs.set(neighborIndex, newCost);
                    world.countyGrid[ny][nx] = currentCountyId;
                    frontier.push({ index: neighborIndex, cost: newCost });
                    frontier.sort((a, b) => a.cost - b.cost);
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
        let totalBiomeDev = 0, landTileCount = 0;
        county.tiles.forEach(tileIndex => {
            const tile = world.tiles[tileIndex];
            if (tile.biome.cost < 1000) {
                totalBiomeDev += tile.biome.dev;
                landTileCount++;
            }
        });

        if (landTileCount === 0) { county.development = 0; return; }
        
        const avgTileX = Array.from(county.tiles).reduce((sum, val) => sum + (val % GRID_WIDTH), 0) / county.tiles.size;
        const avgTileY = Array.from(county.tiles).reduce((sum, val) => sum + Math.floor(val / GRID_WIDTH), 0) / county.tiles.size;

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

/**Groups counties into small, duchy-sized polities using terrain-aware expansion
 * @param {object} world The world object
 * @param {function(): number} rand The seeded random function
 * @param {Set<string>} usedNames A set of already used names*/
export function generateBasePolities(world, rand, usedNames) {
    generateCounties(world, rand, usedNames);
    calculateCountyDevelopment(world, rand);

    const countyAdjacency = getCountyAdjacency(world);
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
            vassals: new Set(),
            suzerain: null,
            power: 0,
            government: GOVERNMENT_TYPES.FEUDAL_KINGDOM
        };
        world.polities.set(i, polity);
        world.topLevelPolities.add(i); // All are independent initially
    });

    // Group counties into polities using cost-based expansion
    const costs = new Map();
    const frontier = []; // Priority Queue
    world.counties.forEach(c => costs.set(c.id, Infinity));

    polityCapitals.forEach((capitalCounty, i) => {
        const polityId = i;
        costs.set(capitalCounty.id, 0);
        world.counties.get(capitalCounty.id).polityId = polityId;
        frontier.push({ countyId: capitalCounty.id, cost: 0, id: polityId });
    });

    frontier.sort((a, b) => a.cost - b.cost);

    while (frontier.length > 0) {
        const current = frontier.shift();

        if (countyAdjacency.has(current.countyId)) {
            countyAdjacency.get(current.countyId).forEach(neighborId => {
                const neighborCounty = world.counties.get(neighborId);
                
                let travelCost = 10;
                let avgBiomeCost = 0;
                neighborCounty.tiles.forEach(tileIdx => { avgBiomeCost += world.tiles[tileIdx].biome.cost; });
                travelCost += avgBiomeCost / neighborCounty.tiles.size;

                const newCost = current.cost + travelCost;
                if (newCost < costs.get(neighborId)) {
                    costs.set(neighborId, newCost);
                    neighborCounty.polityId = current.id;
                    frontier.push({ countyId: neighborId, cost: newCost, id: current.id });
                    frontier.sort((a, b) => a.cost - b.cost);
                }
            });
        }
    }

    // Finalize the directCounties set and create the polityGrid for rendering
    world.polityGrid = Array(GRID_HEIGHT).fill(null).map(() => Array(GRID_WIDTH).fill(null));
    world.polities.forEach(p => p.directCounties.clear());
    world.counties.forEach(c => {
        if (c.polityId !== undefined && world.polities.has(c.polityId)) {
            const polity = world.polities.get(c.polityId);
            polity.directCounties.add(c.id);
            // Populate polityGrid for rendering
            c.tiles.forEach(tileIndex => {
                const x = tileIndex % GRID_WIDTH;
                const y = Math.floor(tileIndex / GRID_WIDTH);
                world.polityGrid[y][x] = c.polityId;
            });
        }
    });

    // Calculate polity power
    world.polities.forEach(polity => {
        let totalPower = 0;
        polity.directCounties.forEach(countyId => {
            totalPower += world.counties.get(countyId).development;
        });
        polity.power = totalPower;
    });
}