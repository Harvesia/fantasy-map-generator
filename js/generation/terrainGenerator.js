import { GRID_WIDTH, GRID_HEIGHT, BIOMES } from '../core/config.js';
import { createSeededRandom, SimpleNoise } from '../core/utils.js';

function getBiome(e, m, t) {
    if (e < 0.20) return BIOMES.DEEP_OCEAN; if (e < 0.40) return BIOMES.OCEAN; if (e < 0.42) return BIOMES.BEACH;
    if (e > 0.85) return BIOMES.SNOW; if (e > 0.70) return BIOMES.MOUNTAIN;
    if (t < 0.2) { if (e > 0.6) return BIOMES.MOUNTAIN; return BIOMES.TUNDRA; }
    if (t < 0.4) { if (m > 0.4) return BIOMES.TAIGA; return BIOMES.GRASSLAND; }
    if (t > 0.75) { if (m > 0.7) return BIOMES.JUNGLE; if (m > 0.5) return BIOMES.FOREST; if (m > 0.2) return BIOMES.SAVANNA; return BIOMES.DESERT; }
    if (m > 0.8 && e < 0.5) return BIOMES.WETLAND; if (m > 0.5) return BIOMES.FOREST; if (m > 0.2) return BIOMES.GRASSLAND;
    return BIOMES.SAVANNA;
}

function generateFractalTerrain(world, rand) {
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

function runHydraulicErosion(world, rand) {
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

function generateRivers(world, rand) {
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

function assignBiomes(world, rand) {
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

export function generateTerrain(world, rand) {
    generateFractalTerrain(world, rand);
    runHydraulicErosion(world, rand);
    generateRivers(world, rand);
    assignBiomes(world, rand);
}
