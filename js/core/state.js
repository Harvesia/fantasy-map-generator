/* Manages the global state of the application, including the world object,
viewport, and user selections, also orchestrates the main generation process
by communicating with the web worker*/

import { GRID_WIDTH, GRID_HEIGHT, TILE_SIZE } from './config.js';
import { requestRender, createAllRenderLayers, setMapMode, updateCultureLayer } from '../rendering/mainRenderer.js';

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
        // Reconstruct Maps and Sets from the worker payload
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
        createAllRenderLayers(); // Create all layers once after generation
        fitMapToScreen(); 
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

// State Management Functions

/**Resets the current user selection state
 * @param {boolean} doRender - Whether to trigger a re-render after resetting*/

export function resetSelection(doRender = true) {
    selection.level = 0;
    selection.nationId = null;
    selection.provinceId = null;
    selection.countyId = null;
    selection.religionId = null;
    
    const cultureChanged = selection.cultureGroupId !== null || selection.subCultureId !== null;
    selection.cultureGroupId = null;
    selection.subCultureId = null;

    if (cultureChanged) {
        updateCultureLayer(); // Specifically update culture layer if it was selected
    } else if (doRender) {
        requestRender();
    }
}

/**Sets the selection state for political entities
 * @param {number} nationId
 * @param {number} provinceId
 * @param {number} countyId
 * @param {number} level - The selection level (1, 2, or 3)*/

export function setPoliticalSelection(nationId, provinceId, countyId, level) {
    resetSelection(false);
    selection.nationId = nationId;
    selection.provinceId = provinceId;
    selection.countyId = countyId;
    selection.level = level;
    requestRender();
}

/** Sets the selection state for culture entities
 * @param {number|null} cultureGroupId
 * @param {number|null} subCultureId*/

export function setCultureSelection(cultureGroupId, subCultureId) {
    selection.cultureGroupId = cultureGroupId;
    selection.subCultureId = subCultureId;
    // Instead of just requesting a render, we specifically update the culture layer
    updateCultureLayer();
}

/**Sets the selection state for a religion
 * @param {number|null} religionId*/

export function setReligionSelection(religionId) {
    resetSelection(false);
    selection.religionId = religionId;
    requestRender();
}

/**Sets the selection state for diplomatic view
 * @param {number} nationId*/

export function setDiplomaticSelection(nationId) {
    resetSelection(false);
    selection.level = 1;
    selection.nationId = nationId;
    requestRender();
}


// Viewport Management

//Adjusts the viewport to fit the entire map within the visible screen area
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
