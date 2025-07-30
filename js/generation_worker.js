/* This script runs in a separate thread as a Web Worker
It handles the entire computationally intensive world generation process,
sending progress updates and the final world object back to the main thread*/

import {
    GRID_WIDTH, GRID_HEIGHT, MIN_NATIONS, MAX_NATIONS,
    MIN_PROVINCES_PER_NATION, MAX_PROVINCES_PER_NATION,
    MIN_COUNTIES_PER_PROVINCE, MAX_COUNTIES_PER_PROVINCE, BIOMES
} from './core/config.js';

import { createSeededRandom, SimpleNoise, randomName } from './core/utils.js';

let world;
let rand;
let usedNames;
let NATION_COUNT, PROVINCE_COUNT, COUNTY_COUNT;

// generation logic

function getBiome(e, m, t) {
    if (e < 0.20) return BIOMES.DEEP_OCEAN; if (e < 0.40) return BIOMES.OCEAN; if (e < 0.42) return BIOMES.BEACH;
    if (e > 0.85) return BIOMES.SNOW; if (e > 0.70) return BIOMES.MOUNTAIN;
    if (t < 0.2) { if (e > 0.6) return BIOMES.MOUNTAIN; return BIOMES.TUNDRA; }
    if (t < 0.4) { if (m > 0.4) return BIOMES.TAIGA; return BIOMES.GRASSLAND; }
    if (t > 0.75) { if (m > 0.7) return BIOMES.JUNGLE; if (m > 0.5) return BIOMES.FOREST; if (m > 0.2) return BIOMES.SAVANNA; return BIOMES.DESERT; }
    if (m > 0.8 && e < 0.5) return BIOMES.WETLAND; if (m > 0.5) return BIOMES.FOREST; if (m > 0.2) return BIOMES.GRASSLAND;
    return BIOMES.SAVANNA;
}

function generateFractalTerrain(rand) {
    const terrainNoise = SimpleNoise(rand);
    const warpRand = createSeededRandom(world.seed + "_warp");
    const warpNoise = SimpleNoise(warpRand);
    const elevation = new Float32Array(GRID_WIDTH * GRID_HEIGHT);
    const octaves = 6, persistence = 0.5, lacunarity = 2.0, initialFrequency = 2.0;
    const landmassExponent = 1.2;
    const warpFrequency = 3.0;
    const warpStrength = 0.3;
    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            const idx = y * GRID_WIDTH + x;
            let total = 0, frequency = initialFrequency, amplitude = 1, maxAmplitude = 0;
            for (let i = 0; i < octaves; i++) {
                total += terrainNoise(x * frequency / GRID_WIDTH, y * frequency / GRID_HEIGHT) * amplitude;
                maxAmplitude += amplitude;
                amplitude *= persistence;
                frequency *= lacunarity;
            }
            let noiseValue = (total / maxAmplitude + 1) / 2;
            const qx = x / GRID_WIDTH;
            const qy = y / GRID_HEIGHT;
            const warpX = warpNoise(qx * warpFrequency, qy * warpFrequency) * warpStrength;
            const warpY = warpNoise(qy * warpFrequency, qx * warpFrequency) * warpStrength;
            const nx = qx + warpX - 0.5;
            const ny = qy + warpY - 0.5;
            const dist = Math.sqrt(nx * nx + ny * ny) * 2;
            const falloff = Math.max(0, 1 - dist * dist);
            elevation[idx] = Math.pow(noiseValue * falloff, landmassExponent);
        }
    }
    let minE = Infinity, maxE = -Infinity;
    for (const e of elevation) { minE = Math.min(minE, e); maxE = Math.max(maxE, e); }
    for (let i = 0; i < elevation.length; i++) {
        elevation[i] = maxE > minE ? (elevation[i] - minE) / (maxE - minE) : 0;
    }
    world.elevation = elevation;
}

