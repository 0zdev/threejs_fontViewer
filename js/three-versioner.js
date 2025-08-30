/**
 * Project: Three.js JSON Font Editor
 * File: editor/js/three-versioner.js
 * Created: 2025-08-29
 * Author: [Tu Nombre/Apodo]
 *
 * Description:
 * This module encapsulates all functionality for the Three.js version
 * selector modal, including API fetching, UI rendering, and viewer
 * reload logic.
 */

//-------------------------------------------------------------
//--------------------[   MODULE STATE   ]---------------------
//-------------------------------------------------------------

const THREEJS_API_URL = "https://api.cdnjs.com/libraries/three.js?fields=version,versions";
const THREEJS_CDN_BASE = "https://cdnjs.cloudflare.com/ajax/libs/three.js/";

let versionsData = {}; // Will store { latest, all: { semantic, release, simple } }
let modalSelectionState = { url: null, version: null };
let currentLoadedVersion = "r128"; // Default version
let currentIframeUrl = `${THREEJS_CDN_BASE}${currentLoadedVersion}/three.min.js`;
let modalInitialized = false;

// Dependencies injected from main.js
let dependencies = {
    ui: null,
    viewer: null
};
//----------------------------------------> END [MODULE STATE]


//-------------------------------------------------------------
//--------------------[   INITIALIZATION   ]-------------------
//-------------------------------------------------------------

/**
 * Initializes the Three.js versioner module.
 * @param {object} injectedDependencies - An object containing references to other modules.
 * @returns {void}
 */
function initThreeVersioner(injectedDependencies) {
    dependencies = injectedDependencies;
    displayInitialVersion();
    loadThreejsVersions();
    document.getElementById('version-display').addEventListener('click', toggleVersionModal);
}
//----------------------------------------> END [INITIALIZATION]


//-------------------------------------------------------------
//------------------[   API DATA FETCHING   ]------------------
//-------------------------------------------------------------

/**
 * Fetches the list of all available Three.js versions from the cdnjs API using a Web Worker.
 * @returns {void}
 */
function loadThreejsVersions() {
    const workerCode = `
        self.onmessage = async (e) => {
            const { apiUrl } = e.data;
            try {
                const response = await fetch(apiUrl);
                if (!response.ok) throw new Error('API Error: ' + response.statusText);
                const data = await response.json();
                if (!data.versions || !Array.isArray(data.versions)) {
                    self.postMessage({ error: "No 'versions' array in API response." });
                    return;
                }
                const result = { latest: data.version, all: { semantic: [], release: [], simple: [] } };
                data.versions.forEach(v => {
                    if (v.includes('.')) result.all.semantic.push(v);
                    else if (v.startsWith('r')) result.all.release.push(v);
                    else result.all.simple.push(v);
                });
                self.postMessage({ versionsData: result });
            } catch (error) {
                self.postMessage({ error: error.message });
            }
        };
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));

    worker.onmessage = (e) => {
        if (e.data.error) {
            dependencies.ui.handle_error(new Error(e.data.error));
            return;
        }
        if (e.data.versionsData) {
            versionsData = e.data.versionsData;
            // Animate the version button to signal that data is loaded
            const versionDisplayBtn = document.getElementById('version-display');
            setTimeout(() => {
                versionDisplayBtn.classList.add('shine-text-animate');
                setTimeout(() => versionDisplayBtn.classList.remove('shine-text-animate'), 1200);
            }, 900);
        }
    };

    worker.postMessage({ apiUrl: THREEJS_API_URL });
}

/**
 * Fetches the file manifest for a specific Three.js version.
 * @param {string} version - The version string (e.g., "r128", "0.145.0").
 * @returns {Promise<void>}
 */
async function fetchVersionManifest(version) {
    const container = document.getElementById('fileCardContainer');
    container.classList.add('loading');

    try {
        const manifestApiUrl = `https://api.cdnjs.com/libraries/three.js/${version}`;
        const response = await fetch(manifestApiUrl);
        if (!response.ok) throw new Error(`API Error ${response.status}`);
        const data = await response.json();
        renderFileCards(data.files, version);
    } catch (error) {
        container.innerHTML = `<div class="loader-placeholder">Error loading manifest: ${error.message}</div>`;
    } finally {
        container.classList.remove('loading');
    }
}
//----------------------------------------> END [API DATA FETCHING]


