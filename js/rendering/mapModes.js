/* Contains functions that create the pre-rendered offscreen canvases
for each of the primary map modes (political, development, etc)*/

import { world } from '../core/state.js';
import * as Config from '../core/config.js';

function createLayerCanvas() {
    const width = Config.GRID_WIDTH * Config.TILE_SIZE;
    const height = Config.GRID_HEIGHT * Config.TILE_SIZE;
    const canvas = new OffscreenCanvas(width, height);
    return { canvas, ctx: canvas.getContext('2d') };
}

export function renderPoliticalMode() {
    const { canvas, ctx } = createLayerCanvas();
    ctx.globalAlpha = 0.5;
    for (let y = 0; y < Config.GRID_HEIGHT; y++) {
        for (let x = 0; x < Config.GRID_WIDTH; x++) {
            const nationId = world.nationGrid[y][x];
            if (nationId !== null) {
                const nation = world.nations.get(nationId);
                if (nation) {
                    ctx.fillStyle = nation.defaultColor;
                    ctx.fillRect(x * Config.TILE_SIZE, y * Config.TILE_SIZE, Config.TILE_SIZE, Config.TILE_SIZE);
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
    world.counties.forEach(c => maxDev = Math.max(maxDev, c.development));
    ctx.globalAlpha = 0.7;
    for (let y = 0; y < Config.GRID_HEIGHT; y++) {
        for (let x = 0; x < Config.GRID_WIDTH; x++) {
             const countyId = world.countyGrid[y][x];
             if(countyId === null) continue;
             const county = world.counties.get(countyId);
             if(county && county.development > 0) {
                const normalizedDev = county.development / maxDev;
                const hue = 120 * normalizedDev;
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
    ctx.globalAlpha = 0.7;
    for (let y = 0; y < Config.GRID_HEIGHT; y++) {
        for (let x = 0; x < Config.GRID_WIDTH; x++) {
            const cultureId = world.cultureGrid[y][x];
            if (cultureId !== null && world.cultures[cultureId]) {
                ctx.fillStyle = world.cultures[cultureId].color;
                ctx.fillRect(x * Config.TILE_SIZE, y * Config.TILE_SIZE, Config.TILE_SIZE, Config.TILE_SIZE);
            }
        }
    }
    ctx.globalAlpha = 1.0;
    return canvas;
}

export function renderReligionMode() {
    const { canvas, ctx } = createLayerCanvas();
    ctx.globalAlpha = 0.7;
    for (let y = 0; y < Config.GRID_HEIGHT; y++) {
        for (let x = 0; x < Config.GRID_WIDTH; x++) {
            const religionId = world.religionGrid[y][x];
            if (religionId !== null && world.religions[religionId]) {
                ctx.fillStyle = world.religions[religionId].color;
                ctx.fillRect(x * Config.TILE_SIZE, y * Config.TILE_SIZE, Config.TILE_SIZE, Config.TILE_SIZE);
            }
        }
    }
    ctx.globalAlpha = 1.0;
    return canvas;
}

export function renderDiplomaticMode(selectedNationId, terrainCanvas) {
    const { canvas, ctx } = createLayerCanvas();
    const selected = world.nations.get(selectedNationId);
    if (!selected || !terrainCanvas) return canvas;

    // Draw a grey overlay over the whole map first as a base for neutral nations
    ctx.fillStyle = 'rgba(128, 128, 128, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Go through each tile and draw the correct view
    for (let y = 0; y < Config.GRID_HEIGHT; y++) {
        for (let x = 0; x < Config.GRID_WIDTH; x++) {
            const nationId = world.nationGrid[y][x];
            if (nationId === null) continue;

            const nation = world.nations.get(nationId);
            if (!nation) continue;

            if (nation.id === selectedNationId) {
                // For the selected nation, copy its terrain from the terrain canvas
                const TILE_SIZE = Config.TILE_SIZE;
                ctx.drawImage(terrainCanvas,
                    x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE, // Source rect from terrain canvas
                    x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE  // Destination rect on  canvas
                );
            } else if (selected.allies.has(nation.id)) {
                ctx.fillStyle = 'rgba(0, 255, 100, 0.5)';
                ctx.fillRect(x * Config.TILE_SIZE, y * Config.TILE_SIZE, Config.TILE_SIZE, Config.TILE_SIZE);
            } else if (selected.vassals.has(nation.id)) {
                ctx.fillStyle = 'rgba(150, 50, 255, 0.5)';
                ctx.fillRect(x * Config.TILE_SIZE, y * Config.TILE_SIZE, Config.TILE_SIZE, Config.TILE_SIZE);
            } else if (selected.suzerain === nation.id) {
                ctx.fillStyle = 'rgba(255, 215, 0, 0.5)';
                ctx.fillRect(x * Config.TILE_SIZE, y * Config.TILE_SIZE, Config.TILE_SIZE, Config.TILE_SIZE);
            } else if (selected.atWarWith.has(nation.id)) {
                ctx.fillStyle = 'rgba(255, 40, 40, 0.5)';
                ctx.fillRect(x * Config.TILE_SIZE, y * Config.TILE_SIZE, Config.TILE_SIZE, Config.TILE_SIZE);
            }
        }
    }
    return canvas;
}