function runHydraulicErosion(rand) {
    const iterations = 75000;
    const { elevation } = world;
    const water = new Float32Array(elevation.length).fill(0);
    const sediment = new Float32Array(elevation.length).fill(0);
    const Kq = 0.1, Kw = 0.05, Kr = 0.008, Ks = 0.01, Kc = 0.1;
    for (let i = 0; i < iterations; i++) {
        const x = Math.floor(rand() * GRID_WIDTH), y = Math.floor(rand() * GRID_HEIGHT);
        const idx = y * GRID_WIDTH + x;
        water[idx] += Kq;
        const neighbors = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
        let totalHeightDiff = 0, outflow = [0,0,0,0,0,0,0,0], h_i = elevation[idx] + water[idx];
        for(let j = 0; j < neighbors.length; j++) {
            const [dx, dy] = neighbors[j];
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < GRID_WIDTH && ny >= 0 && ny < GRID_HEIGHT) {
                const nIdx = ny * GRID_WIDTH + nx, h_n = elevation[nIdx] + water[nIdx], diff = h_i - h_n;
                if(diff > 0) { totalHeightDiff += diff; outflow[j] = diff; }
            }
        }
        if(totalHeightDiff > 0) {
            for(let j = 0; j < neighbors.length; j++) {
                if(outflow[j] > 0) {
                    const [dx, dy] = neighbors[j];
                    const nIdx = (y + dy) * GRID_WIDTH + (x + dx);
                    const flowAmount = Math.min(water[idx], water[idx] * (outflow[j] / totalHeightDiff));
                    const sedimentCapacity = flowAmount * Kc;
                    const sedimentToMove = Math.min(sediment[idx], sedimentCapacity);
                    sediment[idx] -= sedimentToMove; sediment[nIdx] += sedimentToMove;
                    const erosionAmount = Kr * flowAmount;
                    elevation[idx] -= erosionAmount; sediment[idx] += erosionAmount;
                    water[idx] -= flowAmount; water[nIdx] += flowAmount;
                }
            }
        }
        const sedimentCapacity = water[idx] * Kc;
        if(sediment[idx] > sedimentCapacity) {
            const depositAmount = (sediment[idx] - sedimentCapacity) * Ks;
            sediment[idx] -= depositAmount; elevation[idx] += depositAmount;
        }
        water[idx] *= (1 - Kw);
    }
    let minE = Infinity, maxE = -Infinity;
    for(const e of elevation) { minE = Math.min(minE, e); maxE = Math.max(maxE, e); }
    for (let i = 0; i < elevation.length; i++) {
        elevation[i] = maxE > minE ? (elevation[i] - minE) / (maxE - minE) : 0;
    }
    world.water = water;
}

function generateRivers(rand) {
    const { elevation } = world;
    const riverFlow = new Float32Array(elevation.length).fill(0);
    const riverSources = [];
    const numRivers = Math.floor(GRID_WIDTH * GRID_HEIGHT / 500);
    for (let i = 0; i < numRivers * 2 && riverSources.length < numRivers; i++) {
        const x = Math.floor(rand() * GRID_WIDTH);
        const y = Math.floor(rand() * GRID_HEIGHT);
        const idx = y * GRID_WIDTH + x;
        if (elevation[idx] > 0.65) { riverSources.push({ x, y }); }
    }
    for (const source of riverSources) {
        let { x, y } = source;
        let path = [];
        while (true) {
            const idx = y * GRID_WIDTH + x;
            if (elevation[idx] < 0.42) break;
            riverFlow[idx] += 1;
            path.push({x, y});
            const neighbors = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
            let lowestNeighbor = null;
            let minElevation = elevation[idx];
            for (const [dx, dy] of neighbors) {
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && nx < GRID_WIDTH && ny >= 0 && ny < GRID_HEIGHT) {
                    const nIdx = ny * GRID_WIDTH + nx;
                    if (elevation[nIdx] < minElevation) {
                        minElevation = elevation[nIdx];
                        lowestNeighbor = { x: nx, y: ny };
                    }
                }
            }
            if (lowestNeighbor) {
                x = lowestNeighbor.x;
                y = lowestNeighbor.y;
            } else {
                elevation[y * GRID_WIDTH + x] -= 0.01;
                if (path.length > 1) {
                    const prev = path[path.length - 2];
                    x = prev.x; y = prev.y;
                } else { break; }
            }
        }
    }
    world.riverFlow = riverFlow;
}

