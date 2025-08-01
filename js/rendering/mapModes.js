/* Contains functions that create the pre-rendered offscreen canvases
for each of the primary map modes (political, development, etc)*/

import { world, selection } from '../core/state.js';
import * as Config from '../core/config.js';

function createLayerCanvas() {
    const width = Config.GRID_WIDTH * Config.TILE_SIZE;
    const height = Config.GRID_HEIGHT * Config.TILE_SIZE;
    const canvas = new OffscreenCanvas(width, height);
    return { canvas, ctx: canvas.getContext('2d') };
}

export function renderPoliticalMode() {
    const { canvas, ctx } = createLayerCanvas();
    if (!world.polityGrid) return canvas;

    ctx.globalAlpha = 0.85;

    if (selection.level === 0) {
        // Default view: Render all realms normally
        for (let y = 0; y < Config.GRID_HEIGHT; y++) {
            for (let x = 0; x < Config.GRID_WIDTH; x++) {
                const polityId = world.polityGrid[y][x];
                if (polityId !== null) {
                    const polity = world.polities.get(polityId);
                    if (polity) {
                        const realm = world.polities.get(world.realmGrid[y][x]);
                        if (realm && realm.defaultColor) {
                            ctx.fillStyle = realm.defaultColor;
                            ctx.fillRect(x * Config.TILE_SIZE, y * Config.TILE_SIZE, Config.TILE_SIZE, Config.TILE_SIZE);
                        }
                    }
                }
            }
        }
    } else {
        // Highlight selected entity and darken others
        const selectedTiles = new Set();
        if (selection.level === 1) { // Highlight entire realm
            const realm = world.polities.get(selection.realmId);
            if (realm) {
                realm.directCounties.forEach(cId => world.counties.get(cId).tiles.forEach(t => selectedTiles.add(t)));
                realm.vassals.forEach(vId => {
                    const vassal = world.polities.get(vId);
                    vassal.directCounties.forEach(cId => world.counties.get(cId).tiles.forEach(t => selectedTiles.add(t)));
                });
            }
        } else if (selection.level === 2) { // Highlight a single polity (vassal or direct land)
            const polity = world.polities.get(selection.polityId);
            if (polity) {
                polity.directCounties.forEach(cId => world.counties.get(cId).tiles.forEach(t => selectedTiles.add(t)));
            }
        } else if (selection.level === 3) { // Highlight a single county
            const county = world.counties.get(selection.countyId);
            if (county) {
                county.tiles.forEach(t => selectedTiles.add(t));
            }
        }

        for (let y = 0; y < Config.GRID_HEIGHT; y++) {
            for (let x = 0; x < Config.GRID_WIDTH; x++) {
                const tileIndex = y * Config.GRID_WIDTH + x;
                const polityId = world.polityGrid[y][x];
                if (polityId !== null) {
                    const realm = world.polities.get(world.realmGrid[y][x]);
                    if (realm && realm.defaultColor) {
                        if (selectedTiles.has(tileIndex)) {
                            // Draw selected tiles with full color
                            ctx.fillStyle = realm.defaultColor;
                        } else {
                            // Draw unselected tiles with a darkened/desaturated color
                            ctx.fillStyle = realm.defaultColor.replace("70%", "25%").replace("60%", "30%");
                        }
                        ctx.fillRect(x * Config.TILE_SIZE, y * Config.TILE_SIZE, Config.TILE_SIZE, Config.TILE_SIZE);
                    }
                }
            }
        }
    }
    
    ctx.globalAlpha = 1.0;
    return canvas;
}

