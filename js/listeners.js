/* Sets up all event listeners for user interaction, such as mouse clicks,
panning, zooming, and keyboard controls*/

import { viewport, world, selection, resetSelection, clampViewport, generateAndRenderWorld } from './core/state.js';
import * as Config from './core/config.js';
import { requestRender, currentMapMode, setMapMode, createRenderLayers } from './rendering/mainRenderer.js';

const canvas = document.getElementById("map");

// Panels
const countyPanel = document.getElementById('county-panel');
const provincePanel = document.getElementById('province-panel');
const nationPanel = document.getElementById('nation-panel');
const culturePanel = document.getElementById('culture-panel');
const religionPanel = document.getElementById('religion-panel');
const allPanels = [countyPanel, provincePanel, nationPanel, culturePanel, religionPanel];

let isPanning = false;
let panStartPos = { x: 0, y: 0 };
const keyState = {};

function hideAllPanels() {
    allPanels.forEach(p => p.classList.add('hidden'));
}

function showCountyPanel(countyId) {
    const county = world.counties.get(countyId);
    const province = world.provinces.get(county.parentId);
    const cultureGroup = world.cultures[county.culture];
    const subCulture = world.subCultures[county.subCulture];
    const religion = world.religions[county.religion];

    document.getElementById('county-name').textContent = county.name;
    document.getElementById('county-province-name').textContent = province.name;
    document.getElementById('county-dev').textContent = county.development;
    document.getElementById('county-biome').textContent = world.tiles[county.tiles.values().next().value].biome.name;
    
    if (cultureGroup.isGroup) {
        document.getElementById('county-culture').textContent = `${subCulture.name} (${cultureGroup.name})`;
    } else {
        document.getElementById('county-culture').textContent = cultureGroup.name;
    }
    
    document.getElementById('county-religion').textContent = religion.name;
    
    hideAllPanels();
    countyPanel.classList.remove('hidden');
}

function showProvincePanel(provinceId) {
    const province = world.provinces.get(provinceId);
    const nation = world.nations.get(province.parentId);

    document.getElementById('province-name').textContent = province.name;
    document.getElementById('province-nation-name').textContent = nation.name;
    document.getElementById('province-dev').textContent = province.development;

    hideAllPanels();
    provincePanel.classList.remove('hidden');
}

function showNationPanel(nationId) {
    const nation = world.nations.get(nationId);
    document.getElementById('nation-name').textContent = nation.name;
    document.getElementById('nation-power').textContent = nation.power.toFixed(0);

    const suzerainEl = document.getElementById('nation-suzerain');
    if (nation.suzerain !== null && world.nations.has(nation.suzerain)) {
        suzerainEl.textContent = world.nations.get(nation.suzerain).name;
    } else {
        suzerainEl.textContent = "None";
    }

    const lists = {
        'nation-allies': nation.allies,
        'nation-vassals': nation.vassals,
        'nation-atWarWith': nation.atWarWith
    };

    for (const [listId, nationIds] of Object.entries(lists)) {
        const ul = document.getElementById(listId);
        ul.innerHTML = '';
        if (nationIds.size > 0) {
            nationIds.forEach(id => {
                const otherNation = world.nations.get(id);
                if (otherNation) {
                    const li = document.createElement('li');
                    li.textContent = otherNation.name;
                    ul.appendChild(li);
                }
            });
        } else {
            const li = document.createElement('li');
            li.textContent = 'None';
            li.style.fontStyle = 'italic';
            li.style.color = '#888';
            ul.appendChild(li);
        }
    }

    hideAllPanels();
    nationPanel.classList.remove('hidden');
}

function showCulturePanel(cultureGroupId) {
    const cultureGroup = world.cultures.find(cg => cg.id === cultureGroupId);
    document.getElementById('culture-group-name').textContent = cultureGroup.name;
    
    const subCultureList = document.getElementById('subculture-list');
    subCultureList.innerHTML = '';
    const subCultures = world.subCultures.filter(sc => sc.parentCultureId === cultureGroupId);
    subCultures.forEach(sc => {
        const li = document.createElement('li');
        li.textContent = sc.name;
        subCultureList.appendChild(li);
    });

    hideAllPanels();
    culturePanel.classList.remove('hidden');
}

