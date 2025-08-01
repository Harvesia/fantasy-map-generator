import { GRID_WIDTH, GRID_HEIGHT, BIOMES, DEVELOPMENT_CORES, BASE_DEVELOPMENT } from '../core/config.js';
import { randomName } from '../core/utils.js';

function assignTilesToCounties(world, capitals, countyGrid, rand) {
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

    // Main expansion pass
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

    // Claim all remaining unassigned land tiles
    const unassignedLand = [];
    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            const tile = world.tiles[y * GRID_WIDTH + x];
            if (countyGrid[y][x] === null && tile.biome.cost < 1000) {
                unassignedLand.push({x, y});
            }
        }
    }

    if (unassignedLand.length > 0) {
        const countyCenters = new Map();
        world.counties.forEach(county => {
            if (county.tiles.size > 0) {
                let avgX = 0, avgY = 0;
                county.tiles.forEach(tileIndex => {
                    avgX += tileIndex % GRID_WIDTH;
                    avgY += Math.floor(tileIndex / GRID_WIDTH);
                });
                countyCenters.set(county.id, {
                    x: avgX / county.tiles.size,
                    y: avgY / county.tiles.size
                });
            }
        });

        unassignedLand.forEach(tilePos => {
            let closestCountyId = -1;
            let minDistance = Infinity;
            countyCenters.forEach((center, countyId) => {
                const dist = Math.hypot(tilePos.x - center.x, tilePos.y - center.y);
                if (dist < minDistance) {
                    minDistance = dist;
                    closestCountyId = countyId;
                }
            });

            if (closestCountyId !== -1) {
                countyGrid[tilePos.y][tilePos.x] = closestCountyId;
                const county = world.counties.get(closestCountyId);
                county.tiles.add(tilePos.y * GRID_WIDTH + tilePos.x);
            }
        });
    }

    // Development calculation runs immediately after all tiles are assigned
    const devCores = [];
    for (let i = 0; i < DEVELOPMENT_CORES; i++) {
        let x, y;
        do {
            x = Math.floor(rand() * GRID_WIDTH);
            y = Math.floor(rand() * GRID_HEIGHT);
        } while (world.tiles[y * GRID_WIDTH + x].biome.cost >= 1000);
        devCores.push({x, y, strength: 2 + rand() * 8 });
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

function assignSubdivisionsToParents(world, level, parentLevel, parentCapitals) {
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

function generateSubdivisionLevel(world, level, count, rand, usedNames) {
    const capitals = [];
    const parentLevel = level === 'province' ? 'county' : (level === 'nation' ? 'province' : null);
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

    if (level === 'county') {
        assignTilesToCounties(world, capitals, childGrid, rand);
    } else {
        assignSubdivisionsToParents(world, level, parentLevel, capitals);
    }

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


function calculateNationPowerAndCapitals(world) {
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
                if (tile.biome.cost < 1000) {
                    landTiles.push(tile);
                }
            });

            if (landTiles.length === 0) {
                nation.capital = nation.capitalSeed;
                return;
            }

            const avgX = Math.round(capX / capitalCounty.tiles.size);
            const avgY = Math.round(capY / capitalCounty.tiles.size);

            let finalCapitalTile = world.tiles[avgY * GRID_WIDTH + avgX];
            const finalCapitalCountyId = world.countyGrid[avgY] ? world.countyGrid[avgY][avgX] : null;

            if (!finalCapitalTile || finalCapitalCountyId !== capitalCounty.id || finalCapitalTile.biome.cost >= 1000) {
                let closestLandTile = null;
                let minDistance = Infinity;
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

function fixExclaves(world) {
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

/**Renames child entities if they are the only child of their parent
 * @param {object} world The world object*/

function applyLogicalNaming(world) {
    // Nations -> Provinces
    world.nations.forEach(nation => {
        if (nation.children.size === 1) {
            const provinceId = nation.children.values().next().value;
            const province = world.provinces.get(provinceId);
            if (province) {
                province.name = nation.name;
            }
        }
    });

    // Provinces -> Counties
    world.provinces.forEach(province => {
        if (province.children.size === 1) {
            const countyId = province.children.values().next().value;
            const county = world.counties.get(countyId);
            if (county) {
                county.name = province.name;
            }
        }
    });
}


export function generatePolitics(world, rand, usedNames, COUNTY_COUNT, PROVINCE_COUNT, NATION_COUNT) {
    generateSubdivisionLevel(world, 'county', COUNTY_COUNT, rand, usedNames);
    generateSubdivisionLevel(world, 'province', PROVINCE_COUNT, rand, usedNames);
    generateSubdivisionLevel(world, 'nation', NATION_COUNT, rand, usedNames);
    
    calculateNationPowerAndCapitals(world);
    fixExclaves(world);

    // Apply logical naming convention after all structural changes are done
    applyLogicalNaming(world);
}
