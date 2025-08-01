/* Sets up core application event listeners for UI buttons and canvas clicks,
coordinating between user input, state changes, and UI updates*/

import { viewport, world, selection, resetSelection, generateAndRenderWorld, setPoliticalSelection, setCultureSelection, setReligionSelection } from './core/state.js';
import * as Config from './core/config.js';
import { currentMapMode, setMapMode, updatePoliticalLayer, requestRender } from './rendering/mainRenderer.js';
import { handleCanvasMouseUp } from './canvasControls.js';
import { hideAllPanels, showCountyPanel, showPolityPanel, showCulturePanel, showReligionPanel } from './uiUpdater.js';

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
        resetSelection();
        hideAllPanels();
        return;
    }
    const county = world.counties.get(countyId);
    const polity = world.polities.get(county.polityId);
    let realm = polity;
    while (realm.suzerain !== null) {
        realm = world.polities.get(realm.suzerain);
    }
    
    if (currentMapMode === 'political' || currentMapMode === 'diplomatic') {
        let newLevel, newRealmId, newPolityId, newCountyId;

        if (selection.level === 0) { // No selection -> Select Realm
            newLevel = 1; newRealmId = realm.id; newPolityId = realm.id; newCountyId = null;
            showPolityPanel(realm.id);
        } else if (selection.level === 1) { // Realm selected
            if (selection.realmId === realm.id) { // Clicking inside the same realm
                newLevel = 2; newRealmId = realm.id; newPolityId = polity.id;
                showPolityPanel(polity.id);
            } else { // Clicking a new realm
                newLevel = 1; newRealmId = realm.id; newPolityId = realm.id; newCountyId = null;
                showPolityPanel(realm.id);
            }
        } else if (selection.level === 2) { // Vassal/Polity selected
            if (selection.polityId === polity.id) { // Clicking inside same polity
                newLevel = 3; newRealmId = realm.id; newPolityId = polity.id; newCountyId = countyId;
                showCountyPanel(countyId);
            } else { // Clicking a different polity (cycle back to realm selection)
                 newLevel = 1; newRealmId = realm.id; newPolityId = realm.id; newCountyId = null;
                 showPolityPanel(realm.id);
            }
        } else if (selection.level === 3) { // County selected
             if (selection.countyId === countyId) { // Clicking same county, cycle back to realm
                newLevel = 1; newRealmId = realm.id; newPolityId = realm.id; newCountyId = null;
                showPolityPanel(realm.id);
             } else { // Clicking a new county
                newLevel = 3; newRealmId = realm.id; newPolityId = polity.id; newCountyId = countyId;
                showCountyPanel(countyId);
             }
        }
        
        setPoliticalSelection(newLevel, newRealmId, newPolityId, newCountyId);
        updatePoliticalLayer();

    } else if (currentMapMode === 'development') {
        // Select the lowest administrative division (county) directly
        const clickedCountyId = county.id;
        if (selection.countyId === clickedCountyId) {
            // If clicking the same county, deselect it
            resetSelection();
            hideAllPanels();
        } else {
            // Otherwise, select the new county
            // Set level 3 for county selection
            setPoliticalSelection(3, realm.id, polity.id, clickedCountyId);
            showCountyPanel(clickedCountyId);
            requestRender(); // Request a render to show the highlight
        }

    } else if (currentMapMode === 'culture') {
        const cultureGroup = world.cultures.find(c => c.id === county.culture);
        const clickedSubCulture = county.subCulture;

        if (!cultureGroup) return;

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
    }
}

// Sets up the core application listeners (UI buttons, canvas click handler)
export function setupCoreListeners() {
    document.getElementById('generateButton').onclick = generateAndRenderWorld;

    // Map Mode Buttons
    document.getElementById('physicalButton').onclick = () => setMapMode('physical');
    document.getElementById('politicalButton').onclick = () => setMapMode('political');
    document.getElementById('developmentButton').onclick = () => setMapMode('development');
    document.getElementById('cultureButton').onclick = () => setMapMode('culture');
    document.getElementById('religionButton').onclick = () => setMapMode('religion');
    
    document.getElementById('diplomaticButton').onclick = () => {
        setMapMode('diplomatic');
        if (world.polities && world.topLevelPolities.size > 0 && selection.level === 0) {
            const mostPowerful = Array.from(world.topLevelPolities).map(id => world.polities.get(id)).sort((a,b) => b.power - a.power)[0];
            setPoliticalSelection(1, mostPowerful.id, mostPowerful.id, null);
            showPolityPanel(mostPowerful.id);
            updatePoliticalLayer();
        }
    };

    canvas.addEventListener('mouseup', (e) => {
        handleCanvasMouseUp(e, handleCanvasClick);
    });
}
