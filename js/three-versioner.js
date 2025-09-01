/**
 * Project: Three.js JSON Font Editor
 * File: editor/js/three-versioner.js
 * Created: 2025-08-29
 * Author: @lewopxd
 *
 * Description:
 * This module encapsulates all functionality for the Three.js version
 * selector modal, including API fetching, UI rendering, and viewer
 * reload logic.
 */

const THREEJS_API_URL = "https://api.cdnjs.com/libraries/three.js?fields=version,versions";
const THREEJS_CDN_BASE = "https://cdnjs.cloudflare.com/ajax/libs/three.js/";

let versionsData = {};
let modalSelectionState = { url: null, version: null };
let currentLoadedVersion = "r128";
let currentIframeUrl = `${THREEJS_CDN_BASE}${currentLoadedVersion}/three.min.js`;
let modalInitialized = false;
let dependencies = { ui: null, viewer: null, utils: null };

/**
 * Initializes the Three.js versioner module.
 * @param {object} injectedDependencies - An object containing references to other modules.
 */
function initThreeVersioner(injectedDependencies) {
    dependencies = injectedDependencies;
    displayInitialVersion();
    loadThreejsVersions();
    document.getElementById('version-display').addEventListener('click', toggleVersionModal);
}

/**
 * Fetches the list of Three.js versions using a Web Worker.
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
 * @param {string} version - The version string.
 */