function assignBiomes(rand) {
    world.tiles = [];
    const { elevation } = world;
    const moisture = new Float32Array(elevation.length).fill(0);
    const moistureNoise = SimpleNoise(createSeededRandom(world.seed + "_moisture"));
    const moistureRadius = 20;
    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            const idx = y * GRID_WIDTH + x;
            const isWaterSource = (elevation[idx] < 0.4) || (world.riverFlow && world.riverFlow[idx] > 0);
            if (isWaterSource) {
                for (let dy = -moistureRadius; dy <= moistureRadius; dy++) {
                    for (let dx = -moistureRadius; dx <= moistureRadius; dx++) {
                        const nx = x + dx, ny = y + dy;
                        if (nx >= 0 && nx < GRID_WIDTH && ny >= 0 && ny < GRID_HEIGHT) {
                            const dist = Math.hypot(dx, dy);
                            if (dist < moistureRadius) {
                                moisture[ny * GRID_WIDTH + nx] += (moistureRadius - dist) / moistureRadius;
                            }
                        }
                    }
                }
            }
            moisture[idx] += moistureNoise(x / 50, y / 50) * 0.3;
        }
    }
    let minM = Infinity, maxM = -Infinity;
    for(const m of moisture) { minM = Math.min(minM, m); maxM = Math.max(maxM, m); }
    for (let i = 0; i < moisture.length; i++) {
        moisture[i] = maxM > minM ? (moisture[i] - minM) / (maxM - minM) : 0;
    }
    world.moisture = moisture;
    const temperature = new Float32Array(elevation.length).fill(0);
    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            const idx = y * GRID_WIDTH + x;
            const latitudeFactor = 1.0 - Math.abs(y - GRID_HEIGHT / 2) / (GRID_HEIGHT / 2);
            const altitudeFactor = 1.0 - (elevation[idx] * 0.7);
            temperature[idx] = latitudeFactor * altitudeFactor;
        }
    }
    let minT = Infinity, maxT = -Infinity;
    for(const t of temperature) { minT = Math.min(minT, t); maxT = Math.max(maxT, t); }
    for (let i = 0; i < temperature.length; i++) {
        temperature[i] = maxT > minT ? (temperature[i] - minT) / (maxT - minT) : 0;
    }
    world.temperature = temperature;
    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            const idx = y * GRID_WIDTH + x;
            const e = elevation[idx];
            const m = moisture[idx];
            const t = temperature[idx];
            let biome = getBiome(e, m, t);
            if (world.riverFlow && world.riverFlow[idx] > 0 && e > 0.42) {
                 biome = BIOMES.RIVER;
            }
            world.tiles.push({ x, y, elevation: e, moisture: m, temperature: t, biome });
        }
    }
}

function generateSubdivisions(level, count, rand, usedNames) {
    const capitals = [], parentLevel = level === 'province' ? 'county' : (level === 'nation' ? 'province' : null);
    const childGrid = level === 'county' ? world.countyGrid : (level === 'province' ? world.provinceGrid : world.nationGrid);
    const map = level === 'county' ? world.counties : (level === 'province' ? world.provinces : world.nations);
    for (let i = 0; i < count; i++) {
        let x, y, tile;
        do {
            x = Math.floor(rand() * GRID_WIDTH); y = Math.floor(rand() * GRID_HEIGHT);
            tile = world.tiles[y * GRID_WIDTH + x];
        } while (tile.biome === BIOMES.OCEAN || tile.biome === BIOMES.DEEP_OCEAN);
        capitals.push({ id: i, x, y });
        map.set(i, { id: i, name: randomName(rand, usedNames), capitalSeed: {x,y}, color: `hsl(${Math.floor(rand() * 360)}, 70%, 50%)`, children: new Set() });
    }
    if (level === 'county') assignTilesToCounties(capitals, childGrid, rand);
    else assignSubdivisionsToParents(level, parentLevel, capitals);
    if (parentLevel) {
        const parentMap = level === 'province' ? world.counties : world.provinces;
        parentMap.forEach(child => { if(map.has(child.parentId)) map.get(child.parentId).children.add(child.id); });
    }
    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            const countyId = world.countyGrid[y][x];
            if (countyId === null) continue;
            const county = world.counties.get(countyId);
            if (level === 'county') childGrid[y][x] = countyId;
            if (level === 'province') { if (county) childGrid[y][x] = county.parentId; }
            if (level === 'nation') {
                if (county && world.provinces.has(county.parentId)) {
                    const province = world.provinces.get(county.parentId);
                    if (province && province.parentId !== undefined) childGrid[y][x] = province.parentId;
                }
            }
        }
    }
}

