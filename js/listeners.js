/* Sets up core application event listeners for UI buttons and canvas clicks,
coordinating between user input, state changes, and UI updates*/

import { viewport, world, selection, resetSelection, generateAndRenderWorld, setPoliticalSelection, setCultureSelection, setReligionSelection, setDiplomaticSelection } from './core/state.js';
import * as Config from './core/config.js';
import { requestRender, currentMapMode, setMapMode } from './rendering/mainRenderer.js';
import { handleCanvasMouseUp } from './canvasControls.js';
import { hideAllPanels, showCountyPanel, showProvincePanel, showNationPanel, showCulturePanel, showReligionPanel } from './uiUpdater.js';

const canvas = document.getElementById("map");

// Handles the logic for a click on the canvas
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
            setCultureSelection(county.culture, clickedSubCulture);
            showCulturePanel(county.culture);
        } else {
            if (selection.subCultureId === clickedSubCulture) {
                resetSelection();
                hideAllPanels();
            } else if (selection.cultureGroupId === county.culture) {
                setCultureSelection(county.culture, clickedSubCulture);
                hideAllPanels();
            } else {
                setCultureSelection(county.culture, null);
                showCulturePanel(county.culture);
            }
        }
    } else if (currentMapMode === 'religion') {
        const religionId = county.religion;
        const newReligionId = (selection.religionId === religionId) ? null : religionId;
        setReligionSelection(newReligionId);
        if (newReligionId !== null) {
            showReligionPanel(religionId);
        } else {
            hideAllPanels();
        }
    } else if (currentMapMode === 'diplomatic') {
        const province = world.provinces.get(county.parentId);
        if (province) {
            setDiplomaticSelection(province.parentId);
            showNationPanel(province.parentId);
        }
    } else { // Political, Physical, Development
        const province = world.provinces.get(county.parentId);
        if (!province) return;

        let newLevel;
        if (currentMapMode === 'development') {
            newLevel = 3; // Dev mode always shows county
        } else if (selection.countyId === countyId) {
            // User is clicking the same spot again, cycle down
            newLevel = (selection.level % 3) + 1; // 1->2, 2->3, 3->1
        } else {
            // User is clicking a new spot, start at the nation level
            newLevel = 1;
        }
        
        setPoliticalSelection(province.parentId, county.parentId, countyId, newLevel);

        if (newLevel === 3) showCountyPanel(countyId);
        else if (newLevel === 2) showProvincePanel(county.parentId);
        else if (newLevel === 1) showNationPanel(province.parentId);
    }
}

// Sets up the core application listeners (UI buttons, canvas click handler)
export function setupCoreListeners() {
    // Generate Button
    document.getElementById('generateButton').onclick = generateAndRenderWorld;

    // Map Mode Buttons
    document.getElementById('physicalButton').onclick = () => setMapMode('physical');
    document.getElementById('politicalButton').onclick = () => setMapMode('political');
    document.getElementById('developmentButton').onclick = () => setMapMode('development');
    document.getElementById('cultureButton').onclick = () => setMapMode('culture');
    document.getElementById('religionButton').onclick = () => setMapMode('religion');
    document.getElementById('diplomaticButton').onclick = () => {
        setMapMode('diplomatic');
        if (world.nations && world.nations.size > 0) {
            // Select the most powerful nation by default
            const mostPowerful = Array.from(world.nations.values()).sort((a,b) => b.power - a.power)[0];
            setDiplomaticSelection(mostPowerful.id);
            showNationPanel(mostPowerful.id);
        }
    };

    // Canvas Click Handler
    // We pass the click handler to the canvas controls module
    canvas.addEventListener('mouseup', (e) => {
        handleCanvasMouseUp(e, handleCanvasClick);
    });
}