//-------------------------------------------------------------
//-------------[   MODAL STATE & VISIBILITY   ]----------------
//-------------------------------------------------------------

/**
 * Toggles the visibility of the version selector modal.
 * @returns {void}
 */
function toggleVersionModal() {
    const modal = document.getElementById('versionModal');
    const versionDisplayBtn = document.getElementById('version-display');
    const isVisible = modal.classList.contains('show');

    if (isVisible) {
        versionDisplayBtn.classList.remove('active');
        modal.classList.remove('show');
    } else {
        if (!modalInitialized && versionsData.latest) {
            initializeVersionModal();
        }
        // positionModal(modal); // This utility can be added to utils.js if needed
        dependencies.ui.bringToFront(modal); // Assuming bringToFront is in ui-manager or utils
        versionDisplayBtn.classList.add('active');
        modal.classList.add('show');

        // Sync modal UI with current loaded version
        syncModalToCurrentVersion();
        fetchVersionManifest(currentLoadedVersion);
    }
}
//----------------------------------------> END [MODAL STATE & VISIBILITY]


//-------------------------------------------------------------
//-------------[   MODAL UI RENDERING & SETUP   ]--------------
//-------------------------------------------------------------

/**
 * Sets up the event listeners and initial state of the modal's dropdowns.
 * Only runs once.
 * @returns {void}
 */
function initializeVersionModal() {
    const categoryTrigger = document.getElementById('categoryTrigger');
    const categoryPanel = document.getElementById('categoryPanel');
    const categoryList = document.getElementById('categoryList');
    const versionTrigger = document.getElementById('versionTrigger');
    const versionPanel = document.getElementById('versionPanel');
    const versionList = document.getElementById('versionListCustom');

    const groupDisplayNames = { latest: "Latest", semantic: "Semantic", release: "Release (r)", simple: "Simple" };
    
    // Populate category dropdown
    Object.keys(groupDisplayNames).forEach(key => {
        const li = document.createElement('li');
        li.dataset.value = key;
        li.textContent = groupDisplayNames[key];
        categoryList.appendChild(li);
    });

    // Dropdown open/close logic
    categoryTrigger.addEventListener('click', (e) => { e.stopPropagation(); versionPanel.classList.remove('show'); categoryPanel.classList.toggle('show'); });
    versionTrigger.addEventListener('click', (e) => { e.stopPropagation(); categoryPanel.classList.remove('show'); versionPanel.classList.toggle('show'); });
    window.addEventListener('click', () => { categoryPanel.classList.remove('show'); versionPanel.classList.remove('show'); });

    // Item selection logic
    categoryList.addEventListener('click', (e) => {
        if (e.target.tagName === 'LI' && e.target.dataset.value) {
            categoryTrigger.textContent = e.target.textContent;
            populateVersionNumberDropdown(e.target.dataset.value);
            fetchVersionManifest(versionTrigger.dataset.value);
        }
    });
    versionList.addEventListener('click', (e) => {
        if (e.target.tagName === 'LI' && e.target.dataset.value) {
            versionTrigger.textContent = e.target.dataset.value;
            versionTrigger.dataset.value = e.target.dataset.value;
            fetchVersionManifest(e.target.dataset.value);
        }
    });

    modalInitialized = true;
}

/**
 * Populates the version number dropdown based on the selected category.
 * @param {string} category - The selected category ('latest', 'semantic', etc.).
 * @returns {void}
 */
function populateVersionNumberDropdown(category) {
    const versionList = document.getElementById('versionListCustom');
    const versionTrigger = document.getElementById('versionTrigger');
    versionList.innerHTML = ''; // Clear previous items

    let versions = (category === 'latest') ? [versionsData.latest] : (versionsData.all[category] || []);
    const sorted = versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

    sorted.forEach(v => {
        const li = document.createElement('li');
        li.dataset.value = v;
        li.textContent = v;
        versionList.appendChild(li);
    });

    // Set the trigger to the first available version in the new list
    if (sorted.length > 0) {
        versionTrigger.textContent = sorted[0];
        versionTrigger.dataset.value = sorted[0];
    } else {
        versionTrigger.textContent = 'N/A';
        versionTrigger.dataset.value = '';
    }
}