function assignTilesToCounties(capitals, countyGrid, rand) {
    const costs = Array(GRID_HEIGHT).fill(null).map(() => Array(GRID_WIDTH).fill(Infinity));
    const frontier = [];
    capitals.forEach(cap => {
        costs[cap.y][cap.x] = 0;
        countyGrid[cap.y][cap.x] = cap.id;
        frontier.push({x: cap.x, y: cap.y, cost: 0, seaDistance: 0});
        const county = world.counties.get(cap.id);
        county.tiles = new Set();
        county.development = 0; // Initialize dev
    });

    while (frontier.length > 0) {
        frontier.sort((a, b) => b.cost - a.cost);
        const current = frontier.pop();
        const tileIndex = current.y * GRID_WIDTH + current.x;
        const county = world.counties.get(countyGrid[current.y][current.x]);
        county.tiles.add(tileIndex);
        const neighbors = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        for (const [dx, dy] of neighbors) {
            const nx = current.x + dx, ny = current.y + dy;
            if (nx >= 0 && nx < GRID_WIDTH && ny >= 0 && ny < GRID_HEIGHT) {
                const neighborTile = world.tiles[ny * GRID_WIDTH + nx];
                const newCost = current.cost + neighborTile.biome.cost + (rand() * 2);
                const isNeighborTileWater = neighborTile.biome.cost >= 1000;
                let newSeaDistance = isNeighborTileWater ? (current.seaDistance || 0) + 1 : 0;
                if (newCost < costs[ny][nx] && newSeaDistance <= 4) {
                    costs[ny][nx] = newCost;
                    countyGrid[ny][nx] = countyGrid[current.y][current.x];
                    frontier.push({x: nx, y: ny, cost: newCost, seaDistance: newSeaDistance});
                }
            }
        }
    }

    // After tiles are assigned, calculate development for each county
    const devCores = [];
    const numCores = Math.floor((GRID_WIDTH * GRID_HEIGHT) / 10000); // Scale cores with map size
    for (let i = 0; i < numCores; i++) {
        let x, y;
        do {
            x = Math.floor(rand() * GRID_WIDTH);
            y = Math.floor(rand() * GRID_HEIGHT);
        } while (world.tiles[y * GRID_WIDTH + x].biome.cost >= 1000); // Only on land
        devCores.push({x, y, strength: 2 + rand() * 8 }); // Strength from 2 to 10
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
        const baseDev = 3; // All counties start with a base of 3 dev
        let finalDev = baseDev + (avgBiomeDev * 2) + coreBonus + ((rand() - 0.5) * 2);
        county.development = Math.round(Math.max(1, finalDev));
    });
}


function assignSubdivisionsToParents(level, parentLevel, parentCapitals) {
    const childMap = parentLevel === 'county' ? world.counties : world.provinces;
    childMap.forEach(child => {
        let closestCapital = null, minDistance = Infinity, centerX = 0, centerY = 0, count = 0;
        if (parentLevel === 'county') {
            child.tiles.forEach(tileIndex => { centerX += world.tiles[tileIndex].x; centerY += world.tiles[tileIndex].y; });
            count = child.tiles.size;
        } else {
            child.children.forEach(countyId => {
                const county = world.counties.get(countyId);
                if (county) {
                    centerX += county.capitalSeed.x; 
                    centerY += county.capitalSeed.y;
                }
            });
            count = child.children.size;
        }
        if (count > 0) { centerX /= count; centerY /= count; }
        parentCapitals.forEach(capital => {
            if (!capital) return;
            const d = Math.hypot(capital.x - centerX, capital.y - centerY);
            if (d < minDistance) { minDistance = d; closestCapital = capital; }
        });
        if (closestCapital) child.parentId = closestCapital.id;
    });
}

function calculateNationPowerAndCapitals() {
    world.provinces.forEach(province => {
        let totalDev = 0;
        province.children.forEach(countyId => {
            const county = world.counties.get(countyId);
            if (county) totalDev += county.development;
        });
        province.development = totalDev;
    });
    world.nations.forEach(nation => {
        let totalPower = 0;
        let capitalCounty = null;
        let maxDev = -1;
        nation.children.forEach(provinceId => {
            const province = world.provinces.get(provinceId);
            if(province && province.children) {
                province.children.forEach(countyId => {
                    const county = world.counties.get(countyId);
                    if (county) {
                        totalPower += county.development;
                        if (county.development > maxDev) {
                            maxDev = county.development;
                            capitalCounty = county;
                        }
                    }
                });
            }
        });
        nation.power = totalPower;
        if (capitalCounty && capitalCounty.tiles.size > 0) {
            let capX = 0, capY = 0;
            const landTiles = [];
            capitalCounty.tiles.forEach(tileIndex => {
                const tile = world.tiles[tileIndex];
                capX += tile.x;
                capY += tile.y;
                if (tile.biome.cost < 1000) { // A simple way to check for land
                    landTiles.push(tile);
                }
            });

            // If there are no land tiles, we can't set a capital. Fallback to the seed.
            if (landTiles.length === 0) {
                nation.capital = nation.capitalSeed;
                return;
            }

            const avgX = Math.round(capX / capitalCounty.tiles.size);
            const avgY = Math.round(capY / capitalCounty.tiles.size);

            let finalCapitalTile = world.tiles[avgY * GRID_WIDTH + avgX];
            const finalCapitalCountyId = world.countyGrid[avgY] ? world.countyGrid[avgY][avgX] : null;

            // Check if the calculated average point is invalid (not on land OR not in the correct county)
            if (!finalCapitalTile || finalCapitalCountyId !== capitalCounty.id || finalCapitalTile.biome.cost >= 1000) {
                let closestLandTile = null;
                let minDistance = Infinity;
                // Find the land tile in the county that is closest to the calculated average
                landTiles.forEach(tile => {
                    const distance = Math.hypot(tile.x - avgX, tile.y - avgY);
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestLandTile = tile;
                    }
                });
                finalCapitalTile = closestLandTile;
            }
            
            nation.capital = { x: finalCapitalTile.x, y: finalCapitalTile.y };
        } else {
            nation.capital = nation.capitalSeed;
        }
    });
}

