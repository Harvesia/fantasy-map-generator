/* Sets up all event listeners for user interaction, such as mouse clicks,
panning, zooming, and keyboard controls.*/

import { viewport, world, selection, resetSelection, clampViewport, generateAndRenderWorld } from './core/state.js';
import * as Config from './core/config.js';
import { requestRender, currentMapMode, setMapMode, createRenderLayers } from './rendering/mainRenderer.js';

const canvas = document.getElementById("map");
const tileInfo = document.getElementById("tileInfo");

let isPanning = false;
let panStart = { x: 0, y: 0 };
let lastMousePos = { x: 0, y: 0 };
const keyState = {};

export function setupEventListeners() {
    // UI Buttons
    document.getElementById('generateButton').onclick = generateAndRenderWorld;
    document.getElementById('physicalButton').onclick = () => setMapMode('physical');
    document.getElementById('politicalButton').onclick = () => setMapMode('political');
    document.getElementById('developmentButton').onclick = () => setMapMode('development');
    document.getElementById('cultureButton').onclick = () => setMapMode('culture');
    document.getElementById('religionButton').onclick = () => setMapMode('religion');
    document.getElementById('diplomaticButton').onclick = () => {
        setMapMode('diplomatic');
        if (world.nations && world.nations.size > 0) {
            selection.nationId = Array.from(world.nations.values()).sort((a,b) => b.power - a.power)[0].id;
            selection.level = 1;
            requestRender();
        }
    };
    document.getElementById('controls-header').onclick = () => {
        const controls = document.getElementById('controls');
        const button = document.getElementById('minimizeButton');
        controls.classList.toggle('minimized');
        button.textContent = controls.classList.contains('minimized') ? '+' : '-';
    };

    // Canvas Mouse Listeners
    canvas.addEventListener("click", handleCanvasClick);
    canvas.addEventListener('mousedown', (e) => {
        isPanning = true;
        panStart = { x: e.clientX, y: e.clientY };
        lastMousePos = { x: e.clientX, y: e.clientY };
        canvas.style.cursor = 'grabbing';
    });
    canvas.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        const dx = e.clientX - lastMousePos.x;
        const dy = e.clientY - lastMousePos.y;
        viewport.x -= dx / viewport.zoom;
        viewport.y -= dy / viewport.zoom;
        lastMousePos = { x: e.clientX, y: e.clientY };
        clampViewport();
        requestRender();
    });
    canvas.addEventListener('mouseup', () => {
        isPanning = false;
        canvas.style.cursor = 'pointer';
    });
    canvas.addEventListener('mouseleave', () => {
        isPanning = false;
        canvas.style.cursor = 'pointer';
    });
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldXBefore = mouseX / viewport.zoom + viewport.x;
        const worldYBefore = mouseY / viewport.zoom + viewport.y;
        const zoomFactor = 1.1;
        const newZoom = e.deltaY < 0 ? viewport.zoom * zoomFactor : viewport.zoom / zoomFactor;
        viewport.zoom = Math.max(viewport.MIN_ZOOM, Math.min(viewport.MAX_ZOOM, newZoom));
        viewport.x = worldXBefore - (mouseX / viewport.zoom);
        viewport.y = worldYBefore - (mouseY / viewport.zoom);
        clampViewport();
        requestRender();
    });

    // Keyboard Listeners
    window.addEventListener('keydown', (e) => { keyState[e.key] = true; });
    window.addEventListener('keyup', (e) => { keyState[e.key] = false; });
    startKeyboardPanLoop();
}

