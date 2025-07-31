/* Manages the global state of the application, including the world object,
viewport, and user selections, also orchestrates the main generation process
by communicating with the web worker*/

import { GRID_WIDTH, GRID_HEIGHT, TILE_SIZE } from './config.js';
import { requestRender, createRenderLayers, setMapMode } from '../rendering/mainRenderer.js';

// DOM Elements
const loadingStatus = document.getElementById("loadingStatus");
const generateButton = document.getElementById("generateButton");
const currentSeedDisplay = document.getElementById("currentSeedDisplay");

// Application State
export let world = {};
export let viewport = { x: 0, y: 0, zoom: 1.0, MIN_ZOOM: 0.25, MAX_ZOOM: 16.0 };
export let selection = {
    level: 0, // 0: none, 1: nation, 2: province, 3: county
    nationId: null,
    provinceId: null,
    countyId: null,
    religionId: null,
    cultureGroupId: null,
    subCultureId: null,
};

// Create the generation worker
const generationWorker = new Worker(new URL('../generation_worker.js', import.meta.url), { type: 'module'});

// Handle messages from the worker
generationWorker.onmessage = (e) => {
    const { type, payload } = e.data;
    if (type === 'progress') {
        loadingStatus.textContent = payload.status;
    } else if (type === 'complete') {
        world = payload.world;
        world.nations = new Map(world.nations);
        world.provinces = new Map(world.provinces);
        world.counties = new Map(world.counties);
    
        world.nations.forEach(nation => {
            nation.allies = new Set(nation.allies);
            nation.vassals = new Set(nation.vassals);
            nation.atWarWith = new Set(nation.atWarWith);
            nation.children = new Set(nation.children);
        });
        world.provinces.forEach(province => {
            province.children = new Set(province.children);
        });
        world.counties.forEach(county => {
            county.tiles = new Set(county.tiles);
        });
    
        loadingStatus.textContent = "Creating render layers...";
        createRenderLayers();
        fitMapToScreen(); // Fit the new map to the screen
        setMapMode('political');
        loadingStatus.textContent = "Generation Complete!";
        generateButton.disabled = false;
    }
};

//Starts the world generation process

export function generateAndRenderWorld() {
    generateButton.disabled = true;
    resetSelection(false);
    
    let seed = document.getElementById("seedInput").value;
    if (!seed) {
        seed = Math.random().toString(36).substring(2, 15);
    }
    
    currentSeedDisplay.textContent = seed;
    document.getElementById('seedInput').value = '';

    generationWorker.postMessage({
        type: 'generate',
        payload: {
            seed,
            width: GRID_WIDTH,
            height: GRID_HEIGHT
        }
    });
}

/** Resets the current user selection
@param {boolean} doRender Whether to trigger a re-render after resetting*/

export function resetSelection(doRender = true) {
    selection.level = 0;
    selection.nationId = null;
    selection.provinceId = null;
    selection.countyId = null;
    selection.religionId = null;
    selection.cultureGroupId = null;
    selection.subCultureId = null;
    if (doRender) requestRender();
}

/** Adjusts the viewport to fit the entire map within the visible screen area*/
export function fitMapToScreen() {
    const canvas = document.getElementById('map');
    const topBar = document.getElementById('top-bar');
    const bottomBar = document.getElementById('bottom-bar');
    
    const availableWidth = canvas.clientWidth;
    const availableHeight = canvas.clientHeight - topBar.offsetHeight - bottomBar.offsetHeight;

    const worldWidth = GRID_WIDTH * TILE_SIZE;
    const worldHeight = GRID_HEIGHT * TILE_SIZE;

    const zoomX = availableWidth / worldWidth;
    const zoomY = availableHeight / worldHeight;
    
    viewport.zoom = Math.min(zoomX, zoomY) * 0.95;
    viewport.MIN_ZOOM = viewport.zoom * 0.5;

    const viewWidth = canvas.clientWidth / viewport.zoom;
    const viewHeight = canvas.clientHeight / viewport.zoom;

    viewport.x = (worldWidth - viewWidth) / 2;

    const visibleCenterY_screen = topBar.offsetHeight + (availableHeight / 2);
    const worldCenterY_world = worldHeight / 2;
    viewport.y = worldCenterY_world - (visibleCenterY_screen / viewport.zoom);

    clampViewport();
}


// Clamps the viewport to stay within the world boundaries
export function clampViewport() {
    const canvas = document.getElementById('map');
    const worldWidth = GRID_WIDTH * TILE_SIZE;
    const worldHeight = GRID_HEIGHT * TILE_SIZE;
    const viewWidth = canvas.width / viewport.zoom;
    const viewHeight = canvas.height / viewport.zoom;

    if (viewWidth > worldWidth) {
        viewport.x = (worldWidth - viewWidth) / 2;
    } else {
        viewport.x = Math.max(0, Math.min(viewport.x, worldWidth - viewWidth));
    }

    if (viewHeight > worldHeight) {
        viewport.y = (worldHeight - viewHeight) / 2;
    } else {
        viewport.y = Math.max(0, Math.min(viewport.y, worldHeight - viewHeight));
    }
}