function fixExclaves() {
    world.provinces.forEach(province => {
        if (province.parentId === undefined) return;
        const nation = world.nations.get(province.parentId);
        if (!nation) return;
        let isConnected = false;
        let neighborNationCounts = new Map();
        for (const countyId of province.children) {
            const county = world.counties.get(countyId);
            if(!county) continue;
            for (const tileIndex of county.tiles) {
                const x = tileIndex % GRID_WIDTH;
                const y = Math.floor(tileIndex / GRID_WIDTH);
                const neighbors = [[0, 1], [0, -1], [1, 0], [-1, 0]];
                for (const [dx, dy] of neighbors) {
                    const nx = x + dx, ny = y + dy;
                    if (nx >= 0 && nx < GRID_WIDTH && ny >= 0 && ny < GRID_HEIGHT) {
                        const neighborProvinceId = world.provinceGrid[ny][nx];
                        if (neighborProvinceId === province.id) continue;
                        const neighborProvince = world.provinces.get(neighborProvinceId);
                        if (neighborProvince && neighborProvince.parentId !== undefined) {
                            if (neighborProvince.parentId === province.parentId) {
                                isConnected = true;
                            }
                            neighborNationCounts.set(neighborProvince.parentId, (neighborNationCounts.get(neighborProvince.parentId) || 0) + 1);
                        }
                    }
                }
                if (isConnected) break;
            }
            if (isConnected) break;
        }
        if (!isConnected && neighborNationCounts.size > 0) {
            let maxCount = 0;
            let newParentId = -1;
            for (const [nationId, count] of neighborNationCounts.entries()) {
                if (count > maxCount) {
                    maxCount = count;
                    newParentId = nationId;
                }
            }
            if (newParentId !== -1) {
                const oldParent = world.nations.get(province.parentId);
                const newParent = world.nations.get(newParentId);
                if (oldParent && newParent) {
                    oldParent.children.delete(province.id);
                    newParent.children.add(province.id);
                    province.parentId = newParentId;
                    for (const countyId of province.children) {
                        const county = world.counties.get(countyId);
                        if(county) {
                           for (const tileIndex of county.tiles) {
                                const x = tileIndex % GRID_WIDTH;
                                const y = Math.floor(tileIndex / GRID_WIDTH);
                                world.nationGrid[y][x] = newParentId;
                            }
                        }
                    }
                }
            }
        }
    });
}

function buildNationAdjacencyGraph() {
    world.nationAdjacency = new Map();
    world.nations.forEach(nation => {
        world.nationAdjacency.set(nation.id, new Set());
    });
    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            const nationId = world.nationGrid[y][x];
            if (nationId === null || !world.nations.has(nationId)) continue;
            [[1,0],[0,1]].forEach(([dx,dy]) => {
                const nx = x + dx, ny = y + dy;
                if (nx < GRID_WIDTH && ny < GRID_HEIGHT) {
                    const neighborId = world.nationGrid[ny][nx];
                    if (neighborId !== null && world.nations.has(neighborId) && nationId !== neighborId) {
                        world.nationAdjacency.get(nationId).add(neighborId);
                        world.nationAdjacency.get(neighborId).add(nationId);
                    }
                }
            });
        }
    }
}

