/*The main rendering engine. Handles the animation loop, drawing layers
from offscreen canvases, and managing map modes*/

import { viewport, world, selection, resetSelection } from '../core/state.js';
import * as Config from '../core/config.js';
import { renderPoliticalMode, renderDevelopmentMode, renderCultureMode, renderReligionMode, renderDiplomaticMode } from './mapModes.js';
import { renderFocusHighlight, renderSociologyHighlight, renderNationLabels, renderSociologyLabels, drawBorders, drawDiplomacyLines } from './overlays.js';

const canvas = document.getElementById("map");
const ctx = canvas.getContext("2d");

let needsRender = true;
let animationFrameId = null;
export let currentMapMode = 'physical';

// Offscreen canvases for performance
export let renderLayers = {
    terrain: null,
    political: null,
    development: null,
    culture: null,
    religion: null,
    diplomatic: null
};

/* Creates the static, pre-rendered layers on offscreen canvases.
This is a major optimization, as these layers don't need to be redrawn every frame.*/

export function createRenderLayers() {
    const width = Config.GRID_WIDTH * Config.TILE_SIZE;
    const height = Config.GRID_HEIGHT * Config.TILE_SIZE;

    // Terrain Layer (base layer)
    renderLayers.terrain = new OffscreenCanvas(width, height);
    const terrainCtx = renderLayers.terrain.getContext('2d');
    for (const tile of world.tiles) {
        terrainCtx.fillStyle = tile.biome.color;
        terrainCtx.fillRect(tile.x * Config.TILE_SIZE, tile.y * Config.TILE_SIZE, Config.TILE_SIZE, Config.TILE_SIZE);
    }

    // Map Mode Layers
    renderLayers.political = renderPoliticalMode();
    renderLayers.development = renderDevelopmentMode();
    renderLayers.culture = renderCultureMode();
    renderLayers.religion = renderReligionMode();
}

//Main render loop. Draws the appropriate layers to the main canvas.

function drawFrame() {
    try {
        console.log(`drawFrame triggered. Mode: ${currentMapMode}, Selection Level: ${selection.level}`);

        animationFrameId = null;
        if (!world.tiles || world.tiles.length === 0) return;

        // Resize canvas if needed
        if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
            ctx.imageSmoothingEnabled = false;
        }

        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.scale(viewport.zoom, viewport.zoom);
        ctx.translate(-viewport.x, -viewport.y);

        const viewLeft = viewport.x;
        const viewTop = viewport.y;
        const viewRight = viewport.x + canvas.width / viewport.zoom;
        const viewBottom = viewport.y + canvas.height / viewport.zoom;

        // 1. Draw the base terrain layer
        if (renderLayers.terrain) {
            ctx.drawImage(renderLayers.terrain, 0, 0);
        }

        // 2. Draw the current map mode layer AND/OR selection highlights
        if (currentMapMode === 'diplomatic' && selection.nationId !== null) {
            // Diplomatic mode is special, it's a full overlay. Pass the terrain layer to it.
            const diplomaticLayer = renderDiplomaticMode(selection.nationId);
            ctx.drawImage(diplomaticLayer, 0, 0);
        } else if (selection.level === 0) { // No selection, not diplomatic
            // Draw the full map mode layer if one exists for the current mode
            if (currentMapMode !== 'physical' && renderLayers[currentMapMode]) {
                ctx.drawImage(renderLayers[currentMapMode], 0, 0);
            }
        } else { // Something is selected, but not in diplomatic mode
            // Draw the appropriate map mode layer first (e.g., Development)
            if (currentMapMode !== 'physical' && renderLayers[currentMapMode]) {
                ctx.drawImage(renderLayers[currentMapMode], 0, 0);
            }
            // Then draw the highlight on top of it
            renderFocusHighlight(ctx);
        }

        // 3. Draw dynamic overlays
        if (selection.cultureId !== null) {
            renderSociologyHighlight(ctx, 'culture');
        } else if (selection.religionId !== null) {
            renderSociologyHighlight(ctx, 'religion');
        }
        
        if (currentMapMode !== 'physical' || selection.level > 0) {
            drawBorders(ctx);
        }

        if (currentMapMode === 'political' || currentMapMode === 'diplomatic' || selection.level > 0) {
            renderNationLabels(ctx, viewLeft, viewRight, viewTop, viewBottom);
            if(currentMapMode === 'political' && selection.level === 0) drawDiplomacyLines(ctx);
        }
        if (currentMapMode === 'culture') {
            renderSociologyLabels(ctx, 'culture');
        }
        if (currentMapMode === 'religion') {
            renderSociologyLabels(ctx, 'religion');
        }

        ctx.restore();
    } catch (error) {
        console.error("!!! FATAL ERROR IN RENDER LOOP !!!", error);
    }
}

function renderLoop() {
    if (needsRender) {
        drawFrame(); // Call the renamed render function
        needsRender = false; // Reset the flag after drawing
    }
    // Keep the loop running forever
    requestAnimationFrame(renderLoop);
}

//Requests a new frame to be rendered.

export function requestRender() {
    needsRender = true;
}

export function startRenderLoop() {
    renderLoop();
}

/**Sets the current map mode and triggers a re-render
@param {string} mode - The new map mode ('political', 'development', etc.)*/

export function setMapMode(mode) {
    resetSelection(false);
    currentMapMode = mode;
    document.querySelectorAll('.map-modes button').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`${mode}Button`).classList.add('active');
    requestRender();
}
