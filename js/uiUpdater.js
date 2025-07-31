/* Handles all updates to the UI info panels, decoupling the main
application logic from direct DOM manipulation */

import { world } from './core/state.js';

const countyPanel = document.getElementById('county-panel');
const provincePanel = document.getElementById('province-panel');
const nationPanel = document.getElementById('nation-panel');
const culturePanel = document.getElementById('culture-panel');
const religionPanel = document.getElementById('religion-panel');
const allPanels = [countyPanel, provincePanel, nationPanel, culturePanel, religionPanel];

// Hides all information panels
export function hideAllPanels() {
    allPanels.forEach(p => p.classList.add('hidden'));
}

/**Displays and populates the county information panel
 * @param {number} countyId The ID of the county to display*/

export function showCountyPanel(countyId) {
    const county = world.counties.get(countyId);
    if (!county) return;
    const province = world.provinces.get(county.parentId);
    const cultureGroup = world.cultures[county.culture];
    const subCulture = world.subCultures[county.subCulture];
    const religion = world.religions[county.religion];

    document.getElementById('county-name').textContent = county.name;
    document.getElementById('county-province-name').textContent = province ? province.name : 'N/A';
    document.getElementById('county-dev').textContent = county.development;
    document.getElementById('county-biome').textContent = world.tiles[county.tiles.values().next().value].biome.name;
    
    if (cultureGroup && cultureGroup.isGroup && subCulture) {
        document.getElementById('county-culture').textContent = `${subCulture.name} (${cultureGroup.name})`;
    } else if (cultureGroup) {
        document.getElementById('county-culture').textContent = cultureGroup.name;
    }
    
    if(religion) document.getElementById('county-religion').textContent = religion.name;
    
    hideAllPanels();
    countyPanel.classList.remove('hidden');
}

/**Displays and populates the province information panel
 * @param {number} provinceId The ID of the province to display*/
export function showProvincePanel(provinceId) {
    const province = world.provinces.get(provinceId);
    if (!province) return;
    const nation = world.nations.get(province.parentId);

    document.getElementById('province-name').textContent = province.name;
    document.getElementById('province-nation-name').textContent = nation ? nation.name : 'N/A';
    document.getElementById('province-dev').textContent = province.development;

    hideAllPanels();
    provincePanel.classList.remove('hidden');
}

/**Displays and populates the nation information panel
 * @param {number} nationId The ID of the nation to display*/

export function showNationPanel(nationId) {
    const nation = world.nations.get(nationId);
    if (!nation) return;
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

/**Displays and populates the culture information panel
 * @param {number} cultureGroupId The ID of the culture group to display*/
export function showCulturePanel(cultureGroupId) {
    const cultureGroup = world.cultures.find(cg => cg.id === cultureGroupId);
    if (!cultureGroup) return;
    document.getElementById('culture-group-name').textContent = cultureGroup.name;
    
    const subCultureList = document.getElementById('subculture-list');
    subCultureList.innerHTML = '';
    const subCultures = world.subCultures.filter(sc => sc.parentCultureId === cultureGroupId);
    if (subCultures.length > 0) {
        subCultures.forEach(sc => {
            const li = document.createElement('li');
            li.textContent = sc.name;
            subCultureList.appendChild(li);
        });
    } else {
        const li = document.createElement('li');
        li.textContent = 'Monolithic Culture';
        li.style.fontStyle = 'italic';
        li.style.color = '#888';
        subCultureList.appendChild(li);
    }


    hideAllPanels();
    culturePanel.classList.remove('hidden');
}

/**Displays and populates the religion information panel
 * @param {number} religionId The ID of the religion to display*/

export function showReligionPanel(religionId) {
    const religion = world.religions.find(r => r.id === religionId);
    if (!religion) return;
    document.getElementById('religion-name').textContent = religion.name;
    document.getElementById('religion-type').textContent = religion.type;

    hideAllPanels();
    religionPanel.classList.remove('hidden');
}

// event listeners for the close buttons on all panels
export function setupPanelListeners() {
    allPanels.forEach(panel => {
        const closeBtn = panel.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.onclick = () => {
                panel.classList.add('hidden');
                // import resetSelection to avoid circular dependency issues
                import('./core/state.js').then(stateModule => {
                    stateModule.resetSelection();
                });
            };
        }
    });
}