function generateDiplomacy(rand) {
    const nations = world.nations;
    nations.forEach(n => {
        n.allies = new Set(); n.vassals = new Set();
        n.atWarWith = new Set(); n.suzerain = null; n.allianceId = null;
    });
    const sortedNations = Array.from(nations.values()).sort((a,b) => b.power - a.power);
    const greatPowers = sortedNations.slice(0, 3);
    greatPowers.forEach(gp => {
        if (rand() > 0.6) return;
        sortedNations.forEach(target => {
            if (gp.id !== target.id && target.suzerain === null && !greatPowers.find(p => p.id === target.id)) {
                const powerRatio = gp.power / target.power;
                let vassalChance = 0;
                if (powerRatio > 3.0) {
                    vassalChance = 0.1; 
                    if (world.nationAdjacency.get(gp.id).has(target.id)) {
                        vassalChance = 0.7;
                    }
                }
                if (rand() < vassalChance) {
                    gp.vassals.add(target.id);
                    target.suzerain = gp.id;
                }
            }
        });
    });
    const unalignedNations = new Set(Array.from(nations.values()).filter(n => n.suzerain === null && n.allianceId === null).map(n => n.id));
    const allianceLeaders = [];
    let allianceCounter = 0;
    while(unalignedNations.size > 2 && allianceCounter < 4) {
        const sortedUnaligned = Array.from(unalignedNations).map(id => nations.get(id)).sort((a,b) => b.power - a.power);
        if (sortedUnaligned.length === 0) break;
        const leader = sortedUnaligned[0];
        allianceLeaders.push(leader.id);
        const allianceId = allianceCounter++;
        const allianceMembers = new Set();
        const q = [leader.id];
        while(q.length > 0) {
            const currentId = q.shift();
            if (unalignedNations.has(currentId)) {
                allianceMembers.add(currentId);
                nations.get(currentId).allianceId = allianceId;
                unalignedNations.delete(currentId);
                world.nationAdjacency.get(currentId).forEach(neighborId => {
                    if (unalignedNations.has(neighborId) && rand() > 0.5) {
                        q.push(neighborId);
                    }
                });
            }
        }
        allianceMembers.forEach(m1 => {
            allianceMembers.forEach(m2 => {
                if (m1 !== m2) nations.get(m1).allies.add(m2);
            });
        });
    }
    if (allianceLeaders.length >= 2 && rand() > 0.6) {
        const alliance1Id = nations.get(allianceLeaders[0]).allianceId;
        const alliance2Id = nations.get(allianceLeaders[1]).allianceId;
        nations.forEach(n1 => {
            const n1Alliance = n1.allianceId !== null ? n1.allianceId : (n1.suzerain ? nations.get(n1.suzerain).allianceId : null);
            nations.forEach(n2 => {
                const n2Alliance = n2.allianceId !== null ? n2.allianceId : (n2.suzerain ? nations.get(n2.suzerain).allianceId : null);
                if (n1Alliance === alliance1Id && n2Alliance === alliance2Id) {
                    n1.atWarWith.add(n2.id); n2.atWarWith.add(n1.id);
                }
            });
        });
    }
    nations.forEach(n1 => {
        world.nationAdjacency.get(n1.id).forEach(n2Id => {
            const n2 = nations.get(n2Id);
            if (n1.id < n2.id && n1.allianceId !== n2.allianceId && !n1.atWarWith.has(n2.id) && rand() > 0.9) {
                n1.atWarWith.add(n2.id); n2.atWarWith.add(n1.id);
            }
        });
    });
}

function colorNations(rand) {
    const colors = [];
    let hue = rand() * 360;
    for (let i = 0; i < NATION_COUNT * 2; i++) {
        colors.push(`hsl(${Math.floor(hue)}, 70%, 50%)`);
        hue = (hue + 137.5) % 360;
    }
    const colorAssignments = new Map();
    const sortedNationIds = Array.from(world.nations.keys()).sort((a, b) => {
        const adjA = world.nationAdjacency.get(a) ? world.nationAdjacency.get(a).size : 0;
        const adjB = world.nationAdjacency.get(b) ? world.nationAdjacency.get(b).size : 0;
        return adjB - adjA;
    });
    for (const nationId of sortedNationIds) {
        const nation = world.nations.get(nationId);
        const neighborColors = new Set();
        world.nationAdjacency.get(nationId).forEach(neighborId => {
            if (colorAssignments.has(neighborId)) {
                neighborColors.add(colorAssignments.get(neighborId));
            }
        });
        let assignedColor = null;
        for (let i = 0; i < colors.length; i++) {
            const candidateColor = colors[i];
            if (!neighborColors.has(candidateColor)) {
                assignedColor = candidateColor;
                break;
            }
        }
        if (assignedColor === null) { 
            assignedColor = `hsl(${Math.floor(rand() * 360)}, 70%, 50%)`;
        }
        colorAssignments.set(nationId, assignedColor);
        nation.color = assignedColor;
        if (nation.suzerain !== null) {
            nation.color = nation.color.replace("70%", "40%").replace("50%", "40%");
        }
        nation.defaultColor = nation.color;
    }
}

