/*This script runs in a separate thread as a Web Worker
It acts as the main coordinator for the world generation process,
importing and calling specialized generator modules in sequence*/

import { GRID_WIDTH, GRID_HEIGHT } from './core/config.js';
import { createSeededRandom, findPoleOfInaccessibility } from './core/utils.js';
import { generateTerrain } from './generation/terrainGenerator.js';
import { generateBasePolities } from './generation/polityGenerator.js';
import { simulateHistory } from './generation/historyGenerator.js';
import { formRealms } from './generation/realmGenerator.js';
import { generateSociology } from './generation/sociologyGenerator.js';
import { assignRulers } from './generation/rulerGenerator.js';
import { generateDiplomacy } from './generation/diplomacyGenerator.js';
import { colorPolities, colorSociology } from './generation/colorGenerator.js';

/**
 * Rebuilds the polityGrid based on the current, correct county ownership data.
 * This is crucial for keeping the render data in sync with the game state.
 * @param {object} world The world object.
 * @param {number} width The width of the grid.
 * @param {number} height The height of the grid.
 */
function updatePolityGrid(world, width, height) {
    world.polityGrid = Array(height).fill(null).map(() => Array(width).fill(null));
    world.counties.forEach(county => {
        if (county.polityId !== undefined) {
            county.tiles.forEach(tileIndex => {
                const x = tileIndex % width;
                const y = Math.floor(tileIndex / height);
                world.polityGrid[y][x] = county.polityId;
            });
        }
    });
}


/**Calculates and stores the best label position for a collection of entities
 * @param {Map<number, object> | Array<object>} entities The entities to process
 * @param {function(object): Set<number>} getTilesFn A function that returns the tile indices for a given entity*/
function calculateLabelPositions(entities, getTilesFn) {
    entities.forEach(entity => {
        const tiles = getTilesFn(entity);
        if (tiles && tiles.size > 5) {
            entity.labelPosition = findPoleOfInaccessibility(tiles, GRID_WIDTH, GRID_HEIGHT);
        } else if (tiles && tiles.size > 0) {
            let avgX = 0, avgY = 0;
            tiles.forEach(idx => {
                avgX += idx % GRID_WIDTH;
                avgY += Math.floor(idx / GRID_WIDTH);
            });
            entity.labelPosition = { x: Math.round(avgX / tiles.size), y: Math.round(avgY / tiles.size) };
        } else {
             entity.labelPosition = null;
        }
    });
}

