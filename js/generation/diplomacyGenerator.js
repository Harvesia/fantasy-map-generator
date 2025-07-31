import { GREAT_POWER_COUNT, VASSALIZATION_CHANCE, ADJACENT_VASSALIZATION_CHANCE, GREAT_WAR_CHANCE, BORDER_WAR_CHANCE } from '../core/config.js';

function buildNationAdjacencyGraph(world) {
    world.nationAdjacency = new Map();
    world.nations.forEach(nation => {
        world.nationAdjacency.set(nation.id, new Set());
    });
    for (let y = 0; y < world.countyGrid.length; y++) {
        for (let x = 0; x < world.countyGrid[y].length; x++) {
            const nationId = world.nationGrid[y][x];
            if (nationId === null || !world.nations.has(nationId)) continue;
            [[1,0],[0,1]].forEach(([dx,dy]) => {
                const nx = x + dx, ny = y + dy;
                if (nx < world.countyGrid[y].length && ny < world.countyGrid.length) {
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

function simulateDiplomacy(world, rand) {
    const nations = world.nations;
    nations.forEach(n => {
        n.allies = new Set(); n.vassals = new Set();
        n.atWarWith = new Set(); n.suzerain = null; n.allianceId = null;
    });
    const sortedNations = Array.from(nations.values()).sort((a,b) => b.power - a.power);
    const greatPowers = sortedNations.slice(0, GREAT_POWER_COUNT);
    greatPowers.forEach(gp => {
        if (rand() > 0.6) return; // Chance for a great power to be isolationist
        sortedNations.forEach(target => {
            if (gp.id !== target.id && target.suzerain === null && !greatPowers.find(p => p.id === target.id)) {
                const powerRatio = gp.power / target.power;
                let vassalChance = 0;
                if (powerRatio > 3.0) {
                    vassalChance = VASSALIZATION_CHANCE; 
                    if (world.nationAdjacency.get(gp.id).has(target.id)) {
                        vassalChance = ADJACENT_VASSALIZATION_CHANCE;
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
    if (allianceLeaders.length >= 2 && rand() > GREAT_WAR_CHANCE) {
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
            if (n1.id < n2.id && n1.allianceId !== n2.allianceId && !n1.atWarWith.has(n2.id) && rand() > (1 - BORDER_WAR_CHANCE)) {
                n1.atWarWith.add(n2.id); n2.atWarWith.add(n1.id);
            }
        });
    });
}

export function generateDiplomacy(world, rand) {
    buildNationAdjacencyGraph(world);
    simulateDiplomacy(world, rand);
}