function showReligionPanel(religionId) {
    const religion = world.religions.find(r => r.id === religionId);
    document.getElementById('religion-name').textContent = religion.name;
    document.getElementById('religion-type').textContent = religion.type;

    hideAllPanels();
    religionPanel.classList.remove('hidden');
}


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
            showNationPanel(selection.nationId);
            requestRender();
        }
    };
    
    // Panel Close Buttons
    allPanels.forEach(panel => {
        panel.querySelector('.close-btn').onclick = () => {
            panel.classList.add('hidden');
            resetSelection();
        };
    });

    // Canvas Mouse Listeners
    let clickStartPosition = { x: 0, y: 0 };
    canvas.addEventListener('mousedown', (e) => {
        isPanning = false;
        clickStartPosition = { x: e.clientX, y: e.clientY };
        panStartPos = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('mousemove', (e) => {
        if (e.buttons === 1) {
            const dx = e.clientX - clickStartPosition.x;
            const dy = e.clientY - clickStartPosition.y;
            if (Math.hypot(dx, dy) > 5) isPanning = true;
            
            if (isPanning) {
                canvas.style.cursor = 'grabbing';
                viewport.x -= (e.clientX - panStartPos.x) / viewport.zoom;
                viewport.y -= (e.clientY - panStartPos.y) / viewport.zoom;
                panStartPos = { x: e.clientX, y: e.clientY };
                clampViewport();
                requestRender();
            }
        }
    });

    canvas.addEventListener('mouseup', (e) => {
        if (!isPanning) handleCanvasClick(e);
        isPanning = false;
        canvas.style.cursor = 'pointer';
    });

    canvas.addEventListener('mouseleave', () => { isPanning = false; canvas.style.cursor = 'pointer'; });
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
    
    const rect = canvas.getBoundingClientRect();
    const worldX = (e.clientX - rect.left) / viewport.zoom + viewport.x;
    const worldY = (e.clientY - rect.top) / viewport.zoom + viewport.y;
    const x = Math.floor(worldX / Config.TILE_SIZE);
    const y = Math.floor(worldY / Config.TILE_SIZE);
    if (x < 0 || x >= Config.GRID_WIDTH || y < 0 || y >= Config.GRID_HEIGHT) return;

    const countyId = world.countyGrid[y][x];
    if (countyId === null) {
        hideAllPanels();
        resetSelection();
        return;
    }
    const county = world.counties.get(countyId);

    // Mode-Specific Logic

    if (currentMapMode === 'culture') {
        const cultureGroup = world.cultures[county.culture];
        const clickedSubCulture = county.subCulture;

        if (!cultureGroup.isGroup) {
            // It's a monolithic culture, not a group
            selection.cultureGroupId = county.culture;
            selection.subCultureId = clickedSubCulture;
            showCulturePanel(county.culture);
        } else {
            // It's a culture group with multiple subcultures
            if (selection.subCultureId === clickedSubCulture) {
                resetSelection(false);
                hideAllPanels();
            } else if (selection.cultureGroupId === county.culture) {
                selection.subCultureId = clickedSubCulture;
                hideAllPanels();
            } else {
                resetSelection(false);
                selection.cultureGroupId = county.culture;
                showCulturePanel(county.culture);
            }
        }
        createRenderLayers();
    } else if (currentMapMode === 'religion') {
        resetSelection(false);
        const religionId = county.religion;
        selection.religionId = (selection.religionId === religionId) ? null : religionId;
        if (selection.religionId !== null) {
            showReligionPanel(religionId);
        } else {
            hideAllPanels();
        }
    } else if (currentMapMode === 'diplomatic') {
        resetSelection(false);
        const provinceId = county.parentId;
        const nationId = world.provinces.get(provinceId).parentId;
        selection.level = 1;
        selection.nationId = nationId;
        showNationPanel(nationId);
    } else { // Political, Physical, Development
        resetSelection(false);
        const provinceId = county.parentId;
        const nationId = world.provinces.get(provinceId).parentId;

        if (currentMapMode === 'development') {
            selection.level = 3; // Force county view in dev mode
        } else if (selection.countyId === countyId) {
            selection.level = (selection.level % 3) + 1;
        } else {
            selection.level = 3;
        }
        
        selection.nationId = nationId;
        selection.provinceId = provinceId;
        selection.countyId = countyId;

        if (selection.level === 3) showCountyPanel(countyId);
        else if (selection.level === 2) showProvincePanel(provinceId);
        else if (selection.level === 1) showNationPanel(nationId);
    }
    
    requestRender();
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