async function fetchVersionManifest(version) {
    const container = document.getElementById('fileCardContainer');
    container.classList.add('loading');
    document.getElementById('apply-error-message').style.display = 'none';

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

/**
 * Toggles the visibility of the version selector modal.
 */
function toggleVersionModal() {
    const modal = document.getElementById('versionModal');
    const versionDisplayBtn = document.getElementById('version-display');
    const isVisible = modal.classList.contains('show');

    if (isVisible) {
        versionDisplayBtn.classList.remove('active');
        modal.classList.remove('show');
    } else {
        if (!modalInitialized) {
            initializeVersionModal();
        }
        dependencies.utils.positionModal(modal, versionDisplayBtn);
        dependencies.utils.bringToFront(modal);
        versionDisplayBtn.classList.add('active');
        modal.classList.add('show');
        syncModalToCurrentVersion();
        fetchVersionManifest(currentLoadedVersion);
    }
}

/**
 * Sets up the event listeners and initial state of the modal's dropdowns.
 */
function initializeVersionModal() {
    const categoryTrigger = document.getElementById('categoryTrigger');
    const categoryPanel = document.getElementById('categoryPanel');
    const categoryList = document.getElementById('categoryList');
    const versionTrigger = document.getElementById('versionTrigger');
    const versionPanel = document.getElementById('versionPanel');
    const versionList = document.getElementById('versionListCustom');

    const groupDisplayNames = { latest: "Latest", semantic: "Semantic", release: "Release (r)", simple: "Simple" };
    Object.keys(groupDisplayNames).forEach(key => {
        const li = document.createElement('li');
        li.dataset.value = key;
        li.textContent = groupDisplayNames[key];
        categoryList.appendChild(li);
    });

    categoryTrigger.addEventListener('click', (e) => { e.stopPropagation(); versionPanel.classList.remove('show'); categoryPanel.classList.toggle('show'); });
    versionTrigger.addEventListener('click', (e) => { e.stopPropagation(); categoryPanel.classList.remove('show'); versionPanel.classList.toggle('show'); });
    window.addEventListener('click', () => { categoryPanel.classList.remove('show'); versionPanel.classList.remove('show'); });

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
 * @param {string} category - The selected category.
 */
function populateVersionNumberDropdown(category) {
    const versionList = document.getElementById('versionListCustom');
    const versionTrigger = document.getElementById('versionTrigger');
    versionList.innerHTML = '';

    let versions = (category === 'latest') ? [versionsData.latest] : (versionsData.all[category] || []);
    const sorted = versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

    sorted.forEach(v => {
        const li = document.createElement('li');
        li.dataset.value = v;
        li.textContent = v;
        versionList.appendChild(li);
    });

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
 */
function renderFileCards(files, version) {
    const container = document.getElementById('fileCardContainer');
    container.innerHTML = '';
    const applyBtn = document.getElementById('applyVersionBtn');
    
    applyBtn.classList.add('is-disabled');
    modalSelectionState = { url: null, version: null };

    if (!files || files.length === 0) {
        container.innerHTML = '<div class="loader-placeholder">No files found for this version.</div>';
        return;
    }

    // El filtro ha sido eliminado. Ahora iteramos sobre el array 'files' original.
    files.forEach(file => {
        const fullUrl = `${THREEJS_CDN_BASE}${version}/${file}`;
        const card = document.createElement('div');
        card.className = 'file-card';
        card.dataset.url = fullUrl;
        card.dataset.version = version;
        
        card.innerHTML = `
            <span class="file-card-url" title="${file}">${file}</span>
            <button class="file-card-copy-btn" data-tooltip="Copy URL" onclick="copyCardUrl(event, '${fullUrl}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
        `;

        if (fullUrl === currentIframeUrl) {
            card.classList.add('selected');
            modalSelectionState = { url: fullUrl, version: version };
            applyBtn.classList.remove('is-disabled');
        }

        card.addEventListener('click', (e) => {
            if (e.target.closest('.file-card-copy-btn')) return;
            
            container.querySelector('.file-card.selected')?.classList.remove('selected');
            card.classList.add('selected');
            modalSelectionState = { url: fullUrl, version: version };
            applyBtn.classList.remove('is-disabled');
            document.getElementById('apply-error-message').style.display = 'none';
        });
        container.appendChild(card);
    });
    dependencies.utils.initSmartTooltips();
}

/**
 * Updates the main version display button.
 */
function displayInitialVersion() {
    document.getElementById('version-text').textContent = `Three.js ${currentLoadedVersion}`;
}

/**
 * Syncs the modal's dropdowns to reflect the currently loaded version.
 */
function syncModalToCurrentVersion() {
    if (!versionsData.all) return;
    let category = 'release';
    if (versionsData.all.semantic.includes(currentLoadedVersion)) category = 'semantic';
    else if (versionsData.all.simple.includes(currentLoadedVersion)) category = 'simple';
    
    document.getElementById('categoryTrigger').textContent = document.querySelector(`#categoryList li[data-value="${category}"]`).textContent;
    populateVersionNumberDropdown(category);

    document.getElementById('versionTrigger').textContent = currentLoadedVersion;
    document.getElementById('versionTrigger').dataset.value = currentLoadedVersion;
}

/**
 * Helper function to copy a file URL from a card to the clipboard.
 * @param {Event} event - The click event.
 * @param {string} url - The URL to copy.
 */
function copyCardUrl(event, url) {
    event.stopPropagation();
    navigator.clipboard.writeText(url).then(() => {
        dependencies.utils.showToastMessage('URL copied!');
    }).catch(err => {
        console.error('Failed to copy URL: ', err);
    });
}

/**
 * Handles the click on the "Apply & Reload" button.
 */
function applyThreeJsVersion() {
    const errorMsg = document.getElementById('apply-error-message');
    if (!modalSelectionState.url) {
        errorMsg.textContent = 'Please select an asset to apply.';
        errorMsg.style.display = 'block';
        return;
    }
    errorMsg.style.display = 'none';

    if (modalSelectionState.url === currentIframeUrl) {
        dependencies.utils.showConfirmationModal({
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
 */
function proceedWithReload() {
    if (!modalSelectionState.url || !modalSelectionState.version) return;

    currentLoadedVersion = modalSelectionState.version;
    currentIframeUrl = modalSelectionState.url;
    
    dependencies.utils.showToastMessage(`Reloading with Three.js ${currentLoadedVersion}...`);
    displayInitialVersion();
    toggleVersionModal();

    dependencies.viewer.reloadWithState(currentIframeUrl);}

export {
    initThreeVersioner,
    toggleVersionModal,
    applyThreeJsVersion,
    copyCardUrl // Export so main.js can attach it to window
};