/* Handles all updates to the UI info panels, decoupling the main
application logic from direct DOM manipulation */

import { world } from './core/state.js';
import { GOVERNMENT_DEFINITIONS, GOVERNMENT_TYPES } from './core/config.js';

const countyPanel = document.getElementById('county-panel');
const polityPanel = document.getElementById('polity-panel');
const culturePanel = document.getElementById('culture-panel');
const religionPanel = document.getElementById('religion-panel');
const factionPanel = document.getElementById('faction-panel');
const ledgerPanel = document.getElementById('ledger-panel');
const allPanels = [countyPanel, polityPanel, culturePanel, religionPanel, factionPanel, ledgerPanel];

// Hides all information panels
export function hideAllPanels() {
    allPanels.forEach(p => p.classList.add('hidden'));
}

/**Displays and populates the county information panel
 * @param {number} countyId The ID of the county to display*/

export function showCountyPanel(countyId) {
    const county = world.counties.get(countyId);
    if (!county) return;
    const polity = world.polities.get(county.polityId);
    const cultureGroup = world.cultures[county.culture];
    const subCulture = world.subCultures[county.subCulture];
    const religion = world.religions[county.religion];

    document.getElementById('county-name').textContent = county.name;
    document.getElementById('county-polity-name').textContent = polity ? polity.name : 'N/A';
    document.getElementById('county-dev').textContent = county.development;
    
    const tile = world.tiles[county.tiles.values().next().value];
    if(tile) document.getElementById('county-biome').textContent = tile.biome.name;
    
    if (cultureGroup && cultureGroup.isGroup && subCulture) {
        document.getElementById('county-culture').textContent = `${subCulture.name} (${cultureGroup.name})`;
    } else if (cultureGroup) {
        document.getElementById('county-culture').textContent = cultureGroup.name;
    }
    
    if(religion) document.getElementById('county-religion').textContent = religion.name;
    
    hideAllPanels();
    countyPanel.classList.remove('hidden');
}

/**Displays and populates the polity information panel
 * @param {number} polityId The ID of the polity to display*/

