    function createSeededRandom(seed) {
        let x = 0;
        for (let i = 0; i < seed.length; i++) {
            x += seed.charCodeAt(i) * Math.pow(10, i % 10);
        }
        return () => {
            x = Math.sin(x) * 10000;
            return x - Math.floor(x);
        };
    }

    function SimpleNoise(rand) {
        const p = Array.from({length: 256}, (_, i) => i);
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [p[i], p[j]] = [p[j], p[i]];
        }
        const perm = p.concat(p);
        function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
        function lerp(t, a, b) { return a + t * (b - a); }
        function grad(hash, x, y) {
            const h = hash & 7;
            const u = h < 4 ? x : y;
            const v = h < 4 ? y : x;
            return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
        }
        return function(x, y) {
            const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
            x -= Math.floor(x); y -= Math.floor(y);
            const u = fade(x), v = fade(y);
            const aa = perm[X] + Y, ab = perm[X] + Y + 1, ba = perm[X + 1] + Y, bb = perm[X + 1] + Y + 1;
            return lerp(v, lerp(u, grad(perm[aa], x, y), grad(perm[ba], x - 1, y)), lerp(u, grad(perm[ab], x, y - 1), grad(perm[bb], x - 1, y - 1)));
        };
    }

    const canvas = document.getElementById("map");
    const ctx = canvas.getContext("2d");
    const loadingStatus = document.getElementById("loadingStatus");

    const TILE_SIZE = 4;
    const GRID_WIDTH = canvas.width / TILE_SIZE;
    const GRID_HEIGHT = canvas.height / TILE_SIZE;
    const NATION_COUNT = 20;
    const PROVINCE_COUNT = NATION_COUNT * 4;
    const COUNTY_COUNT = PROVINCE_COUNT * 5;

    let world = {};
    let selectedNationId = null;
    let selectedProvinceId = null;
    let selectedCountyId = null;
    let selectionLevel = 0;
    let currentMapMode = 'political';

    const BIOMES = {
        DEEP_OCEAN: { name: "Deep Ocean", color: "#002244", cost: 1000, dev: 0 },
        OCEAN: { name: "Ocean", color: "#003366", cost: 1000, dev: 0 },
        RIVER: { name: "River", color: "#3498db", cost: 10, dev: 2 },
        BEACH: { name: "Beach", color: "#d9c28d", cost: 2, dev: 3 },
        GRASSLAND: { name: "Grassland", color: "#55aa55", cost: 1, dev: 1 },
        FOREST: { name: "Forest", color: "#228833", cost: 5, dev: 1 },
        DESERT: { name: "Desert", color: "#c2b280", cost: 3, dev: 0 },
        MOUNTAIN: { name: "Mountain", color: "#888888", cost: 20, dev: -1 },
        SNOW: { name: "Snowy Peak", color: "#ffffff", cost: 30, dev: -2 }
    };

    const CULTURES = [
        { name: 'Eldoric', color: '#4e79a7' }, { name: 'Pyrean', color: '#f28e2c' },
        { name: 'Aethel', color: '#e15759' }, { name: 'Valerock', color: '#76b7b2' },
        { name: 'Kharzidi', color: '#59a14f' }, { name: 'Silvanesti', color: '#edc949' }
    ];

    const RELIGIONS = [
        { name: 'Sun Worship', color: '#ff9d9a' }, { name: 'Ancestral Spirits', color: '#79706e' },
        { name: 'Archon Faith', color: '#bab0ab' }, { name: 'Old Gods', color: '#b07aa1' }
    ];

    function getBiome(e, m) {
        if (e < 0.2) return BIOMES.DEEP_OCEAN;
        if (e < 0.4) return BIOMES.OCEAN;
        if (e < 0.42) return BIOMES.BEACH;
        if (e > 0.8) return m > 0.3 ? BIOMES.SNOW : BIOMES.MOUNTAIN;
        if (e > 0.65) return BIOMES.MOUNTAIN;
        if (m < 0.25) return BIOMES.DESERT;
        if (m < 0.6) return BIOMES.GRASSLAND;
        return BIOMES.FOREST;
    }

    function randomName(rand) {
        const syllables = ["al", "dor", "ven", "kar", "shi", "lem", "zor", "uth", "na", "eir", "ril", "os", "gan", "bel", "cyr"];
        const n = 2 + Math.floor(rand() * 2);
        return Array(n).fill(0).map(() => syllables[Math.floor(rand() * syllables.length)]).join('').replace(/^\w/, c => c.toUpperCase());
    }

    async function generateAndRenderWorld() {
        document.getElementById("generateButton").disabled = true;
        resetSelection();
        setMapMode('political', false);
        
        let seed = document.getElementById("seedInput").value;
        if (!seed) {
            seed = Math.random().toString(36).substring(2, 15);
            document.getElementById("seedInput").value = seed;
        }
        const rand = createSeededRandom(seed);
        
        world = {
            seed: seed, tiles: [], counties: new Map(), provinces: new Map(), nations: new Map(),
            countyGrid: Array(GRID_HEIGHT).fill(null).map(() => Array(GRID_WIDTH).fill(null)),
            provinceGrid: Array(GRID_HEIGHT).fill(null).map(() => Array(GRID_WIDTH).fill(null)),
            nationGrid: Array(GRID_HEIGHT).fill(null).map(() => Array(GRID_WIDTH).fill(null)),
        };

        const runAsync = (fn, status) => new Promise(resolve => {
            loadingStatus.textContent = status;
            setTimeout(() => { fn(); resolve(); }, 20);
        });

        await runAsync(() => generateFractalTerrain(rand), "1. Generating Terrain...");
        await runAsync(() => runHydraulicErosion(rand), "2. Simulating Erosion...");
        await runAsync(() => assignBiomes(), "3. Assigning Biomes...");
        await runAsync(() => calculateDevelopment(rand), "4. Calculating Development...");
        await runAsync(() => generateSubdivisions('county', COUNTY_COUNT, rand), "5. Forming Counties...");
        await runAsync(() => generateSubdivisions('province', PROVINCE_COUNT, rand), "6. Forming Provinces...");
        await runAsync(() => generateSubdivisions('nation', NATION_COUNT, rand), "7. Forming Nations...");
        await runAsync(() => calculateNationPowerAndCapitals(), "8. Calculating Power...");
        await runAsync(() => buildNationAdjacencyGraph(), "9. Building Adjacency Graph...");
        await runAsync(() => generateSociology(rand), "10. Spreading Cultures...");
        await runAsync(() => generateDiplomacy(rand), "11. Simulating Diplomacy...");
        await runAsync(() => colorNations(rand), "12. Coloring Nations...");
        await runAsync(() => renderMap(), "13. Rendering Map...");

        loadingStatus.textContent = "Generation Complete!";
        document.getElementById("generateButton").disabled = false;
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

    function assignBiomes() {
        world.tiles = [];
        const moisture = new Float32Array(world.elevation.length).fill(0);
        const moistureRadius = 15;
        for (let y = 0; y < GRID_HEIGHT; y++) {
            for (let x = 0; x < GRID_WIDTH; x++) {
                const idx = y * GRID_WIDTH + x;
                if (world.elevation[idx] < 0.4 || world.water[idx] > 0.05) {
                    for (let dy = -moistureRadius; dy <= moistureRadius; dy++) {
                        for (let dx = -moistureRadius; dx <= moistureRadius; dx++) {
                            const nx = x + dx, ny = y + dy;
                            if (nx >= 0 && nx < GRID_WIDTH && ny >= 0 && ny < GRID_HEIGHT) {
                                const dist = Math.hypot(dx, dy);
                                if (dist < moistureRadius) {
                                    moisture[ny * GRID_WIDTH + nx] += (moistureRadius - dist) / moistureRadius * 0.1;
                                }
                            }
                        }
                    }
                }
            }
        }
        let minM = Infinity, maxM = -Infinity;
        for(const m of moisture) { minM = Math.min(minM, m); maxM = Math.max(maxM, m); }
        for (let y = 0; y < GRID_HEIGHT; y++) {
            for (let x = 0; x < GRID_WIDTH; x++) {
                const idx = y * GRID_WIDTH + x;
                const e = world.elevation[idx];
                const m = maxM > minM ? (moisture[idx] - minM) / (maxM - minM) : 0;
                let biome = getBiome(e, m);
                if (world.water[idx] > 0.2 && e > 0.4) biome = BIOMES.RIVER;
                world.tiles.push({ x, y, elevation: e, moisture: m, biome });
            }
        }
    }

    function calculateDevelopment(rand) {
        const devCores = [];
        const numCores = 6;
        for (let i = 0; i < numCores; i++) {
            let x, y, tile;
            do {
                x = Math.floor(rand() * GRID_WIDTH);
                y = Math.floor(rand() * GRID_HEIGHT);
                tile = world.tiles[y * GRID_WIDTH + x];
            } while (tile.biome === BIOMES.OCEAN || tile.biome === BIOMES.DEEP_OCEAN || tile.biome === BIOMES.MOUNTAIN || tile.biome === BIOMES.SNOW);
            devCores.push({x, y, strength: 1 + rand() * 4});
        }

        world.development = new Float32Array(world.tiles.length);
        for (let i = 0; i < world.tiles.length; i++) {
            const tile = world.tiles[i];
            let coreBonus = 0;
            for (const core of devCores) {
                const dist = Math.hypot(tile.x - core.x, tile.y - core.y);
                if (dist < GRID_WIDTH / 5) {
                    coreBonus += (1 - (dist / (GRID_WIDTH / 5))) * core.strength;
                }
            }
            const dev = Math.max(1, (1 + tile.biome.dev + coreBonus) / 2);
            world.development[i] = dev;
        }
    }

    function generateSubdivisions(level, count, rand) {
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
            map.set(i, { id: i, name: randomName(rand), capitalSeed: {x,y}, color: `hsl(${Math.floor(rand() * 360)}, 70%, 50%)`, children: new Set() });
        }
        if (level === 'county') assignTilesToCounties(capitals, childGrid);
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
                if (level === 'province') childGrid[y][x] = county.parentId;
                if (level === 'nation') {
                    const province = world.provinces.get(county.parentId);
                    if(province && province.parentId !== undefined) childGrid[y][x] = province.parentId;
                }
            }
        }
    }

    function assignTilesToCounties(capitals, countyGrid) {
        const costs = Array(GRID_HEIGHT).fill(null).map(() => Array(GRID_WIDTH).fill(Infinity));
        const frontier = [];
        capitals.forEach(cap => {
            costs[cap.y][cap.x] = 0; countyGrid[cap.y][cap.x] = cap.id;
            frontier.push({x: cap.x, y: cap.y, cost: 0});
            const county = world.counties.get(cap.id);
            county.tiles = new Set();
            county.development = 0;
        });
        while (frontier.length > 0) {
            frontier.sort((a, b) => b.cost - a.cost);
            const current = frontier.pop();
            const tileIndex = current.y * GRID_WIDTH + current.x;
            const county = world.counties.get(countyGrid[current.y][current.x]);
            county.tiles.add(tileIndex);
            county.development += world.development[tileIndex];

            const neighbors = [[0, 1], [0, -1], [1, 0], [-1, 0]];
            for (const [dx, dy] of neighbors) {
                const nx = current.x + dx, ny = current.y + dy;
                if (nx >= 0 && nx < GRID_WIDTH && ny >= 0 && ny < GRID_HEIGHT) {
                    const tile = world.tiles[ny * GRID_WIDTH + nx];
                    const newCost = current.cost + tile.biome.cost + (Math.random() * 2);
                    if (newCost < costs[ny][nx]) {
                        costs[ny][nx] = newCost; countyGrid[ny][nx] = countyGrid[current.y][current.x];
                        frontier.push({x: nx, y: ny, cost: newCost});
                    }
                }
            }
        }
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
        const landlessNations = [];
        world.nations.forEach(nation => {
            if (nation.children.size === 0) {
                landlessNations.push(nation.id);
            }
        });
        landlessNations.forEach(nationId => {
            world.nations.delete(nationId);
        });

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

            if (capitalCounty) {
                let capX = 0, capY = 0;
                let tileCount = 0;
                let landTiles = [];
                capitalCounty.tiles.forEach(tileIndex => {
                    const tile = world.tiles[tileIndex];
                    capX += tile.x;
                    capY += tile.y;
                    tileCount++;
                    if (tile.biome !== BIOMES.OCEAN && tile.biome !== BIOMES.DEEP_OCEAN) {
                        landTiles.push(tile);
                    }
                });
                const avgX = Math.round(capX / tileCount);
                const avgY = Math.round(capY / tileCount);

                const avgTile = world.tiles[avgY * GRID_WIDTH + avgX];
                if (avgTile && (avgTile.biome === BIOMES.OCEAN || avgTile.biome === BIOMES.DEEP_OCEAN)) {
                    let closestLandTile = null;
                    let min_d = Infinity;
                    landTiles.forEach(tile => {
                        const d = Math.hypot(tile.x - avgX, tile.y - avgY);
                        if (d < min_d) {
                            min_d = d;
                            closestLandTile = tile;
                        }
                    });
                    nation.capital = closestLandTile ? { x: closestLandTile.x, y: closestLandTile.y } : nation.capitalSeed;
                } else {
                    nation.capital = { x: avgX, y: avgY };
                }
            } else {
                nation.capital = nation.capitalSeed;
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

    function generateSociology(rand) {
        const cultureCenters = [];
        for (let i = 0; i < CULTURES.length; i++) {
            let x, y, tile;
            do {
                x = Math.floor(rand() * GRID_WIDTH); y = Math.floor(rand() * GRID_HEIGHT);
                tile = world.tiles[y * GRID_WIDTH + x];
            } while (tile.biome === BIOMES.OCEAN || tile.biome === BIOMES.DEEP_OCEAN);
            cultureCenters.push({x, y, id: i});
        }

        const religionCenters = [];
        for (let i = 0; i < RELIGIONS.length; i++) {
            let x, y, tile;
            do {
                x = Math.floor(rand() * GRID_WIDTH); y = Math.floor(rand() * GRID_HEIGHT);
                tile = world.tiles[y * GRID_WIDTH + x];
            } while (tile.biome === BIOMES.OCEAN || tile.biome === BIOMES.DEEP_OCEAN);
            religionCenters.push({x, y, id: i});
        }

        world.nations.forEach(nation => {
            const cap = nation.capital;
            let closestCulture = -1, minDistCulture = Infinity;
            cultureCenters.forEach(c => {
                const d = Math.hypot(cap.x - c.x, cap.y - c.y);
                if (d < minDistCulture) { minDistCulture = d; closestCulture = c.id; }
            });
            nation.culture = closestCulture;

            let closestReligion = -1, minDistReligion = Infinity;
            religionCenters.forEach(r => {
                const d = Math.hypot(cap.x - r.x, cap.y - r.y);
                if (d < minDistReligion) { minDistReligion = d; closestReligion = r.id; }
            });
            nation.religion = closestReligion;
        });
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
            let colorIndex = 0;
            while(true) {
                const candidateColor = colors[colorIndex % colors.length];
                if (!neighborColors.has(candidateColor)) {
                    assignedColor = candidateColor;
                    break;
                }
                colorIndex++;
                if (colorIndex > colors.length * 2) { 
                    assignedColor = `hsl(${Math.floor(rand() * 360)}, 70%, 50%)`;
                    break;
                }
            }
            
            colorAssignments.set(nationId, assignedColor);
            nation.color = assignedColor;
            
            if (nation.suzerain !== null) {
                nation.color = nation.color.replace("70%", "40%").replace("50%", "40%");
            }
            nation.defaultColor = nation.color;
        }
    }

    function setMapMode(mode, doRender = true) {
        currentMapMode = mode;
        document.querySelectorAll('.map-modes button').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`${mode}Button`).classList.add('active');

        if (mode === 'diplomatic' && selectedNationId === null && world.nations && world.nations.size > 0) {
            selectedNationId = Array.from(world.nations.values()).sort((a,b) => b.power - a.power)[0].id;
        } else if (mode !== 'diplomatic') {
            resetSelection(false);
        }
        
        if (doRender) renderMap();
    }

    function renderMap() {
        if (!world.tiles || world.tiles.length === 0) return;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        for (const tile of world.tiles) {
            ctx.fillStyle = tile.biome.color;
            ctx.fillRect(tile.x * TILE_SIZE, tile.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }

        if (selectionLevel > 0) {
            if (selectionLevel === 1) {
                renderDiplomaticMode();
            } else {
                renderFocusHighlight();
            }
        } else {
            switch (currentMapMode) {
                case 'physical': break;
                case 'political': renderPoliticalMode(); break;
                case 'diplomatic': renderDiplomaticMode(); break;
                case 'development': renderDevelopmentMode(); break;
                case 'culture': renderCultureMode(); break;
                case 'religion': renderReligionMode(); break;
            }
        }
        
        if (currentMapMode !== 'physical' || selectionLevel > 0) {
            drawBorders();
        }

        if ((currentMapMode !== 'physical' && currentMapMode !== 'development' && currentMapMode !== 'culture' && currentMapMode !== 'religion') || selectionLevel > 0) {
            ctx.font = "bold 14px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            world.nations.forEach(nation => {
                if (nation.capital) {
                    ctx.fillStyle = "#FFFFFF";
                    ctx.strokeStyle = "#000000";
                    ctx.lineWidth = 4;
                    const px = nation.capital.x * TILE_SIZE, py = nation.capital.y * TILE_SIZE;
                    ctx.strokeText(nation.name, px, py);
                    ctx.fillText(nation.name, px, py);
                }
            });
        }
    }

    function renderPoliticalMode() {
        ctx.globalAlpha = 0.5;
        for (let y = 0; y < GRID_HEIGHT; y++) {
            for (let x = 0; x < GRID_WIDTH; x++) {
                const nationId = world.nationGrid[y][x];
                if (nationId !== null) {
                    const nation = world.nations.get(nationId);
                    if (nation) ctx.fillStyle = nation.defaultColor;
                    ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                }
            }
        }
        ctx.globalAlpha = 1.0;
        drawDiplomacyLines();
    }

    function renderDiplomaticMode() {
        if (selectedNationId === null) {
            setMapMode('political');
            return;
        }
        
        const selected = world.nations.get(selectedNationId);
        ctx.globalAlpha = 1.0;
        for (let y = 0; y < GRID_HEIGHT; y++) {
            for (let x = 0; x < GRID_WIDTH; x++) {
                const nationId = world.nationGrid[y][x];
                if (nationId !== null) {
                    const nation = world.nations.get(nationId);
                    let color;
                    if (nation.id === selectedNationId) color = nation.defaultColor;
                    else if (selected.allies.has(nation.id)) color = 'rgba(0, 255, 100, 0.7)';
                    else if (selected.vassals.has(nation.id)) color = 'rgba(150, 50, 255, 0.7)';
                    else if (selected.suzerain === nation.id) color = 'rgba(255, 215, 0, 0.7)';
                    else if (selected.atWarWith.has(nation.id)) color = 'rgba(255, 40, 40, 0.7)';
                    else color = 'rgba(128, 128, 128, 0.3)';
                    
                    ctx.fillStyle = color;
                    ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                }
            }
        }
        ctx.globalAlpha = 1.0;
    }

    function renderDevelopmentMode() {
        let maxDev = 0;
        world.counties.forEach(c => maxDev = Math.max(maxDev, c.development));

        ctx.globalAlpha = 0.7;
        world.counties.forEach(county => {
            if (county.development > 0) {
                const normalizedDev = county.development / maxDev;
                const hue = 120 * normalizedDev;
                ctx.fillStyle = `hsl(${hue}, 90%, 50%)`;
                county.tiles.forEach(tileIndex => {
                    const tile = world.tiles[tileIndex];
                    if (tile.biome !== BIOMES.OCEAN && tile.biome !== BIOMES.DEEP_OCEAN) {
                        ctx.fillRect(tile.x * TILE_SIZE, tile.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                    }
                });
            }
        });
        ctx.globalAlpha = 1.0;
    }

    function renderCultureMode() {
        ctx.globalAlpha = 0.7;
        for (let y = 0; y < GRID_HEIGHT; y++) {
            for (let x = 0; x < GRID_WIDTH; x++) {
                const nationId = world.nationGrid[y][x];
                if (nationId !== null) {
                    const nation = world.nations.get(nationId);
                    if (nation) {
                        ctx.fillStyle = CULTURES[nation.culture].color;
                        ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                    }
                }
            }
        }
        ctx.globalAlpha = 1.0;
    }

    function renderReligionMode() {
        ctx.globalAlpha = 0.7;
        for (let y = 0; y < GRID_HEIGHT; y++) {
            for (let x = 0; x < GRID_WIDTH; x++) {
                const nationId = world.nationGrid[y][x];
                if (nationId !== null) {
                    const nation = world.nations.get(nationId);
                    if (nation) {
                        ctx.fillStyle = RELIGIONS[nation.religion].color;
                        ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                    }
                }
            }
        }
        ctx.globalAlpha = 1.0;
    }

    function renderFocusHighlight() {
        ctx.globalAlpha = 0.7;
        const nation = world.nations.get(selectedNationId);
        if (!nation) return;
        const color = nation.defaultColor;

        for (let y = 0; y < GRID_HEIGHT; y++) {
            for (let x = 0; x < GRID_WIDTH; x++) {
                let highlight = false;
                if (selectionLevel === 2 && world.provinceGrid[y][x] === selectedProvinceId) highlight = true;
                else if (selectionLevel === 3 && world.countyGrid[y][x] === selectedCountyId) highlight = true;
                
                if (highlight) {
                    ctx.fillStyle = color;
                    ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                }
            }
        }
        ctx.globalAlpha = 1.0;
    }


    function drawBorders() {
        const styles = { county: { c: "rgba(0,0,0,0.3)", w: 1 }, province: { c: "rgba(0,0,0,0.5)", w: 2 }, nation: { c: "rgba(0,0,0,1.0)", w: 4 } };
        for (let y = 0; y < GRID_HEIGHT; y++) {
            for (let x = 0; x < GRID_WIDTH; x++) {
                const tile = world.tiles[y * GRID_WIDTH + x];
                if (tile.biome === BIOMES.OCEAN || tile.biome === BIOMES.DEEP_OCEAN) continue;
                const cN = world.nationGrid[y][x], cP = world.provinceGrid[y][x], cC = world.countyGrid[y][x];
                [[1,0,'right'],[0,1,'down']].forEach(([dx,dy,dir]) => {
                    if (x + dx < GRID_WIDTH && y + dy < GRID_HEIGHT) {
                        const nN = world.nationGrid[y+dy][x+dx], nP = world.provinceGrid[y+dy][x+dx], nC = world.countyGrid[y+dy][x+dx];
                        if (cN !== nN) drawBorderLine(x,y,dir,styles.nation);
                        else if (cP !== nP) drawBorderLine(x,y,dir,styles.province);
                        else if (cC !== nC) drawBorderLine(x,y,dir,styles.county);
                    }
                });
            }
        }
    }

    function drawBorderLine(x, y, dir, style) {
        ctx.beginPath();
        ctx.strokeStyle = style.c; ctx.lineWidth = style.w;
        const px = x * TILE_SIZE, py = y * TILE_SIZE;
        if (dir === 'right') { ctx.moveTo(px + TILE_SIZE, py); ctx.lineTo(px + TILE_SIZE, py + TILE_SIZE); }
        else { ctx.moveTo(px, py + TILE_SIZE); ctx.lineTo(px + TILE_SIZE, py + TILE_SIZE); }
        ctx.stroke();
    }

    function drawDiplomacyLines() {
        const nations = world.nations;
        const drawnWars = new Set();
        nations.forEach(nation => {
            if (!nation.capital) return;
            nation.vassals.forEach(vassalId => {
                const vassal = nations.get(vassalId);
                if (!vassal.capital) return;
                ctx.beginPath();
                ctx.moveTo(nation.capital.x * TILE_SIZE, nation.capital.y * TILE_SIZE);
                ctx.lineTo(vassal.capital.x * TILE_SIZE, vassal.capital.y * TILE_SIZE);
                ctx.strokeStyle = "#ffd700"; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
                ctx.stroke();
            });
            nation.atWarWith.forEach(enemyId => {
                const warId = [nation.id, enemyId].sort().join('-');
                if (!drawnWars.has(warId)) {
                    const enemy = nations.get(enemyId);
                    if (!enemy.capital) return;
                    ctx.beginPath();
                    ctx.moveTo(nation.capital.x * TILE_SIZE, nation.capital.y * TILE_SIZE);
                    const midX = (nation.capital.x + enemy.capital.x) / 2 * TILE_SIZE + (Math.random() - 0.5) * 50;
                    const midY = (nation.capital.y + enemy.capital.y) / 2 * TILE_SIZE + (Math.random() - 0.5) * 50;
                    ctx.quadraticCurveTo(midX, midY, enemy.capital.x * TILE_SIZE, enemy.capital.y * TILE_SIZE);
                    ctx.strokeStyle = "#ff0000"; ctx.lineWidth = 3; ctx.setLineDash([]);
                    ctx.stroke();
                    drawnWars.add(warId);
                }
            });
        });
        ctx.setLineDash([]);
    }

    function resetSelection(doRender = true) {
        selectionLevel = 0;
        selectedNationId = null;
        selectedProvinceId = null;
        selectedCountyId = null;
        if (doRender) renderMap();
    }

    function toggleControls() {
        const controls = document.getElementById('controls');
        const button = document.getElementById('minimizeButton');
        controls.classList.toggle('minimized');
        button.textContent = controls.classList.contains('minimized') ? '+' : '-';
    }

    canvas.addEventListener("click", e => {
        if (!world.tiles || world.tiles.length === 0) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
        const x = Math.floor((e.clientX - rect.left) * scaleX / TILE_SIZE);
        const y = Math.floor((e.clientY - rect.top) * scaleY / TILE_SIZE);
        if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) return;

        const clickedNationId = world.nationGrid[y][x];
        const clickedProvinceId = world.provinceGrid[y][x];
        const clickedCountyId = world.countyGrid[y][x];

        if (clickedNationId === null) {
            resetSelection();
            setMapMode('political');
            return;
        }

        if (clickedCountyId === selectedCountyId) {
            selectionLevel = (selectionLevel + 1) % 4;
        } else {
            selectionLevel = 1;
            selectedNationId = clickedNationId;
            selectedProvinceId = clickedProvinceId;
            selectedCountyId = clickedCountyId;
        }

        if (selectionLevel === 0) {
            resetSelection(false);
            setMapMode('political');
        } else {
            document.querySelectorAll('.map-modes button').forEach(btn => btn.classList.remove('active'));
            if (selectionLevel === 1) {
                document.getElementById('diplomaticButton').classList.add('active');
            }
            renderMap();
        }
        
        const tile = world.tiles[y * GRID_WIDTH + x];
        let infoHTML = `<b>Coords:</b> (${x}, ${y})<br><b>Biome:</b> ${tile.biome.name}<br>
                        <b>Elevation:</b> ${tile.elevation.toFixed(2)}<br><b>Moisture:</b> ${tile.moisture.toFixed(2)}`;
        if (clickedCountyId !== null) {
            infoHTML += `<br><b>Development:</b> ${world.development[y * GRID_WIDTH + x].toFixed(2)}`;
        }
        if (clickedNationId !== null) {
            const nation = world.nations.get(clickedNationId);
            const province = world.provinces.get(clickedProvinceId);
            infoHTML += `<hr style="border-color: #444; margin: 5px 0;">
                        <b>Nation:</b> ${nation.name} (Power: ${nation.power.toFixed(0)})<br>
                        <b>Culture:</b> ${CULTURES[nation.culture].name}<br>
                        <b>Religion:</b> ${RELIGIONS[nation.religion].name}<br>
                        <b>Province:</b> ${province?.name || 'N/A'} (Dev: ${province?.development.toFixed(0)})<br>
                        <b>County:</b> ${world.counties.get(clickedCountyId)?.name || 'N/A'} (Dev: ${world.counties.get(clickedCountyId)?.development.toFixed(0)})`;
            
            if(nation.suzerain !== null) infoHTML += `<br><b>Suzerain:</b> ${world.nations.get(nation.suzerain).name}`;
            if(nation.vassals.size > 0) infoHTML += `<br><b>Vassals:</b> ${Array.from(nation.vassals).map(id => world.nations.get(id).name).join(', ')}`;
            if(nation.allies.size > 0) infoHTML += `<br><b>Allies:</b> ${Array.from(nation.allies).map(id => world.nations.get(id).name).join(', ')}`;
            if(nation.atWarWith.size > 0) infoHTML += `<br><b style="color: #ff4444;">At War With:</b> ${Array.from(nation.atWarWith).map(id => world.nations.get(id).name).join(', ')}`;
        }
        document.getElementById("tileInfo").innerHTML = infoHTML;
    });

    window.onload = generateAndRenderWorld;