// Main worker listener
self.onmessage = (e) => {
    if (e.data.type === 'generate') {
        const { seed, width, height } = e.data.payload;
        const rand = createSeededRandom(seed);
        const usedNames = new Set();

        const world = {
            seed: seed,
            rand: rand,
            tiles: [],
            counties: new Map(),
            polities: new Map(),
            topLevelPolities: new Set(),
            cultures: [],
            subCultures: [],
            religions: [],
            countyGrid: Array(height).fill(null).map(() => Array(width).fill(null)),
            polityGrid: null,
            realmGrid: Array(height).fill(null).map(() => Array(width).fill(null)),
            cultureGrid: Array(height).fill(null).map(() => Array(width).fill(null)),
            subCultureGrid: Array(height).fill(null).map(() => Array(width).fill(null)),
        };

        const post = (status) => self.postMessage({ type: 'progress', payload: { status } });

        // Generation Sequence
        post("1. Generating Terrain...");
        generateTerrain(world, rand);

        post("2. Forming Base Polities...");
        generateBasePolities(world, rand, usedNames);

        post("3. Simulating Ancient Empires...");
        simulateHistory(world, rand, usedNames);

        post("4. Forming Realms...");
        formRealms(world, rand);

        // --- FIX: Synchronize all data after major political changes ---
        post("5. Finalizing Political State...");
        // Recalculate power for all polities to reflect structural changes from realm formation
        world.polities.forEach(polity => {
            let totalPower = 0;
            polity.directCounties.forEach(countyId => {
                totalPower += world.counties.get(countyId).development;
            });
            polity.power = totalPower;
        });
        // Update the polityGrid to reflect the new, correct ownership before any culling occurs
        updatePolityGrid(world, width, height);
        // --- END FIX ---

        post("6. Spreading Cultures & Religions...");
        generateSociology(world, rand, usedNames);
        
        post("7. Appointing Rulers...");
        assignRulers(world, rand, usedNames);

        post("8. Initializing Diplomacy...");
        world.polities.forEach(p => {
            p.allies = new Set();
            p.atWarWith = new Set();
        });

        post("9. Simulating Diplomacy...");
        generateDiplomacy(world, rand);

        post("10. Removing Landless Polities...");
        // This step is now safe because the polityGrid is up-to-date.
        const politiesToCull = [];
        world.polities.forEach(polity => {
            if (polity.directCounties.size === 0 && polity.vassals.size === 0) {
                politiesToCull.push(polity.id);
            }
        });
        politiesToCull.forEach(id => {
            world.polities.delete(id);
            world.topLevelPolities.delete(id);
        });
        world.polities.forEach(p => {
            if (p.suzerain && politiesToCull.includes(p.suzerain)) p.suzerain = null;
            p.vassals = new Set([...p.vassals].filter(id => !politiesToCull.includes(id)));
            p.allies = new Set([...p.allies].filter(id => !politiesToCull.includes(id)));
            p.atWarWith = new Set([...p.atWarWith].filter(id => !politiesToCull.includes(id)));
        });

        // Create grids for border drawing
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const polityId = world.polityGrid[y][x]; // Use the now-correct polityGrid
                if (polityId !== null) {
                    const polity = world.polities.get(polityId);
                    if (polity) { // Safety check
                        let topLevelSuzerain = polity;
                        while (topLevelSuzerain.suzerain !== null) {
                            topLevelSuzerain = world.polities.get(topLevelSuzerain.suzerain);
                        }
                        world.realmGrid[y][x] = topLevelSuzerain.id;
                    }
                     const county = world.counties.get(world.countyGrid[y][x]);
                     if (county.culture !== undefined) world.cultureGrid[y][x] = county.culture;
                     if (county.subCulture !== undefined) world.subCultureGrid[y][x] = county.subCulture;
                }
            }
        }

        post("11. Calculating Label Positions...");
        calculateLabelPositions(world.polities, (polity) => {
            const polityTiles = new Set();
            polity.directCounties.forEach(countyId => {
                world.counties.get(countyId).tiles.forEach(tile => polityTiles.add(tile));
            });
            return polityTiles;
        });
        
        const getTilesByCountyProperty = (entities, property) => {
             const entityTiles = new Map();
             entities.forEach(e => entityTiles.set(e.id, new Set()));
             world.counties.forEach(county => {
                 if (county[property] !== undefined && entityTiles.has(county[property])) {
                     county.tiles.forEach(tileIdx => entityTiles.get(county[property]).add(tileIdx));
                 }
             });
             return entityTiles;
        };
        
        const cultureTiles = getTilesByCountyProperty(world.cultures, 'culture');
        calculateLabelPositions(world.cultures, (c) => cultureTiles.get(c.id));

        const subCultureTiles = getTilesByCountyProperty(world.subCultures, 'subCulture');
        calculateLabelPositions(world.subCultures, (sc) => subCultureTiles.get(sc.id));

        const religionTiles = getTilesByCountyProperty(world.religions, 'religion');
        calculateLabelPositions(world.religions, (r) => religionTiles.get(r.id));

        post("12. Coloring the World...");
        colorPolities(world, rand);
        colorSociology(world, rand, 'cultures');
        colorSociology(world, rand, 'religions');
        
        post("13. Finalizing World Data...");
        world.polities = Array.from(world.polities.entries());
        world.counties = Array.from(world.counties.entries());
        world.topLevelPolities = Array.from(world.topLevelPolities);

        world.polities.forEach(([id, polity]) => {
            polity.directCounties = Array.from(polity.directCounties);
            polity.vassals = Array.from(polity.vassals);
            polity.allies = Array.from(polity.allies);
            polity.atWarWith = Array.from(polity.atWarWith);
            if (polity.opinions) {
                polity.opinions = Array.from(polity.opinions.entries());
            }
        });
        world.counties.forEach(([id, county]) => {
            county.tiles = Array.from(county.tiles);
        });

        delete world.rand; // Remove non-clonable function before sending
        self.postMessage({ type: 'complete', payload: { world } });
    }
};