function colorSociology(rand, sociologyType, grid) {
    const items = world[sociologyType];
    if (!items || items.length === 0) return;

    // Build an adjacency graph to know which groups border each other
    const adjacency = new Map();
    items.forEach(item => adjacency.set(item.id, new Set()));

    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            const currentId = grid[y][x];
            if (currentId === null) continue;
            
            // Check right and down neighbors
            [[1, 0], [0, 1]].forEach(([dx, dy]) => {
                const nx = x + dx, ny = y + dy;
                if (nx < GRID_WIDTH && ny < GRID_HEIGHT) {
                    const neighborId = grid[ny][nx];
                    if (neighborId !== null && currentId !== neighborId) {
                        adjacency.get(currentId)?.add(neighborId);
                        adjacency.get(neighborId)?.add(currentId);
                    }
                }
            });
        }
    }

    // Generate a spread of contrasting colors
    const colors = [];
    let hue = rand() * 360;
    for (let i = 0; i < items.length * 2; i++) {
        colors.push(`hsl(${Math.floor(hue)}, 70%, 65%)`);
        hue = (hue + 137.5) % 360; // Use the golden angle for good color distribution
    }

    // Assign colors, ensuring neighbors get different ones
    const colorAssignments = new Map();
    const sortedItems = items.sort((a, b) => (adjacency.get(b.id)?.size || 0) - (adjacency.get(a.id)?.size || 0));
    
    for (const item of sortedItems) {
        const neighborColors = new Set();
        adjacency.get(item.id)?.forEach(neighborId => {
            if (colorAssignments.has(neighborId)) {
                neighborColors.add(colorAssignments.get(neighborId));
            }
        });

        let assignedColor = colors.find(c => !neighborColors.has(c));
        if (!assignedColor) { // Fallback just in case
            assignedColor = `hsl(${Math.floor(rand() * 360)}, 70%, 65%)`;
        }
        
        colorAssignments.set(item.id, assignedColor);
        item.color = assignedColor;
    }
}

function generateSociology(rand, usedNames) {
    // Establish Culture Hearths and assign a culture to every county
    const cultureHearths = [];
    const numCultures = 15 + Math.floor(rand() * 10);
    world.cultures = [];
    for (let i = 0; i < numCultures; i++) {
        let hearthTile;
        do { hearthTile = world.tiles[Math.floor(rand() * world.tiles.length)]; } while (hearthTile.biome.cost >= 1000);
        cultureHearths.push({ x: hearthTile.x, y: hearthTile.y, id: i });
        world.cultures.push({ id: i, name: randomName(rand, usedNames), color: '' });
    }

    world.counties.forEach(county => {
        if (county.tiles.size === 0) return;
        let centerX = 0, centerY = 0;
        county.tiles.forEach(idx => { centerX += world.tiles[idx].x; centerY += world.tiles[idx].y; });
        centerX /= county.tiles.size; centerY /= county.tiles.size;

        let closest = cultureHearths.reduce((a, b) => Math.hypot(centerX - a.x, centerY - a.y) < Math.hypot(centerX - b.x, centerY - b.y) ? a : b);
        county.culture = closest.id;
    });

    // Establish Religions based on the most dominant cultures and county development
    const cultureCountyCount = new Map();
    world.counties.forEach(c => c.culture !== undefined && cultureCountyCount.set(c.culture, (cultureCountyCount.get(c.culture) || 0) + 1));
    const majorCultureIds = [...cultureCountyCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);

    world.religions = [{ id: 0, name: "Folk Religion", color: '' }]; // ID 0 is now "Folk Religion"
    const religionHearths = [];
    let nextReligionId = 1;

    majorCultureIds.forEach(cultureId => {
        const bestCounty = [...world.counties.values()].filter(c => c.culture === cultureId).sort((a, b) => b.development - a.development)[0];
        if (bestCounty) {
            religionHearths.push({ id: nextReligionId, countyId: bestCounty.id });
            world.religions.push({ id: nextReligionId, name: `The Way of ${randomName(rand, usedNames)}`, color: '' });
            nextReligionId++;
        }
    });

    // Assign a religion to each county with resistance factors
    world.counties.forEach(county => {
        if (county.tiles.size === 0 || county.culture === undefined) return;
        const countyCapital = county.capitalSeed;
        let bestReligion = { id: 0, score: 50 }; // Base score to stay Pagan/Folk

        religionHearths.forEach(hearth => {
            const hearthCapital = world.counties.get(hearth.countyId).capitalSeed;
            const distance = Math.hypot(countyCapital.x - hearthCapital.x, countyCapital.y - hearthCapital.y);
            
            // Conversion is less effective over long distances
            let score = 100 - (distance / (GRID_WIDTH / 3) * 100);

            // Terrain and low development provide "conversion resistance"
            const avgBiomeCost = [...county.tiles].reduce((sum, id) => sum + world.tiles[id].biome.cost, 0) / county.tiles.size;
            if (avgBiomeCost > 10) score -= 20; // Mountains/Jungle resist conversion
            if (county.development < 5) score -= 15; // Low dev areas are more traditional

            if (score > bestReligion.score) {
                bestReligion = { id: hearth.id, score: score };
            }
        });
        county.religion = bestReligion.id;
    });

    // Populate the visual grids based on the final county data
    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            const countyId = world.countyGrid[y][x];
            if (countyId !== null) {
                const county = world.counties.get(countyId);
                if (county) {
                    world.cultureGrid[y][x] = county.culture;
                    world.religionGrid[y][x] = county.religion;
                }
            }
        }
    }

    // Assign culture/religion to nation capitals for the info panel
    world.nations.forEach(nation => {
        if (nation.capital) {
            const capCountyId = world.countyGrid[nation.capital.y][nation.capital.x];
            if (capCountyId !== null) {
                const capCounty = world.counties.get(capCountyId);
                if(capCounty) {
                    nation.culture = capCounty.culture;
                    nation.religion = capCounty.religion;
                }
            }
        }
    });
}