function handleCanvasClick(e) {
    if (!world.tiles || world.tiles.length === 0) return;
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    if (Math.hypot(dx, dy) > 5) return;
    const rect = canvas.getBoundingClientRect();
    const worldX = (e.clientX - rect.left) / viewport.zoom + viewport.x;
    const worldY = (e.clientY - rect.top) / viewport.zoom + viewport.y;
    const x = Math.floor(worldX / Config.TILE_SIZE);
    const y = Math.floor(worldY / Config.TILE_SIZE);
    if (x < 0 || x >= Config.GRID_WIDTH || y < 0 || y >= Config.GRID_HEIGHT) return;

    const countyId = world.countyGrid[y][x];
    if (countyId === null) {
        resetSelection();
        createRenderLayers(); // Re-render base layers
        requestRender();
        return;
    }
    const county = world.counties.get(countyId);

    if (currentMapMode === 'culture') {
        const clickedCultureGroup = county.culture;
        const clickedSubCulture = county.subCulture;

        if (selection.subCultureId === clickedSubCulture) {
            // Third click on the same sub-culture: deselect all
            resetSelection(false);
        } else if (selection.cultureGroupId === clickedCultureGroup) {
            // Second click within the same group: select the sub-culture
            selection.subCultureId = clickedSubCulture;
        } else {
            // First click or click on a new group: select the culture group
            resetSelection(false);
            selection.cultureGroupId = clickedCultureGroup;
        }
        createRenderLayers(); // Culture layer needs to be redrawn based on selection
    } else if (currentMapMode === 'religion') {
        resetSelection(false);
        const religionId = county.religion;
        selection.religionId = (selection.religionId === religionId) ? null : religionId;
    } else {
        // Handle political and other map modes
        if (selection.cultureGroupId !== null || selection.religionId !== null) {
            resetSelection(false); // Clear sociology selections if switching to political
        }
        const clickedProvinceId = world.provinceGrid[y][x];
        const clickedNationId = world.nationGrid[y][x];

        if (currentMapMode === 'diplomatic') {
            selection.nationId = clickedNationId;
            selection.level = 1;
        } else {
            if (selection.countyId === countyId) {
                selection.level = (selection.level + 1) % 4;
            } else {
                selection.level = 1;
            }
        }
        
        if (selection.level === 0) {
            resetSelection(false);
        } else {
            selection.nationId = clickedNationId;
            selection.provinceId = clickedProvinceId;
            selection.countyId = countyId;
        }
    }
    
    requestRender();
    updateTileInfo(x, y);
}

export function updateTileInfo(x, y) {
    const tile = world.tiles[y * Config.GRID_WIDTH + x];
    const countyId = world.countyGrid[y][x];
    if (countyId === null) {
        tileInfo.innerHTML = `<b>Coords:</b> (${x}, ${y})<br><b>Biome:</b> ${tile.biome.name}`;
        return;
    }

    const county = world.counties.get(countyId);
    const province = world.provinces.get(county.parentId);
    const nation = world.nations.get(province.parentId);
    const cultureGroup = world.cultures[county.culture];
    const subCulture = world.subCultures[county.subCulture];
    const religion = world.religions[county.religion];

    let infoHTML = `<b>Coords:</b> (${x}, ${y})<br><b>Biome:</b> ${tile.biome.name}`;
    
    if (subCulture && cultureGroup) {
        infoHTML += `<br><b>Culture:</b> ${subCulture.name} (${cultureGroup.name})`;
    } else if (cultureGroup) {
        infoHTML += `<br><b>Culture Group:</b> ${cultureGroup.name}`;
    }

    if(religion) infoHTML += `<br><b>Religion:</b> ${religion.name}`;

    if (nation) {
        infoHTML += `<hr style="border-color: #444; margin: 5px 0;">
                    <b>Nation:</b> ${nation.name} (Power: ${nation.power.toFixed(0)})<br>
                    <b>Province:</b> ${province?.name || 'N/A'}<br>
                    <b>County:</b> ${county?.name || 'N/A'} (Dev: ${county?.development || 0})`;
        
        if(nation.suzerain !== null && world.nations.has(nation.suzerain)) infoHTML += `<br><b>Suzerain:</b> ${world.nations.get(nation.suzerain).name}`;
        if(nation.vassals.size > 0) infoHTML += `<br><b>Vassals:</b> ${Array.from(nation.vassals).map(id => world.nations.has(id) ? world.nations.get(id).name : '').filter(n => n).join(', ')}`;
        if(nation.allies.size > 0) infoHTML += `<br><b>Allies:</b> ${Array.from(nation.allies).map(id => world.nations.has(id) ? world.nations.get(id).name : '').filter(n => n).join(', ')}`;
        if(nation.atWarWith.size > 0) infoHTML += `<br><b style="color: #ff4444;">At War With:</b> ${Array.from(nation.atWarWith).map(id => world.nations.has(id) ? world.nations.get(id).name : '').filter(n => n).join(', ')}`;
    }
    tileInfo.innerHTML = infoHTML;
}


function startKeyboardPanLoop() {
    let lastTime = 0;
    function loop(time) {
        if(lastTime === 0) lastTime = time;
        const deltaTime = (time - lastTime) / 1000;
        lastTime = time;
        let moved = false;
        const moveSpeed = 300 / viewport.zoom;
        if (keyState['ArrowUp'] || keyState['w']) { viewport.y -= moveSpeed * deltaTime; moved = true; }
        if (keyState['ArrowDown'] || keyState['s']) { viewport.y += moveSpeed * deltaTime; moved = true; }
        if (keyState['ArrowLeft'] || keyState['a']) { viewport.x -= moveSpeed * deltaTime; moved = true; }
        if (keyState['ArrowRight'] || keyState['d']) { viewport.x += moveSpeed * deltaTime; moved = true; }
        if(moved) {
            clampViewport();
            requestRender();
        }
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
}