export function renderDevelopmentMode() {
    const { canvas, ctx } = createLayerCanvas();
    let maxDev = 0;
    // Find max dev, but ignore 0 dev counties for a better scale
    world.counties.forEach(c => {
        if (c.development > 0) maxDev = Math.max(maxDev, c.development)
    });
    if (maxDev === 0) maxDev = 1; // Avoid division by zero

    ctx.globalAlpha = 0.85;
    for (let y = 0; y < Config.GRID_HEIGHT; y++) {
        for (let x = 0; x < Config.GRID_WIDTH; x++) {
             const countyId = world.countyGrid[y][x];
             if(countyId === null) continue;
             const county = world.counties.get(countyId);
             if(county && county.development > 0) {
                const normalizedDev = county.development / maxDev;
                // *** FIX: Correct red-to-green scale. Low dev is red (0), high dev is green (120). ***
                const hue = normalizedDev * 120;
                ctx.fillStyle = `hsl(${hue}, 90%, 50%)`;
                ctx.fillRect(x * Config.TILE_SIZE, y * Config.TILE_SIZE, Config.TILE_SIZE, Config.TILE_SIZE);
             }
        }
    }
    ctx.globalAlpha = 1.0;
    return canvas;
}

export function renderCultureMode() {
    const { canvas, ctx } = createLayerCanvas();
    ctx.globalAlpha = 0.85;
    const groupSelected = selection.cultureGroupId !== null;

    for (let y = 0; y < Config.GRID_HEIGHT; y++) {
        for (let x = 0; x < Config.GRID_WIDTH; x++) {
            const countyId = world.countyGrid[y][x];
            if (countyId === null) continue;
            const county = world.counties.get(countyId);
            if (!county || county.culture === undefined) continue;

            let color = 'transparent';
            if (groupSelected) {
                if (county.culture === selection.cultureGroupId) {
                    const subCulture = world.subCultures.find(sc => sc.id === county.subCulture);
                    if (subCulture) color = subCulture.color;
                } else {
                    const cultureGroup = world.cultures.find(cg => cg.id === county.culture);
                    if (cultureGroup) {
                        color = cultureGroup.color.replace(/(\d+)\%,\s*(\d+)\%/, '15%, 35%');
                    }
                }
            } else {
                const cultureGroup = world.cultures.find(cg => cg.id === county.culture);
                if (cultureGroup) color = cultureGroup.color;
            }
            
            ctx.fillStyle = color;
            ctx.fillRect(x * Config.TILE_SIZE, y * Config.TILE_SIZE, Config.TILE_SIZE, Config.TILE_SIZE);
        }
    }
    ctx.globalAlpha = 1.0;
    return canvas;
}


export function renderReligionMode() {
    const { canvas, ctx } = createLayerCanvas();
    ctx.globalAlpha = 0.85;
    for (let y = 0; y < Config.GRID_HEIGHT; y++) {
        for (let x = 0; x < Config.GRID_WIDTH; x++) {
            const countyId = world.countyGrid[y][x];
            if (countyId === null) continue;
            const county = world.counties.get(countyId);
            const religion = world.religions.find(r => r.id === county.religion);
            if (county && religion) {
                ctx.fillStyle = religion.color;
                ctx.fillRect(x * Config.TILE_SIZE, y * Config.TILE_SIZE, Config.TILE_SIZE, Config.TILE_SIZE);
            }
        }
    }
    ctx.globalAlpha = 1.0;
    return canvas;
}

export function renderDiplomaticMode(selectedPolityId) {
    const { canvas, ctx } = createLayerCanvas();
    const selected = world.polities.get(selectedPolityId);
    if (!selected) return renderPoliticalMode();

    for (let y = 0; y < Config.GRID_HEIGHT; y++) {
        for (let x = 0; x < Config.GRID_WIDTH; x++) {
            const polityId = world.polityGrid[y][x];
            if (polityId !== null) {
                const polity = world.polities.get(polityId);
                let color;
                if (polity.id === selectedPolityId) color = 'rgba(0, 255, 0, 0.9)';
                else if (selected.allies.has(polity.id)) color = 'rgba(0, 180, 255, 0.9)';
                else if (selected.vassals.has(polity.id)) color = 'rgba(170, 80, 255, 0.9)';
                else if (selected.suzerain === polity.id) color = 'rgba(255, 220, 50, 0.9)';
                else if (selected.atWarWith.has(polity.id)) color = 'rgba(255, 40, 40, 0.9)';
                else color = 'rgba(128, 128, 128, 0.5)';
                
                ctx.fillStyle = color;
                ctx.fillRect(x * Config.TILE_SIZE, y * Config.TILE_SIZE, Config.TILE_SIZE, Config.TILE_SIZE);
            }
        }
    }
    return canvas;
}