/**
 * Renders the list of files for a given version.
 * @param {Array<string>} files - An array of file names.
 * @param {string} version - The version string.
 * @returns {void}
 */
function renderFileCards(files, version) {
    const container = document.getElementById('fileCardContainer');
    container.innerHTML = '';
    const applyBtn = document.getElementById('applyVersionBtn');
    
    // Disable apply button until a file is selected
    applyBtn.classList.add('is-disabled');
    modalSelectionState = { url: null, version: null };

    if (!files || files.length === 0) {
        container.innerHTML = '<div class="loader-placeholder">No files found.</div>';
        return;
    }

    files.forEach(file => {
        const fullUrl = `${THREEJS_CDN_BASE}${version}/${file}`;
        const card = document.createElement('div');
        card.className = 'file-card';
        card.dataset.url = fullUrl;
        card.dataset.version = version;
        
        // ... (HTML for card content remains the same)

        if (fullUrl === currentIframeUrl) {
            card.classList.add('selected');
        }

        card.addEventListener('click', () => {
            container.querySelector('.file-card.selected')?.classList.remove('selected');
            card.classList.add('selected');
            modalSelectionState = { url: fullUrl, version: version };
            applyBtn.classList.remove('is-disabled');
        });
        container.appendChild(card);
    });
}

/**
 * Updates the main version display button with the current version.
 * @returns {void}
 */
function displayInitialVersion() {
    document.getElementById('version-text').textContent = `Three.js ${currentLoadedVersion}`;
}

/**
 * Syncs the modal's dropdowns to reflect the currently loaded version.
 * @returns {void}
 */
function syncModalToCurrentVersion() {
    let category = 'release'; // Default
    if (currentLoadedVersion.includes('.')) category = 'semantic';
    else if (!currentLoadedVersion.startsWith('r')) category = 'simple';
    
    document.getElementById('categoryTrigger').textContent = document.querySelector(`#categoryList li[data-value="${category}"]`).textContent;
    populateVersionNumberDropdown(category);

    document.getElementById('versionTrigger').textContent = currentLoadedVersion;
    document.getElementById('versionTrigger').dataset.value = currentLoadedVersion;
}
//----------------------------------------> END [MODAL UI RENDERING & SETUP]


//-------------------------------------------------------------
//--------------[   USER ACTIONS & RELOAD LOGIC   ]------------
//-------------------------------------------------------------

/**
 * Handles the click on the "Apply & Reload" button.
 * @returns {void}
 */
function applyThreeJsVersion() {
    if (!modalSelectionState.url) return;

    if (modalSelectionState.url === currentIframeUrl) {
        dependencies.ui.showConfirmationModal({
            title: "Action Confirmation",
            text: "This version is already loaded. Do you want to proceed with a reload?",
            buttons: [ { label: 'Cancel' }, { label: 'OK', callback: proceedWithReload } ]
        });
    } else {
        proceedWithReload();
    }
}

/**
 * Executes the viewer reload process.
 * @returns {void}
 */
function proceedWithReload() {
    if (!modalSelectionState.url || !modalSelectionState.version) return;

    // Cache the viewer state before reloading
    dependencies.viewer.cacheState();

    // Update global state and UI
    currentLoadedVersion = modalSelectionState.version;
    currentIframeUrl = modalSelectionState.url;
    
    dependencies.ui.showToastMessage(`Reloading with Three.js ${currentLoadedVersion}...`);
    displayInitialVersion();
    toggleVersionModal();

    // Start the safe reload handshake via the viewer bridge
    dependencies.viewer.requestViewerState(currentIframeUrl);
}
//----------------------------------------> END [USER ACTIONS & RELOAD LOGIC]


 
export {
    initThreeVersioner,
    toggleVersionModal, // Needed for onclick
    applyThreeJsVersion // Needed for onclick
};