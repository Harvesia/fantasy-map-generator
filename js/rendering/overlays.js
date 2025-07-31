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

export function drawBorders(ctx, currentMapMode) {
    const styles = {
        county: { c: "rgba(0,0,0,0.25)", w: 1 },
        province: { c: "rgba(0,0,0,0.4)", w: 1.5 },
        nation: { c: "rgba(0,0,0,1.0)", w: 3.5 },
        cultureGroup: { c: "rgba(255,255,255,0.6)", w: 3 },
        subCulture: { c: "rgba(255,255,255,0.3)", w: 1.5 },
    };

    const drawGridBorders = (grid, style) => {
        if (!grid) return;
        for (let y = 0; y < Config.GRID_HEIGHT; y++) {
            for (let x = 0; x < Config.GRID_WIDTH; x++) {
                const currentId = grid[y][x];
                if (x + 1 < Config.GRID_WIDTH) {
                    const rightId = grid[y][x + 1];
                    if (currentId !== rightId && (currentId !== null || rightId !== null)) {
                        drawBorderLine(ctx, x, y, 'right', style);
                    }
                }
                if (y + 1 < Config.GRID_HEIGHT) {
                    const downId = grid[y + 1][x];
                    if (currentId !== downId && (currentId !== null || downId !== null)) {
                        drawBorderLine(ctx, x, y, 'down', style);
                    }
                }
            }
        }
    };

    if (currentMapMode === 'political' || currentMapMode === 'diplomatic' || selection.level > 0) {
        if (viewport.zoom > 4 || selection.level === 3) drawGridBorders(world.countyGrid, styles.county);
        if (viewport.zoom > 1.5 || selection.level >= 2) drawGridBorders(world.provinceGrid, styles.province);
        drawGridBorders(world.nationGrid, styles.nation);
    }

    if (currentMapMode === 'culture') {
        if (selection.cultureGroupId !== null) {
            drawGridBorders(world.subCultureGrid, styles.subCulture);
        }
        drawGridBorders(world.cultureGrid, styles.cultureGroup);
    }
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
    ctx.globalAlpha = 0.6;
    if (type === 'culture') {
        if (selection.subCultureId !== null) {
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            for (let y = 0; y < Config.GRID_HEIGHT; y++) {
                for (let x = 0; x < Config.GRID_WIDTH; x++) {
                    const county = world.counties.get(world.countyGrid[y][x]);
                    if (!county || county.subCulture !== selection.subCultureId) {
                        ctx.fillRect(x * Config.TILE_SIZE, y * Config.TILE_SIZE, Config.TILE_SIZE, Config.TILE_SIZE);
                    }
                }
            }
        }
    } else if (type === 'religion') {
        if (selection.religionId !== null) {
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            for (let y = 0; y < Config.GRID_HEIGHT; y++) {
                for (let x = 0; x < Config.GRID_WIDTH; x++) {
                    const county = world.counties.get(world.countyGrid[y][x]);
                    if (!county || county.religion !== selection.religionId) {
                        ctx.fillRect(x * Config.TILE_SIZE, y * Config.TILE_SIZE, Config.TILE_SIZE, Config.TILE_SIZE);
                    }
                }
            }
        }
    }
    ctx.globalAlpha = 1.0;
}


// labels and lines

function drawLabels(ctx, entities, viewLeft, viewRight, viewTop, viewBottom) {
    if (viewport.zoom <= 0.4) return;
    
    ctx.font = `bold ${14 / viewport.zoom}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 4 / viewport.zoom;
    ctx.strokeStyle = "rgba(0,0,0,0.8)";
    ctx.fillStyle = "#FFFFFF";

    const drawnLabels = [];

    entities.forEach(entity => {
        if (entity.labelPosition) {
            const labelX = entity.labelPosition.x * Config.TILE_SIZE + (Config.TILE_SIZE / 2);
            const labelY = entity.labelPosition.y * Config.TILE_SIZE + (Config.TILE_SIZE / 2);

            if (labelX > viewLeft && labelX < viewRight && labelY > viewTop && labelY < viewBottom) {
                const textWidth = ctx.measureText(entity.name).width;
                const labelBox = {
                    x: labelX - textWidth / 2,
                    y: labelY - 10 / viewport.zoom,
                    w: textWidth,
                    h: 20 / viewport.zoom
                };

                // Simple collision detection
                let collision = false;
                for (const drawn of drawnLabels) {
                    if (labelBox.x < drawn.x + drawn.w && labelBox.x + labelBox.w > drawn.x &&
                        labelBox.y < drawn.y + drawn.h && labelBox.y + labelBox.h > drawn.y) {
                        collision = true;
                        break;
                    }
                }

                if (!collision) {
                    ctx.strokeText(entity.name, labelX, labelY);
                    ctx.fillText(entity.name, labelX, labelY);
                    drawnLabels.push(labelBox);
                }
            }
        }
    });
}


export function renderNationLabels(ctx, viewLeft, viewRight, viewTop, viewBottom) {
    drawLabels(ctx, Array.from(world.nations.values()), viewLeft, viewRight, viewTop, viewBottom);
}

export function renderSociologyLabels(ctx, type, viewLeft, viewRight, viewTop, viewBottom) {
    if (type === 'culture') {
        if (selection.cultureGroupId !== null) {
            const subCulturesInGroup = world.subCultures.filter(sc => sc.parentCultureId === selection.cultureGroupId);
            drawLabels(ctx, subCulturesInGroup, viewLeft, viewRight, viewTop, viewBottom);
        } else {
            drawLabels(ctx, world.cultures, viewLeft, viewRight, viewTop, viewBottom);
        }
    } else if (type === 'religion') {
        if (selection.religionId === null) {
            drawLabels(ctx, world.religions, viewLeft, viewRight, viewTop, viewBottom);
        }
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
