/*The main rendering engine, handles the animation loop, drawing layers
from offscreen canvases, and managing map modes*/

import { viewport, world, selection, resetSelection } from '../core/state.js';
import * as Config from '../core/config.js';
import { renderPoliticalMode, renderDevelopmentMode, renderCultureMode, renderReligionMode, renderDiplomaticMode } from './mapModes.js';
import { renderFocusHighlight, renderSociologyHighlight, renderNationLabels, renderSociologyLabels, drawBorders, drawDiplomacyLines } from './overlays.js';

const canvas = document.getElementById("map");
const ctx = canvas.getContext("2d");

let needsRender = true;
export let currentMapMode = 'physical';

// Offscreen canvases for performance
export let renderLayers = {
    terrain: null,
    political: null,
    development: null,
    culture: null,
    religion: null,
};

/* Creates the static, pre-rendered layers on offscreen canvases
This is a major optimization, as these layers don't need to be redrawn every frame*/

export function createRenderLayers() {
    const width = Config.GRID_WIDTH * Config.TILE_SIZE;
    const height = Config.GRID_HEIGHT * Config.TILE_SIZE;

    if (world.tiles && world.tiles.length > 0) {
        renderLayers.terrain = new OffscreenCanvas(width, height);
        const terrainCtx = renderLayers.terrain.getContext('2d');
        for (const tile of world.tiles) {
            terrainCtx.fillStyle = tile.biome.color;
            terrainCtx.fillRect(tile.x * Config.TILE_SIZE, tile.y * Config.TILE_SIZE, Config.TILE_SIZE, Config.TILE_SIZE);
        }
    }

    if(world.nations) renderLayers.political = renderPoliticalMode();
    if(world.counties) renderLayers.development = renderDevelopmentMode();
    if(world.cultures) renderLayers.culture = renderCultureMode();
    if(world.religions) renderLayers.religion = renderReligionMode();
}

//Main render loop, draws the appropriate layers to the main canvas
function drawFrame() {
    try {
        if (!world.tiles || world.tiles.length === 0) return;

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

        if (renderLayers.terrain) ctx.drawImage(renderLayers.terrain, 0, 0);

        if (currentMapMode !== 'physical' && renderLayers[currentMapMode]) {
            ctx.drawImage(renderLayers[currentMapMode], 0, 0);
        }
       
        if (currentMapMode === 'diplomatic' && selection.nationId !== null) {
            const diplomaticLayer = renderDiplomaticMode(selection.nationId);
            ctx.drawImage(diplomaticLayer, 0, 0);
        } else if (selection.level > 0) {
            renderFocusHighlight(ctx);
        }

        renderSociologyHighlight(ctx, 'culture');
        renderSociologyHighlight(ctx, 'religion');
        
        drawBorders(ctx, currentMapMode);

        if (currentMapMode === 'political' || currentMapMode === 'diplomatic' || selection.level > 0) {
            renderNationLabels(ctx, viewLeft, viewRight, viewTop, viewBottom);
        }
        if (currentMapMode === 'political' && selection.level === 0) {
            drawDiplomacyLines(ctx);
        }
        
        if (currentMapMode === 'culture' || currentMapMode === 'religion') {
            renderSociologyLabels(ctx, currentMapMode, viewLeft, viewRight, viewTop, viewBottom);
        }

        ctx.restore();
    } catch (error) {
        console.error("!!! FATAL ERROR IN RENDER LOOP !!!", error);
    }
}


function renderLoop() {
    if (needsRender) {
        drawFrame();
        needsRender = false;
    }
    requestAnimationFrame(renderLoop);
}

export function requestRender() {
    needsRender = true;
}

export function startRenderLoop() {
    renderLoop();
}

/**Sets the current map mode and triggers a re-render
@param {string} mode The new map mode ('political', 'development', etc)*/

export function setMapMode(mode) {
    document.querySelectorAll('.map-mode-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`${mode}Button`).classList.add('active');
    
    resetSelection(false);
    currentMapMode = mode;
    createRenderLayers();
    requestRender();
}
