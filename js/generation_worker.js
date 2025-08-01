/*This script runs in a separate thread as a Web Worker
It acts as the main coordinator for the world generation process,
importing and calling specialized generator modules in sequence*/

import { GRID_WIDTH, GRID_HEIGHT, MIN_NATIONS, MAX_NATIONS, MIN_PROVINCES_PER_NATION, MAX_PROVINCES_PER_NATION, MIN_COUNTIES_PER_PROVINCE, MAX_COUNTIES_PER_PROVINCE } from './core/config.js';
import { createSeededRandom, randomName, findPoleOfInaccessibility } from './core/utils.js';
import { generateTerrain } from './generation/terrainGenerator.js';
import { generatePolitics } from './generation/politicalGenerator.js';
import { generateSociology } from './generation/sociologyGenerator.js';
import { generateDiplomacy } from './generation/diplomacyGenerator.js';
import { colorNations, colorSociology } from './generation/colorGenerator.js';

/**Calculates and stores the best label position for a collection of entities (nations, cultures, etc)
 * @param {Map<number, object> | Array<object>} entities The entities to process
 * @param {function(object): Set<number>} getTilesFn A function that returns the tile indices for a given entity*/

function calculateLabelPositions(entities, getTilesFn) {
    const processEntity = (entity) => {
        const tiles = getTilesFn(entity);
        if (tiles && tiles.size > 5) { // Only calculate for reasonably sized territories
            entity.labelPosition = findPoleOfInaccessibility(tiles, GRID_WIDTH, GRID_HEIGHT);
        } else if (tiles && tiles.size > 0) {
            // Fallback for very small territories - use average position
            let avgX = 0, avgY = 0;
            tiles.forEach(idx => {
                avgX += idx % GRID_WIDTH;
                avgY += Math.floor(idx / GRID_WIDTH);
            });
            entity.labelPosition = { x: Math.round(avgX / tiles.size), y: Math.round(avgY / tiles.size) };
        } else {
             // If there are no tiles, do not assign a label position
             entity.labelPosition = null;
        }
    };

    if (entities instanceof Map) {
        entities.forEach(processEntity);
    } else {
        entities.forEach(processEntity);
    }
}


