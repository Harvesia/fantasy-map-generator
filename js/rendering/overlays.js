/* Handles drawing dynamic elements on top of the map layers
This includes borders, labels, and selection highlights, which need
to be redrawn frequently as the user interacts with the map*/

import { world, viewport, selection } from '../core/state.js';
import * as Config from '../core/config.js';
import { currentMapMode } from './mainRenderer.js';

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
        polity: { c: "rgba(0,0,0,0.6)", w: 2 },
        realm: { c: "rgba(0,0,0,1.0)", w: 3.5 },
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

    if (currentMapMode === 'political' || currentMapMode === 'diplomatic' || currentMapMode === 'development') {
        // In dev mode, always draw county borders when zoomed
        if (currentMapMode === 'development' && viewport.zoom > 4) {
             drawGridBorders(world.countyGrid, styles.county);
        } else if (selection.level === 0) {
            drawGridBorders(world.realmGrid, styles.realm);
        } else {
            drawGridBorders(world.realmGrid, styles.realm);
            drawGridBorders(world.polityGrid, styles.polity);
            if (viewport.zoom > 4 || selection.level === 3) {
                drawGridBorders(world.countyGrid, styles.county);
            }
        }
    }

    if (currentMapMode === 'culture') {
        if (selection.cultureGroupId !== null) {
            drawGridBorders(world.subCultureGrid, styles.subCulture);
        }
        drawGridBorders(world.cultureGrid, styles.cultureGroup);
    }
}

export function renderFocusHighlight(ctx) {
    if (selection.level === 0 || currentMapMode !== 'development') return;
    
    ctx.globalAlpha = 1.0; 
    ctx.fillStyle = 'rgba(255, 255, 100, 0.4)';

    const tilesToDraw = new Set();
    // In dev mode, highlight the specific county (level 3)
    if (selection.level === 3) {
        const county = world.counties.get(selection.countyId);
        if (county) {
            county.tiles.forEach(t => tilesToDraw.add(t));
        }
    }

    tilesToDraw.forEach(tileIndex => {
        const x = tileIndex % Config.GRID_WIDTH;
        const y = Math.floor(tileIndex / Config.GRID_WIDTH);
        ctx.fillRect(x * Config.TILE_SIZE, y * Config.TILE_SIZE, Config.TILE_SIZE, Config.TILE_SIZE);
    });

    ctx.globalAlpha = 1.0;
}

export function renderSociologyHighlight(ctx, type) {
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';

    if (type === 'culture' && selection.subCultureId !== null) {
        for (let y = 0; y < Config.GRID_HEIGHT; y++) {
            for (let x = 0; x < Config.GRID_WIDTH; x++) {
                const county = world.counties.get(world.countyGrid[y][x]);
                if (!county || county.subCulture !== selection.subCultureId) {
                    ctx.fillRect(x * Config.TILE_SIZE, y * Config.TILE_SIZE, Config.TILE_SIZE, Config.TILE_SIZE);
                }
            }
        }
    } else if (type === 'religion' && selection.religionId !== null) {
        for (let y = 0; y < Config.GRID_HEIGHT; y++) {
            for (let x = 0; x < Config.GRID_WIDTH; x++) {
                const county = world.counties.get(world.countyGrid[y][x]);
                if (!county || county.religion !== selection.religionId) {
                    ctx.fillRect(x * Config.TILE_SIZE, y * Config.TILE_SIZE, Config.TILE_SIZE, Config.TILE_SIZE);
                }
            }
        }
    }
    ctx.globalAlpha = 1.0;
}


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
        if (entity && entity.labelPosition) {
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
    let politiesToLabel = [];
    
    if (selection.level === 0) {
        if (world.topLevelPolities) {
            politiesToLabel = Array.from(world.topLevelPolities).map(id => world.polities.get(id));
        }
    } else if (selection.level === 1) {
        const realm = world.polities.get(selection.realmId);
        if(realm) {
             politiesToLabel = [realm, ...Array.from(realm.vassals).map(id => world.polities.get(id))];
             politiesToLabel.sort((a, b) => a.power - b.power);
        }
    } else if (selection.level === 2 || selection.level === 3) {
        const polity = world.polities.get(selection.polityId);
        if (polity) {
            politiesToLabel = [polity];
        }
    }

    drawLabels(ctx, politiesToLabel, viewLeft, viewRight, viewTop, viewBottom);
}

export function renderSociologyLabels(ctx, type, viewLeft, viewRight, viewTop, viewBottom) {
    if (type === 'culture') {
        if (selection.cultureGroupId !== null) {
            const cultureGroup = world.cultures.find(cg => cg.id === selection.cultureGroupId);
            if (cultureGroup && cultureGroup.isGroup) {
                const subCulturesInGroup = world.subCultures.filter(sc => sc.parentCultureId === selection.cultureGroupId);
                drawLabels(ctx, subCulturesInGroup, viewLeft, viewRight, viewTop, viewBottom);
            } else if (cultureGroup) {
                 drawLabels(ctx, [cultureGroup], viewLeft, viewRight, viewTop, viewBottom);
            }
        } else {
            drawLabels(ctx, world.cultures, viewLeft, viewRight, viewTop, viewBottom);
        }
    } else if (type === 'religion') {
        drawLabels(ctx, world.religions, viewLeft, viewRight, viewTop, viewBottom);
    }
}

export function drawDiplomacyLines(ctx) {
    const realm = world.polities.get(selection.realmId);
    if (!realm) return;

    const capCounty = world.counties.get(realm.capitalCountyId);
    if (!capCounty) return;

    const capX = capCounty.capitalSeed.x * Config.TILE_SIZE + Config.TILE_SIZE / 2;
    const capY = capCounty.capitalSeed.y * Config.TILE_SIZE + Config.TILE_SIZE / 2;

    realm.vassals.forEach(vassalId => {
        const vassal = world.polities.get(vassalId);
        if (vassal) {
            const vassalCapCounty = world.counties.get(vassal.capitalCountyId);
            if (vassalCapCounty) {
                const vassalCapX = vassalCapCounty.capitalSeed.x * Config.TILE_SIZE + Config.TILE_SIZE / 2;
                const vassalCapY = vassalCapCounty.capitalSeed.y * Config.TILE_SIZE + Config.TILE_SIZE / 2;
                ctx.beginPath();
                ctx.moveTo(capX, capY);
                ctx.lineTo(vassalCapX, vassalCapY);
                ctx.strokeStyle = "#ffd700"; ctx.lineWidth = 2 / viewport.zoom; ctx.setLineDash([5 / viewport.zoom, 5 / viewport.zoom]);
                ctx.stroke();
            }
        }
    });
    ctx.setLineDash([]);
}
