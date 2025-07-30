/* Handles drawing dynamic elements on top of the map layers
This includes borders, labels, and selection highlights, which need
to be redrawn frequently as the user interacts with the map */

import { world, viewport, selection } from '../core/state.js';
import * as Config from '../core/config.js';

// border drawing

function drawBorderLine(ctx, x, y, dir, style) {
    ctx.beginPath();
    ctx.strokeStyle = style.c;
    ctx.lineWidth = style.w / viewport.zoom;
    const px = x * Config.TILE_SIZE;
    const py = y * Config.TILE_SIZE;
    if (dir === 'right') {
        ctx.moveTo(px + Config.TILE_SIZE, py);
        ctx.lineTo(px + Config.TILE_SIZE, py + Config.TILE_SIZE);
    } else {
        ctx.moveTo(px, py + Config.TILE_SIZE);
        ctx.lineTo(px + Config.TILE_SIZE, py + Config.TILE_SIZE);
    }
    ctx.stroke();
}

export function drawBorders(ctx) {
    const styles = {
        county: { c: "rgba(0,0,0,0.25)", w: 1 },
        province: { c: "rgba(0,0,0,0.4)", w: 1.5 },
        nation: { c: "rgba(0,0,0,1.0)", w: 3.5 },
        sociology: { c: "rgba(255,255,255,0.4)", w: 2 }
    };

    const drawGridBorders = (grid, style) => {
        for (let y = 0; y < Config.GRID_HEIGHT; y++) {
            for (let x = 0; x < Config.GRID_WIDTH; x++) {
                const currentId = grid[y][x];

                // Check right neighbor
                if (x + 1 < Config.GRID_WIDTH) {
                    const rightId = grid[y][x + 1];
                    // Draw a border if IDs are different, but not if both are water (null)
                    if (currentId !== rightId && (currentId !== null || rightId !== null)) {
                        drawBorderLine(ctx, x, y, 'right', style);
                    }
                }

                // Check bottom neighbor
                if (y + 1 < Config.GRID_HEIGHT) {
                    const downId = grid[y + 1][x];
                    // Draw a border if IDs are different, but not if both are water (null)
                    if (currentId !== downId && (currentId !== null || downId !== null)) {
                        drawBorderLine(ctx, x, y, 'down', style);
                    }
                }
            }
        }
    };

    if (viewport.zoom > 4 || selection.level === 3) drawGridBorders(world.countyGrid, styles.county);
    if (viewport.zoom > 1.5 || selection.level >= 2) drawGridBorders(world.provinceGrid, styles.province);
    drawGridBorders(world.nationGrid, styles.nation);
}

// highlights

export function renderFocusHighlight(ctx) {
    ctx.globalAlpha = 0.7;
    const nation = world.nations.get(selection.nationId);
    if (!nation) return;
    const color = nation.defaultColor;
    for (let y = 0; y < Config.GRID_HEIGHT; y++) {
        for (let x = 0; x < Config.GRID_WIDTH; x++) {
            let highlight = false;
            if (selection.level === 1 && world.nationGrid[y][x] === selection.nationId) highlight = true;
            else if (selection.level === 2 && world.provinceGrid[y][x] === selection.provinceId) highlight = true;
            else if (selection.level === 3 && world.countyGrid[y][x] === selection.countyId) highlight = true;
            if (highlight) {
                ctx.fillStyle = color;
                ctx.fillRect(x * Config.TILE_SIZE, y * Config.TILE_SIZE, Config.TILE_SIZE, Config.TILE_SIZE);
            }
        }
    }
    ctx.globalAlpha = 1.0;
}

export function renderSociologyHighlight(ctx, type) {
    const selectedId = type === 'culture' ? selection.cultureId : selection.religionId;
    if (selectedId === null) return;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    for (let y = 0; y < Config.GRID_HEIGHT; y++) {
        for (let x = 0; x < Config.GRID_WIDTH; x++) {
            const grid = type === 'culture' ? world.cultureGrid : world.religionGrid;
            const socioId = grid[y][x];
            if (socioId !== selectedId) {
                ctx.fillRect(x * Config.TILE_SIZE, y * Config.TILE_SIZE, Config.TILE_SIZE, Config.TILE_SIZE);
            }
        }
    }
}

// labels and lines