// Main worker listener
self.onmessage = (e) => {
    if (e.data.type === 'generate') {
        const { seed, width, height } = e.data.payload;

        const rand = createSeededRandom(seed);
        const usedNames = new Set();

        const NATION_COUNT = MIN_NATIONS + Math.floor(rand() * (MAX_NATIONS - MIN_NATIONS + 1));
        const provincesPerNation = MIN_PROVINCES_PER_NATION + Math.floor(rand() * (MAX_PROVINCES_PER_NATION - MIN_PROVINCES_PER_NATION + 1));
        const countiesPerProvince = MIN_COUNTIES_PER_PROVINCE + Math.floor(rand() * (MAX_COUNTIES_PER_PROVINCE - MIN_COUNTIES_PER_PROVINCE + 1));
        const PROVINCE_COUNT = NATION_COUNT * provincesPerNation;
        const COUNTY_COUNT = PROVINCE_COUNT * countiesPerProvince;

        const world = {
            seed: seed,
            tiles: [],
            counties: new Map(),
            provinces: new Map(),
            nations: new Map(),
            cultures: [],
            subCultures: [],
            religions: [],
            countyGrid: Array(height).fill(null).map(() => Array(width).fill(null)),
            provinceGrid: Array(height).fill(null).map(() => Array(width).fill(null)),
            nationGrid: Array(height).fill(null).map(() => Array(width).fill(null)),
            cultureGrid: Array(height).fill(null).map(() => Array(width).fill(null)),
            subCultureGrid: Array(height).fill(null).map(() => Array(width).fill(null)),
            religionGrid: Array(height).fill(null).map(() => Array(width).fill(null)),
        };

        const post = (status) => self.postMessage({ type: 'progress', payload: { status } });

        // Generation Sequence
        post("1. Generating Terrain...");
        generateTerrain(world, rand);

        post("2. Forming Political Entities...");
        generatePolitics(world, rand, usedNames, COUNTY_COUNT, PROVINCE_COUNT, NATION_COUNT);

        post("3. Spreading Cultures & Religions...");
        generateSociology(world, rand, usedNames);
        
        post("4. Simulating Diplomacy...");
        generateDiplomacy(world, rand);

        // Cleanup landless nations AFTER diplomacy is set to prevent ghost references
        post("5. Removing Landless Nations...");
        const nationsToCull = [];
        world.nations.forEach(nation => {
            let landTileCount = 0;
            if (nation.children.size > 0) {
                nation.children.forEach(provinceId => {
                    const province = world.provinces.get(provinceId);
                    if(province) {
                        province.children.forEach(countyId => {
                            const county = world.counties.get(countyId);
                            if(county) {
                                county.tiles.forEach(tileIndex => {
                                    if(world.tiles[tileIndex].biome.cost < 1000) {
                                        landTileCount++;
                                    }
                                });
                            }
                        });
                    }
                });
            }
            if (landTileCount === 0) {
                nationsToCull.push(nation.id);
            }
        });

        nationsToCull.forEach(nationId => {
            world.nations.delete(nationId);
        });
        
        // Purge any remaining references in diplomacy
        world.nations.forEach(nation => {
            nation.allies = new Set([...nation.allies].filter(id => !nationsToCull.includes(id)));
            nation.vassals = new Set([...nation.vassals].filter(id => !nationsToCull.includes(id)));
            nation.atWarWith = new Set([...nation.atWarWith].filter(id => !nationsToCull.includes(id)));
            if (nation.suzerain && nationsToCull.includes(nation.suzerain)) {
                nation.suzerain = null;
            }
        });


        post("6. Calculating Label Positions...");
        calculateLabelPositions(world.nations, (nation) => {
            const nationTiles = new Set();
            nation.children.forEach(provinceId => {
                const province = world.provinces.get(provinceId);
                province.children.forEach(countyId => {
                    world.counties.get(countyId).tiles.forEach(tile => nationTiles.add(tile));
                });
            });
            return nationTiles;
        });
        calculateLabelPositions(world.cultures, (culture) => {
            const cultureTiles = new Set();
            world.counties.forEach(county => {
                if (county.culture === culture.id) {
                    county.tiles.forEach(tile => cultureTiles.add(tile));
                }
            });
            return cultureTiles;
        });
        calculateLabelPositions(world.subCultures, (subCulture) => {
            const subCultureTiles = new Set();
            world.counties.forEach(county => {
                if (county.subCulture === subCulture.id) {
                    county.tiles.forEach(tile => subCultureTiles.add(tile));
                }
            });
            return subCultureTiles;
        });
        calculateLabelPositions(world.religions, (religion) => {
             const religionTiles = new Set();
            world.counties.forEach(county => {
                if (county.religion === religion.id) {
                    county.tiles.forEach(tile => religionTiles.add(tile));
                }
            });
            return religionTiles;
        });


        post("7. Coloring the World...");
        colorNations(world, rand);
        colorSociology(world, rand, 'cultures');
        colorSociology(world, rand, 'religions');
        
        // Finalization
        post("8. Finalizing World Data...");

        world.nations = Array.from(world.nations.entries());
        world.provinces = Array.from(world.provinces.entries());
        world.counties = Array.from(world.counties.entries());

        world.nations.forEach(([id, nation]) => {
            nation.allies = Array.from(nation.allies);
            nation.vassals = Array.from(nation.vassals);
            nation.atWarWith = Array.from(nation.atWarWith);
            nation.children = Array.from(nation.children);
        });
        world.provinces.forEach(([id, province]) => {
            province.children = Array.from(province.children);
        });
        world.counties.forEach(([id, county]) => {
            county.tiles = Array.from(county.tiles);
        });

        self.postMessage({ type: 'complete', payload: { world } });
    }
};
