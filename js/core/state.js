/* Manages the global state of the application, including the world object,
viewport, and user selections, also orchestrates the main generation process
by communicating with the web worker*/

import { GRID_WIDTH, GRID_HEIGHT, TILE_SIZE } from './config.js';
import { requestRender, createRenderLayers, setMapMode } from '../rendering/mainRenderer.js';
import { updateTileInfo } from '../listeners.js';

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
    cultureId: null,
    religionId: null
};

/* Create the generation worker.
The `{ type: 'module' }` option is removed as the worker is now self-contained.*/

const generationWorker = new Worker(new URL('../generation_worker.js', import.meta.url));

// Handle messages from the worker
generationWorker.onmessage = (e) => {
    const { type, payload } = e.data;
    if (type === 'progress') {
        loadingStatus.textContent = payload.status;
    } else if (type === 'complete') {
        // Reconstruct the world object from the cloned arrays
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
        fitMapToScreen();
        setMapMode('political');
        loadingStatus.textContent = "Generation Complete!";
        generateButton.disabled = false;
        updateTileInfo(Math.floor(GRID_WIDTH / 2), Math.floor(GRID_HEIGHT / 2));
        console.log("1. Worker message 'complete' received.");
        console.log("2. World object reconstructed. Inspecting maps and sets:", {
            nations: world.nations instanceof Map,
            provinces: world.provinces instanceof Map,
            firstNationAllies: world.nations.values().next().value.allies instanceof Set
        });

        console.dir(world); 
    
        loadingStatus.textContent = "Creating render layers...";
    
        console.log("3. Calling createRenderLayers().");
        createRenderLayers();
        console.log("4. createRenderLayers() finished.");
    
        fitMapToScreen();
    
        console.log("5. Calling setMapMode('political').");
        setMapMode('political');
        
        loadingStatus.textContent = "Generation Complete!";
        generateButton.disabled = false;
        updateTileInfo(Math.floor(GRID_WIDTH / 2), Math.floor(GRID_HEIGHT / 2));
        console.log("6. Initialization complete.");
    }
};

//Starts the world generation process.

export function generateAndRenderWorld() {
    generateButton.disabled = true;
    resetSelection(false);
    
    let seed = document.getElementById("seedInput").value;
    if (!seed) {
        seed = Math.random().toString(36).substring(2, 15);
    }
    
    currentSeedDisplay.textContent = seed;
    document.getElementById('seedInput').value = '';

    // Send generation command to the worker
    generationWorker.postMessage({
        type: 'generate',
        payload: {
            seed,
            width: GRID_WIDTH,
            height: GRID_HEIGHT
        }
    });
}

/** Resets the current user selection.
@param {boolean} doRender - Whether to trigger a re-render after resetting.*/

export function resetSelection(doRender = true) {
    selection.level = 0;
    selection.nationId = null;
    selection.provinceId = null;
    selection.countyId = null;
    selection.cultureId = null;
    selection.religionId = null;
    if (doRender) requestRender();
}

// Adjusts the viewport to fit the entire map on the screen.

export function fitMapToScreen() {
    const canvas = document.getElementById('map');
    const worldWidth = GRID_WIDTH * TILE_SIZE;
    const worldHeight = GRID_HEIGHT * TILE_SIZE;
    const zoomX = canvas.width / worldWidth;
    const zoomY = canvas.height / worldHeight;
    viewport.zoom = Math.min(zoomX, zoomY);
    viewport.MIN_ZOOM = viewport.zoom * 0.95;
    
    const viewWidth = canvas.width / viewport.zoom;
    const viewHeight = canvas.height / viewport.zoom;
    viewport.x = (worldWidth - viewWidth) / 2;
    viewport.y = (worldHeight - viewHeight) / 2;
    clampViewport();
}

// Clamps the viewport to stay within the world boundaries.

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