export function renderNationLabels(ctx, viewLeft, viewRight, viewTop, viewBottom) {
    if (viewport.zoom > 0.5) {
        ctx.font = `bold ${14 / viewport.zoom}px sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.lineWidth = 4 / viewport.zoom;
        world.nations.forEach(nation => {
            if (nation.capital) {
                const capX = nation.capital.x * Config.TILE_SIZE;
                const capY = nation.capital.y * Config.TILE_SIZE;
                 if (capX > viewLeft && capX < viewRight && capY > viewTop && capY < viewBottom) {
                    ctx.fillStyle = "#FFFFFF"; ctx.strokeStyle = "#000000";
                    ctx.strokeText(nation.name, capX, capY);
                    ctx.fillText(nation.name, capX, capY);
                }
            }
        });
    }
}

export function renderSociologyLabels(ctx, type) {
    const sociology = (type === 'culture') ? world.cultures : world.religions;
    const grid = (type === 'culture') ? world.cultureGrid : world.religionGrid;
    const sociologyCenters = new Map();
    
    for (let y = 0; y < Config.GRID_HEIGHT; y++) {
        for (let x = 0; x < Config.GRID_WIDTH; x++) {
            const socioId = grid[y][x];
            if (socioId !== null) {
                if (!sociologyCenters.has(socioId)) {
                    sociologyCenters.set(socioId, { tiles: [] });
                }
                sociologyCenters.get(socioId).tiles.push({x, y});
            }
        }
    }

    if (viewport.zoom > 0.4) {
        ctx.font = `bold ${20 / viewport.zoom}px sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.lineWidth = 5 / viewport.zoom;
        ctx.strokeStyle = "rgba(0,0,0,0.8)";
        
        sociologyCenters.forEach((info, id) => {
            if (info.tiles.length === 0 || !sociology[id]) return;
            let totalX = 0, totalY = 0;
            info.tiles.forEach(t => { totalX += t.x; totalY += t.y; });
            const centerX = (totalX / info.tiles.length) * Config.TILE_SIZE;
            const centerY = (totalY / info.tiles.length) * Config.TILE_SIZE;

            ctx.fillStyle = "#FFFFFF";
            ctx.strokeText(sociology[id].name, centerX, centerY);
            ctx.fillText(sociology[id].name, centerX, centerY);
        });
    }
}

export function drawDiplomacyLines(ctx) {
    const nations = world.nations;
    if (!nations) return;
    const drawnWars = new Set();
    nations.forEach(nation => {
        if (!nation.capital) return;
        const capX = nation.capital.x * Config.TILE_SIZE; const capY = nation.capital.y * Config.TILE_SIZE;
        nation.vassals.forEach(vassalId => {
            if (nations.has(vassalId)) {
                const vassal = nations.get(vassalId);
                if (!vassal.capital) return;
                ctx.beginPath();
                ctx.moveTo(capX, capY);
                ctx.lineTo(vassal.capital.x * Config.TILE_SIZE, vassal.capital.y * Config.TILE_SIZE);
                ctx.strokeStyle = "#ffd700"; ctx.lineWidth = 2 / viewport.zoom; ctx.setLineDash([5 / viewport.zoom, 5 / viewport.zoom]);
                ctx.stroke();
            }
        });
        nation.atWarWith.forEach(enemyId => {
            const warId = [nation.id, enemyId].sort().join('-');
            if (!drawnWars.has(warId) && nations.has(enemyId)) {
                const enemy = nations.get(enemyId);
                if (!enemy.capital) return;
                ctx.beginPath();
                ctx.moveTo(capX, capY);
                const midX = (capX + enemy.capital.x * Config.TILE_SIZE) / 2 + (Math.random() - 0.5) * 50;
                const midY = (capY + enemy.capital.y * Config.TILE_SIZE) / 2 + (Math.random() - 0.5) * 50;
                ctx.quadraticCurveTo(midX, midY, enemy.capital.x * Config.TILE_SIZE, enemy.capital.y * Config.TILE_SIZE);
                ctx.strokeStyle = "#ff0000"; ctx.lineWidth = 3 / viewport.zoom; ctx.setLineDash([]);
                ctx.stroke();
                drawnWars.add(warId);
            }
        });
    });
    ctx.setLineDash([]);
}