export function showPolityPanel(polityId) {
    const polity = world.polities.get(polityId);
    if (!polity) return;

    document.getElementById('polity-title').textContent = `${polity.title} of ${polity.name}`;
    
    const suzerain = polity.suzerain !== null ? world.polities.get(polity.suzerain) : null;
    document.getElementById('polity-suzerain-name').textContent = suzerain ? suzerain.name : 'Independent';

    document.getElementById('polity-power').textContent = polity.power.toFixed(0);

    if (polity.government && GOVERNMENT_DEFINITIONS[polity.government]) {
        document.getElementById('polity-government').textContent = GOVERNMENT_DEFINITIONS[polity.government].name;
    }

    if (polity.ruler) {
        if (polity.government === GOVERNMENT_TYPES.MERCHANT_REPUBLIC) {
            document.getElementById('polity-ruler-name').textContent = `Doge ${polity.ruler.firstName}`;
        } else if (polity.dynasty) {
            document.getElementById('polity-ruler-name').textContent = `${polity.ruler.firstName} ${polity.dynasty.name}`;
        } else {
             document.getElementById('polity-ruler-name').textContent = polity.ruler.firstName;
        }
        document.getElementById('polity-ruler-adm').textContent = polity.ruler.stats.adm;
        document.getElementById('polity-ruler-dip').textContent = polity.ruler.stats.dip;
        document.getElementById('polity-ruler-mil').textContent = polity.ruler.stats.mil;
    }

    //Update Realm Laws
    const realmLawsSection = document.getElementById('polity-realm-laws');
    if (polity.suzerain === null && polity.laws) {
        document.getElementById('polity-crown-authority').textContent = polity.laws.crownAuthority;
        document.getElementById('polity-succession-law').textContent = polity.laws.succession;
        realmLawsSection.style.display = 'block';
    } else {
        realmLawsSection.style.display = 'none';
    }

    //Update Factions
    const factionsContainer = document.getElementById('polity-factions-container');
    const factionsList = document.getElementById('polity-factions');
    factionsList.innerHTML = '';

    if (polity.suzerain === null) {
        // Hide Factions section for independent rulers
        factionsContainer.style.display = 'none';
    } else {
        // Show Factions section for vassals
        factionsContainer.style.display = 'block';

        // Find the TOP-LEVEL suzerain to check for factions
        let topLevelSuzerain = polity;
        while (topLevelSuzerain.suzerain !== null && world.polities.has(topLevelSuzerain.suzerain)) {
            topLevelSuzerain = world.polities.get(topLevelSuzerain.suzerain);
        }
        
        const factionJoined = topLevelSuzerain?.factions?.find(f => f.members.includes(polity.id));

        if (factionJoined) {
            const li = document.createElement('li');
            li.textContent = `Member of the "${factionJoined.name}"`;
            factionsList.appendChild(li);
        } else {
            factionsList.innerHTML = '<li>None</li>';
        }
    }

    //Update Diplomacy
    const alliesList = document.getElementById('polity-allies');
    alliesList.innerHTML = '';
    if (polity.allies && polity.allies.size > 0) {
        polity.allies.forEach(allyId => {
            const ally = world.polities.get(allyId);
            if (ally) {
                const li = document.createElement('li');
                li.textContent = `${ally.name} (${polity.opinions.get(allyId)})`;
                alliesList.appendChild(li);
            }
        });
    } else {
        alliesList.innerHTML = '<li>None</li>';
    }

    const enemiesList = document.getElementById('polity-enemies');
    enemiesList.innerHTML = '';
    if (polity.atWarWith && polity.atWarWith.size > 0) {
        polity.atWarWith.forEach(enemyId => {
            const enemy = world.polities.get(enemyId);
            if (enemy) {
                const li = document.createElement('li');
                li.textContent = `${enemy.name} (${polity.opinions.get(enemyId)})`;
                enemiesList.appendChild(li);
            }
        });
    } else {
        enemiesList.innerHTML = '<li>None</li>';
    }

    const vassalList = document.getElementById('polity-vassals');
    vassalList.innerHTML = '';
    if (polity.vassals && polity.vassals.size > 0) {
        polity.vassals.forEach(vassalId => {
            const vassal = world.polities.get(vassalId);
            if (vassal) {
                const li = document.createElement('li');
                li.textContent = `${vassal.title} of ${vassal.name} (Liberty Desire: ${vassal.libertyDesire}%)`;
                vassalList.appendChild(li);
            }
        });
    } else {
        vassalList.innerHTML = '<li>None</li>';
    }
    
    hideAllPanels();
    polityPanel.classList.remove('hidden');
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

export function showFactionPanel(factionLeaderId, suzerainId) {
    const suzerain = world.polities.get(suzerainId);
    if (!suzerain || !suzerain.factions) return;

    const faction = suzerain.factions.find(f => f.leader === factionLeaderId);
    if (!faction) return;

    document.getElementById('faction-name').textContent = faction.name;
    document.getElementById('faction-power').textContent = Math.round(faction.power);

    const membersList = document.getElementById('faction-members');
    membersList.innerHTML = '';
    faction.members.forEach(memberId => {
        const member = world.polities.get(memberId);
        if (member) {
            const li = document.createElement('li');
            li.textContent = `${member.title} of ${member.name}`;
            membersList.appendChild(li);
        }
    });

    hideAllPanels();
    factionPanel.classList.remove('hidden');
}

/**
 * Displays the ledger panel.
 */
export function showLedgerPanel() {
    hideAllPanels();
    ledgerPanel.classList.remove('hidden');
}

// event listeners for the close buttons on all panels
export function setupPanelListeners() {
    allPanels.forEach(panel => {
        const closeBtn = panel.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.onclick = () => {
                panel.classList.add('hidden');
                // The ledger doesn't represent a "selection", so no need to reset it.
                if (panel.id !== 'ledger-panel') {
                    import('./core/state.js').then(stateModule => {
                        stateModule.resetSelection();
                    });
                }
            };
        }
    });
}