// Main worker listener
self.onmessage = (e) => {
    if (e.data.type === 'generate') {
        const { seed, width, height } = e.data.payload;

        rand = createSeededRandom(seed);
        usedNames = new Set();

        NATION_COUNT = MIN_NATIONS + Math.floor(rand() * (MAX_NATIONS - MIN_NATIONS + 1));
        const provincesPerNation = MIN_PROVINCES_PER_NATION + Math.floor(rand() * (MAX_PROVINCES_PER_NATION - MIN_PROVINCES_PER_NATION + 1));
        const countiesPerProvince = MIN_COUNTIES_PER_PROVINCE + Math.floor(rand() * (MAX_COUNTIES_PER_PROVINCE - MIN_COUNTIES_PER_PROVINCE + 1));
        PROVINCE_COUNT = NATION_COUNT * provincesPerNation;
        COUNTY_COUNT = PROVINCE_COUNT * countiesPerProvince;

        world = {
            seed: seed, tiles: [], counties: new Map(), provinces: new Map(), nations: new Map(),
            countyGrid: Array(height).fill(null).map(() => Array(width).fill(null)),
            provinceGrid: Array(height).fill(null).map(() => Array(width).fill(null)),
            nationGrid: Array(height).fill(null).map(() => Array(width).fill(null)),
            cultureGrid: Array(height).fill(null).map(() => Array(width).fill(null)),
            religionGrid: Array(height).fill(null).map(() => Array(width).fill(null)),
        };

        const post = (status) => self.postMessage({ type: 'progress', payload: { status } });

        post("1. Generating Terrain...");
        generateFractalTerrain(rand);
        
        post("2. Simulating Erosion...");
        runHydraulicErosion(rand);
        
        post("3. Carving Rivers...");
        generateRivers(rand);
        
        post("4. Assigning Biomes...");
        assignBiomes(rand);
        
        post("5. Forming Counties...");
        generateSubdivisions('county', COUNTY_COUNT, rand, usedNames);
        
        post("6. Spreading Cultures & Religions...");
        generateSociology(rand, usedNames);
        
        post("7. Forming Provinces...");
        generateSubdivisions('province', PROVINCE_COUNT, rand, usedNames);
        
        post("8. Forming Nations...");
        generateSubdivisions('nation', NATION_COUNT, rand, usedNames);
        
        post("9. Calculating Power...");
        calculateNationPowerAndCapitals();
        
        post("10. Fixing Exclaves...");
        fixExclaves();

        post("11. Removing Landless Nation..");
        const landlessNations = [];
        world.nations.forEach(nation => {
            if (nation.children.size === 0) {
                landlessNations.push(nation.id);
            }
        });
        landlessNations.forEach(nationId => {
            world.nations.delete(nationId);
        });

        post("12. Building Adjacency Graph...");
        buildNationAdjacencyGraph();
        
        post("13. Simulating Diplomacy...");
        generateDiplomacy(rand);
        
        post("14. Coloring Nations...");
        colorNations(rand);
        
        post("15. Coloring Cultures...");
        colorSociology(rand, 'cultures', world.cultureGrid);
        
        post("16. Coloring Religions...");
        colorSociology(rand, 'religions', world.religionGrid);


        // Convert Maps and Sets to Arrays for safe cloning
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