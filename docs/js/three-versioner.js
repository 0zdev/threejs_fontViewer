/**
 * Project: Three.js JSON Font Editor
 * File: editor/js/three-versioner.js
 * (Final Refactor with Explicit Version Ranges and DRY Principle)
 */

//-------------------------------------------------------------
//--------------------[   MODULE STATE   ]---------------------
//-------------------------------------------------------------

const CDNS = {
    jsdelivr: {
        Api: "https://data.jsdelivr.com/v1/packages/npm/three",
        assetsBase: "https://cdn.jsdelivr.net/npm/three"
    },
    cdnjs: {
        Api: "https://api.cdnjs.com/libraries/three.js",
        assetsBase: "https://cdnjs.cloudflare.com/ajax/libs/three.js",
        versionsQuery: "fields=version,versions"

    }
};

const allowedFiles = ['three.js', 'three.min.js', 'three.module.js', 'three.module.min.js'];
let PRESET_VERSIONS = {

    "0.158.0": { version: "0.158.0", asset_url: "https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.min.js" },
    "0.150.0": { version: "0.150.0", asset_url: "https://cdn.jsdelivr.net/npm/three@0.150.0/build/three.module.js" },
    "0.137.0": { version: "0.137.0", asset_url: "https://cdn.jsdelivr.net/npm/three@0.137.0/build/three.min.js" },
    "r128": { version: "r128", asset_url: "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js" },
    "0.110.0": { version: "r110", asset_url: "https://cdnjs.cloudflare.com/ajax/libs/three.js/r110/three.min.js" }
};


let cdnjsVersionsData = {};
let jsdelivrVersionsData = {};
let activeCdn = 'jsdelivr'; // Default CDN

let modalSelectionState = { url: null, version: null };
let currentLoadedVersion = "";
let currentIframeUrl = "";
let modalInitialized = false;
let isPositionedInitially = false;
let dependencies = { ui: null, viewer: null, utils: null };
let lastUserSelectedAsset = null;

//----------------------------------------> END [MODULE STATE]


//-------------------------------------------------------------
//--------------------[   HELPER FUNCTIONS   ]-----------------
//-------------------------------------------------------------

/**
 * Extracts the version string from a CDN URL.
 * @param {string} url - The full URL to a Three.js file.
 * @returns {string|null} The version string (e.g., "0.145.0" or "r128").
 * @private
 */
function _extractVersion(url) {
    if (!url) return null;
    const match = url.match(/three(?:@|\.js\/)([0-9r.]+[0-9])/);
    return match ? match[1] : null;
}

/**
 * Normalizes a version string from various formats into a standard semantic version.
 * e.g., "r145" -> "0.145.0", "145" -> "0.145.0", "0.145.0" -> "0.145.0".
 * @param {string} versionString - The version string to normalize.
 * @returns {string} The normalized semantic version string.
 * @private
 */
function _normalizeVersion(versionString) {
    if (!versionString) return '0.0.0';

    if (versionString.startsWith('r')) {
        return `0.${versionString.slice(1)}.0`;
    }

    if (/^[0-9]+$/.test(versionString)) {
        return `0.${versionString}.0`;
    }

    return versionString;
}

/**
 * Performs a semantic version comparison to check if a version is within a given range.
 * @param {string} versionToCheck - The version string to evaluate.
 * @param {string} rangeStart - The start of the range (inclusive).
 * @param {string} rangeEnd - The end of the range (inclusive).
 * @returns {boolean} True if the version is within the range.
 * @private
 */
function _isVersionInRange(versionToCheck, rangeStart, rangeEnd) {
    const normVersion = _normalizeVersion(versionToCheck).split('.').map(Number);
    const normStart = _normalizeVersion(rangeStart).split('.').map(Number);
    const normEnd = _normalizeVersion(rangeEnd).split('.').map(Number);

    const isGreaterOrEqual = (v1, v2) => {
        for (let i = 0; i < 3; i++) {
            if (v1[i] > v2[i]) return true;
            if (v1[i] < v2[i]) return false;
        }
        return true; // Equal
    };

    const isLessOrEqual = (v1, v2) => {
        for (let i = 0; i < 3; i++) {
            if (v1[i] < v2[i]) return true;
            if (v1[i] > v2[i]) return false;
        }
        return true; // Equal
    };

    return isGreaterOrEqual(normVersion, normStart) && isLessOrEqual(normVersion, normEnd);
}

/**
 * [MODIFIED] Builds the final iframe HTML string from a single template for legacy versions.
 * It now points to the dedicated legacy loader script 'viewer-legacy.js'.
 * @param {string} mainScriptUrl - The URL for the main three.js script.
 * @param {string} [addonScripts=''] - An optional string containing additional <script> tags.
 * @returns {string} The complete HTML content.
 * @private
 */
function _buildHtmlTemplate(mainScriptUrl, addonScripts = '') {
    const title = `Three.js Viewer - ${mainScriptUrl.split('/').pop()}`;
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>html,body{width:100%;height:100%;margin:0;padding:0;overflow:hidden;background:transparent}#canvas{display:block;width:100%;height:100%;background:transparent}</style>
    <script id="viewer-script-threejs-url" src="${mainScriptUrl}"><\/script>${addonScripts}
</head>
<body>
    <canvas id="canvas"></canvas>
    <script src="viewer/viewer-legacy.js"><\/script>
</body>
</html>`;
}



/**
 * [MODIFIED] Generates the iframe HTML by delegating to the appropriate builder function
 * and passing the necessary parameters for each case.
 * @param {string} versionUrl - The full URL to the main Three.js script.
 * @returns {string} The complete HTML content as a string.
 * @private
 */
function _generateIframeHtml(versionUrl) {

    if (!versionUrl.includes("module")) {
        return get_html_legacy(versionUrl)
    } else {

        return get_html_module(versionUrl)
    }

}

/**
 * [NEW HELPER] Constructs a reliable base URL for JSM addons using jsDelivr.
 * It extracts the version from any given URL and builds a standard jsDelivr path.
 * @param {string} versionUrl - The full URL to the main three.module.js file.
 * @returns {string} The base URL for the 'three/addons/' path.
 * @private
 */
function _getAddonBasePath(versionUrl) {
    const version = _extractVersion(versionUrl);
    // We normalize the version to ensure it's a valid semantic version for jsDelivr.
    // e.g., 'r128' becomes '0.128.0'
    const normalizedVersion = _normalizeVersion(version || 'latest');
    return `https://cdn.jsdelivr.net/npm/three@${normalizedVersion}/examples/jsm/`;
}

/**
 * [REFACTORED] Builds the clean iframe HTML for a modern ES Module version of Three.js.
 * Its only job is to create the importmap and load the module entry point 'viewer-module.js'.
 * @param {string} versionUrl - The full URL to the three.module.js file.
 * @returns {string} The complete HTML content for the iframe.
 * @private
 */
function get_html_module(versionUrl) {
    const title = `Three.js Viewer - ${versionUrl.split('/').pop()}`;
    const addonBasePath = _getAddonBasePath(versionUrl);

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>html,body{width:100%;height:100%;margin:0;padding:0;overflow:hidden;background:transparent}#canvas{display:block;width:100%;height:100%;background:transparent}</style>
    
    <script type="importmap">
    {
        "imports": {
            "three": "${versionUrl}",
            "three/addons/": "${addonBasePath}"
        }
    }
    <\/script>
</head>
<body>
    <canvas id="canvas"></canvas>
    <script type="module" src="viewer/viewer-module.js"><\/script>
</body>
</html>`;
}

function get_html_legacy(versionUrl) {
    const extractedVersion = _extractVersion(versionUrl);


    //   Unsupported very old versions (< r74)
    if (_isVersionInRange(extractedVersion, '0.0.0', '0.73.9')) {
       return _buildInfoPageTemplate({
            title: `Version Not Supported (${extractedVersion || 'N/A'})`,
            explanation: `Three.js version ${extractedVersion} is too old. Due to major changes in the core Geometry class around r74, versions prior to this are not supported for 3D text rendering in this editor.`
        });
    }

    // Very legacy versions (< r81) - Bundled classic scripts.
    if (_isVersionInRange(extractedVersion, '0.74.0', '0.80.9')) {
        return _buildHtmlTemplate(versionUrl, ''); // No addons needed.
    }

    // Case 1: Legacy versions (r81 to 0.132.2) - Bundled classic scripts.
    if (_isVersionInRange(extractedVersion, '0.81.0', '0.132.2')) {
        return _buildHtmlTemplate(versionUrl, ''); // No addons needed.
    }

    // Case 2: Intermediate versions (0.133.0 to 0.147.0) - Classic scripts with separate classic addons.
    if (_isVersionInRange(extractedVersion, '0.133.0', '0.147.0')) {
        const normalizedVersion = _normalizeVersion(extractedVersion);
        const jsdelivrBase = `https://cdn.jsdelivr.net/npm/three@${normalizedVersion}/examples/js/`;
        const addonScripts = `
    <script src="${jsdelivrBase}loaders/FontLoader.js"><\/script>
    <script src="${jsdelivrBase}geometries/TextGeometry.js"><\/script>`;
        return _buildHtmlTemplate(versionUrl, addonScripts);
    }

    // Case 3 & Fallback: Modern versions (0.148.0 and newer) - Module-based (ESM) workflow.
    const normalizedVersion = _normalizeVersion(extractedVersion || '0.148.0');
    // Pass both the normalized version (for addons) and the original URL (for the main module).
   return _buildInfoPageTemplate({
        title: `Version Incompatibility (${normalizedVersion})`,
        explanation: `Starting with version r148, Three.js stopped publishing key addons like <strong>FontLoader</strong> and <strong>TextGeometry</strong> as classic UMD scripts. To use 3D text functionality with this version, you must use a JavaScript Module (ESM) file by selecting a ".module.js" asset.`,
        details: versionUrl
    });
}


/**
 * [NEW] Builds a generic, styled informational HTML page for the iframe.
 * This is used for various compatibility warnings and errors.
 * @param {object} options - The content for the page.
 * @param {string} options.title - The main title for the info card.
 * @param {string} options.explanation - The main paragraph of explanatory text.
 * @param {string} [options.details] - Optional extra detail, like a URL, to display.
 * @returns {string} The complete HTML content for the info page.
 * @private
 */
function _buildInfoPageTemplate({ title, explanation, details = '' }) {
    // The detail template is only added if details are provided.
    const detailHtml = details 
        ? `<div class="url-display">${details}</div>` 
        : '';
    
    const iconSvg = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>`;

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>:root{--color-bg:#1e1e1e;--color-card-bg:#2d2d2d;--color-border:#404040;--color-text:#ccc;--color-text-light:#888;--color-accent:#ff8b52;--font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;--font-family-mono:'Monaco','Menlo',monospace}html,body{width:100%;height:100%;margin:0;padding:0;display:flex;align-items:center;justify-content:center;background-color:var(--color-bg);font-family:var(--font-family);color:var(--color-text)}.info-card{max-width:500px;background-color:var(--color-card-bg);border:1px solid var(--color-border);border-radius:6px;padding:24px;box-shadow:0 10px 30px rgba(0,0,0,.2)}.card-header{display:flex;align-items:center;gap:12px;margin-bottom:16px}.card-header svg{width:28px;height:28px;color:var(--color-accent);flex-shrink:0}.card-header h2{margin:0;font-size:18px}.card-body p{font-size:14px;line-height:1.6;margin:0 0 16px 0}.card-body p strong{color:var(--color-accent);font-weight:600}.url-display{font-family:var(--font-family-mono);font-size:12px;color:var(--color-text-light);background-color:var(--color-bg);padding:8px 12px;border-radius:4px;word-break:break-all}</style>
</head>
<body>
    <div class="info-card">
        <div class="card-header">
            ${iconSvg}
            <h2>${title}</h2>
        </div>
        <div class="card-body">
            <p>${explanation}</p>
            ${detailHtml}
        </div>
    </div>
</body>
</html>`;
}
//--------------------------------------------------------------
//-------------[   INITIALIZATION & HIGH-LEVEL CONTROL   ]-----
//-------------------------------------------------------------

/**
 * Initializes the Three.js versioner module.
 * @param {object} injectedDependencies - An object containing references to other modules.
 */
function initThreeVersioner(injectedDependencies) {
    dependencies = injectedDependencies;
    const simpleDropdownContainer = document.getElementById('version-selector-container');
    const headerRow = document.getElementById('headerRow');
    const openModalBtn = document.getElementById('version-settings-btn');
    const modal = document.getElementById('versionModal');
    const advancedOptionsBtn = document.getElementById('toggleAdvancedVersionBtn');




    // Add event listeners for the simple dropdown container
    if (simpleDropdownContainer && headerRow) {
        headerRow.addEventListener('click', (e) => {
            if (!openModalBtn.contains(e.target)) {
                simpleDropdownContainer.classList.toggle('expanded');
            }
        });
        window.addEventListener('click', (e) => {
            if (!simpleDropdownContainer.contains(e.target)) {
                simpleDropdownContainer.classList.remove('expanded');
            }
        });
    }

    // Add event listener to open the main modal
    if (openModalBtn) {
        openModalBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            simpleDropdownContainer.classList.remove('expanded');
            toggleVersionModal();
        });
    }

    // Add event listener for advanced options toggle inside the modal
    if (advancedOptionsBtn && modal) {
        advancedOptionsBtn.addEventListener('click', () => {
            modal.classList.toggle('show-advanced');
            advancedOptionsBtn.classList.toggle('active');
        });
    }

    // Initialize CDN toggles and load all version data from APIs
    setupCdnToggle();
    loadThreejsVersions();
}

/**
 * Sets the initial version state from the main application.
 * This function should be called once on startup.
 * @param {string} version - The version string (e.g., "r128").
 * @param {string} url - The full asset URL that was loaded.
 */
function setInitialVersion(version, url) {
    currentLoadedVersion = version;
    currentIframeUrl = url;

    // Update the UI elements to reflect the initial state
    updateLoadedAssetIndicator(currentIframeUrl);
    document.getElementById('version-header-text').textContent = currentLoadedVersion;
}
/**
 * [MODIFIED] Sets up the mutually exclusive logic for the CDN toggle checkboxes.
 * Now it also repopulates the version dropdowns when the CDN selection changes.
 */
function setupCdnToggle() {
    const cdnJsdelivr = document.getElementById('cdn-jsdelivr');
    const cdnCdnjs = document.getElementById('cdn-cdnjs');
    const jsdelivrFilters = document.getElementById('jsdelivr-filters');
    const cdnjsFilters = document.getElementById('cdnjs-filters');

    const updateCdnView = () => {
        if (cdnJsdelivr.checked) {
            activeCdn = 'jsdelivr';
            jsdelivrFilters.classList.add('active-cdn-filter');
            cdnjsFilters.classList.remove('active-cdn-filter');
        } else {
            activeCdn = 'cdnjs';
            jsdelivrFilters.classList.remove('active-cdn-filter');
            cdnjsFilters.classList.add('active-cdn-filter');
        }
    };

    cdnJsdelivr.addEventListener('change', () => {
        if (cdnJsdelivr.checked) {
            cdnCdnjs.checked = false;
            updateCdnView();

            // [FIX] Populate the correct version list on change
            if (jsdelivrVersionsData.all) {
                populateJsdelivrDropdown();
            }

            const version = document.getElementById('jsdelivrVersionTrigger').textContent;
            updateAssetCards(version);
        } else {
            // Prevent unchecking, ensuring one is always selected
            cdnJsdelivr.checked = true;
        }
    });

    cdnCdnjs.addEventListener('change', () => {
        if (cdnCdnjs.checked) {
            cdnJsdelivr.checked = false;
            updateCdnView();

            // [FIX] Populate the correct version list on change
            if (cdnjsVersionsData.all) {
                // Default to the 'release' category when switching to cdnjs
                populateCdnjsVersionDropdown('release');
                document.getElementById('categoryTrigger').textContent = 'Release (r)';
            }

            const version = document.getElementById('versionTrigger').textContent;
            updateAssetCards(version);
        } else {
            // Prevent unchecking, ensuring one is always selected
            cdnCdnjs.checked = true;
        }
    });

    updateCdnView();
}
//----------------------------------------> END [INITIALIZATION & HIGH-LEVEL CONTROL]


//-------------------------------------------------------------
//--------------------[   API & DATA FETCHING   ]--------------
//-------------------------------------------------------------

/**
 * [MODIFIED] Fetches the list of all available versions from both CDNs via a worker.
 * This function is now async to handle the preset generation.
 */
async function loadThreejsVersions() {
    // The worker's code does not need changes.
    const workerCode = `
        self.onmessage = async (e) => {
            const { cdnjsApi, jsdelivrApi } = e.data;
            let results = {};
            try {
                const cdnjsResponse = await fetch(cdnjsApi);
                const cdnjsData = await cdnjsResponse.json();
                const cdnjsResult = { latest: cdnjsData.version, all: { semantic: [], release: [], simple: [] } };
                cdnjsData.versions.forEach(v => {
                    if (v.includes('.')) cdnjsResult.all.semantic.push(v);
                    else if (v.startsWith('r')) cdnjsResult.all.release.push(v);
                    else cdnjsResult.all.simple.push(v);
                });
                results.cdnjsData = cdnjsResult;
            } catch (error) { results.cdnjsError = error.message; }
            try {
                const jsdelivrResponse = await fetch(jsdelivrApi);
                const jsdelivrData = await jsdelivrResponse.json();
                results.jsdelivrData = {
                    latest: jsdelivrData.tags.latest,
                    all: jsdelivrData.versions.map(v => v.version)
                };
            } catch (error) { results.jsdelivrError = error.message; }
            self.postMessage(results);
        };
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));

    worker.onmessage = async (e) => { // This callback is now async
        if (e.data.cdnjsError) dependencies.ui.handle_error(new Error(e.data.cdnjsError));
        if (e.data.jsdelivrError) dependencies.ui.handle_error(new Error(e.data.jsdelivrError));

        if (e.data.cdnjsData) cdnjsVersionsData = e.data.cdnjsData;
        if (e.data.jsdelivrData) {
            jsdelivrVersionsData = e.data.jsdelivrData;
            // Await the async function that finds the correct URLs
            await _updatePresetsWithApiData();
        }

        if (activeCdn === 'jsdelivr') {
            populateJsdelivrDropdown();
        } else {
            populateCdnjsVersionDropdown('release');
        }

        const versionTriggerId = activeCdn === 'jsdelivr' ? 'jsdelivrVersionTrigger' : 'versionTrigger';
        const defaultVersion = document.getElementById(versionTriggerId)?.textContent;
        if (defaultVersion) {
            updateAssetCards(defaultVersion);
        }

        const simpleDropdownContainer = document.getElementById('version-selector-container');
        const listContent = document.getElementById('version-list-content');
        const headerText = document.getElementById('version-header-text');

        if (listContent && headerText && typeof PRESET_VERSIONS !== 'undefined') {
            _populateVersionList(PRESET_VERSIONS, listContent, headerText, simpleDropdownContainer);
            headerText.textContent = currentLoadedVersion;
        }
    };

    worker.postMessage({ cdnjsApi: `${CDNS.cdnjs.Api}?${CDNS.cdnjs.versionsQuery}`, jsdelivrApi: CDNS.jsdelivr.Api });
}

/**
 * [MODIFIED] Updates the global PRESET_VERSIONS object by fetching the latest two
 * versions from jsDelivr and finding their optimal module URL.
 * This function is now async.
 */
async function _updatePresetsWithApiData() {
    if (!jsdelivrVersionsData || !jsdelivrVersionsData.all || jsdelivrVersionsData.all.length === 0) {
        return;
    }

    const newApiVersions = {};
    const versionsToAdd = jsdelivrVersionsData.all.slice(0, 2); // Get latest two versions

    for (const version of versionsToAdd) {
        try {
            // Get the list of available files for this version
            const availableUrls = await getFinalAssetsList(version);

            // Find the best module URL from the list
            const bestUrl = _findBestModuleUrl(availableUrls);

            // Only add the preset if a valid module URL was found
            if (bestUrl) {
                newApiVersions[version] = {
                    version: version,
                    asset_url: bestUrl
                };
            }
        } catch (error) {
            console.error(`Could not process preset for version ${version}:`, error);
        }
    }

    // Prepend the new, validated versions to the existing hardcoded presets
    PRESET_VERSIONS = { ...newApiVersions, ...PRESET_VERSIONS };
}

/**
 * [UI DISPATCHER] Orchestrates fetching assets and rendering them into cards.
 * @param {string} version - The version string to display assets for.
 */
async function updateAssetCards(version) {
    const container = document.getElementById('fileCardContainer');
    const scrollArea = container.querySelector('.assets-scroll-area');


    container.classList.add('is-loading');
    scrollArea.innerHTML = '';
    document.getElementById('apply-error-message').style.display = 'none';

    try {
        const finalUrls = await getFinalAssetsList(version);
        renderFileCards(finalUrls, version);
    } catch (error) {
        scrollArea.innerHTML = `<div class="loader-placeholder">Error loading assets: ${error.message}</div>`;
    } finally {
        container.classList.remove('is-loading');
    }
}

/**
 * [LOGIC DISPATCHER] Gets the final, complete asset URLs for a given version from the active CDN.
 * @param {string} version - The version to get assets for.
 * @returns {Promise<Array<string>>} A promise that resolves to an array of full, final asset URLs.
 */
async function getFinalAssetsList(version) {

    let rawFilePaths = [];
    let baseUrl = '';

    
    switch (activeCdn) {

        case 'jsdelivr':

            const jsdelivr_fetched = await fetchJsdelivrVersionManifest(version);
            rawFilePaths = jsdelivr_fetched.files;
            baseUrl = jsdelivr_fetched.baseUrl;
            break;
        case 'cdnjs':
            rawFilePaths = await fetchCdnjsVersionManifest(version);
            baseUrl = `${CDNS.cdnjs.assetsBase}/${version}`;
            break;
        default:
            throw new Error(`Unknown CDN: ${activeCdn}`);
    }

   

    const filteredPaths = rawFilePaths.filter(path => {
        const fileName = path.split('/').pop();
        return allowedFiles.includes(fileName.toLowerCase());
    });

    return filteredPaths.map(path => `${baseUrl}/${path}`);
}

/**
 * Fetches the raw file list from the jsDelivr API.
 * @param {string} version - The version to fetch.
 * @returns {Promise<Array<string>>} A promise resolving to raw file paths (e.g., "build/three.min.js").
 */
async function fetchJsdelivrVersionManifest(version) {

    const apiUrl = `${CDNS.jsdelivr.Api}@${version}`;
     const response = await fetch(apiUrl);

    let res = null;
    let base_Url = `${CDNS.jsdelivr.assetsBase}@${version}`;
    if (!response.ok) throw new Error(`jsDelivr API Error ${response.status}`);
    const data = await response.json();

    const buildDir = data.files.find(f => f.type === 'directory' && f.name === 'build');
    if (buildDir && buildDir.files) {
        res = buildDir.files.map(f => f.name);
        base_Url = `${CDNS.jsdelivr.assetsBase}@${version}/build`;
    } else {
        res = (data.files || []).filter(f => f.type === 'file').map(f => f.name);
    }

    return { baseUrl: base_Url, files: res };
}

/**
 * Fetches the raw file list from the cdnjs API.
 * @param {string} version - The version to fetch.
 * @returns {Promise<Array<string>>} A promise resolving to raw file paths (e.g., "three.min.js").
 */
async function fetchCdnjsVersionManifest(version) {
    const manifestApiUrl = `${CDNS.cdnjs.Api}/${version}`;
    
    const response = await fetch(manifestApiUrl);
     if (!response.ok) throw new Error(`cdnjs API Error ${response.status}`);
    const data = await response.json();
    return data.files;
}

//----------------------------------------> END [API & DATA FETCHING]


//-------------------------------------------------------------
//--------------------[   MODAL UI & LOGIC   ]-----------------
//-------------------------------------------------------------

/**
 * Toggles the visibility of the version selector modal.
 */
function toggleVersionModal() {
    const modal = document.getElementById('versionModal');
    const isVisible = modal.classList.contains('show');
    const triggerBtn = document.getElementById('version-header-right');

    if (isVisible) {
        modal.classList.remove('show');
    } else {
        if (!modalInitialized) initializeVersionModal();
        if (!isPositionedInitially) {

            dependencies.utils.positionModal(modal, triggerBtn, { centerX: true, cover: true, offsetY: 0 });

            isPositionedInitially = true;
        }
        dependencies.utils.bringToFront(modal);
        modal.classList.add('show');

        const versionTriggerId = activeCdn === 'jsdelivr' ? 'jsdelivrVersionTrigger' : 'versionTrigger';
        const versionToShow = document.getElementById(versionTriggerId).textContent;
        updateAssetCards(versionToShow);
    }
}

/**
 * Sets up the event listeners for all dropdowns within the modal.
 */
function initializeVersionModal() {
    const categoryTrigger = document.getElementById('categoryTrigger');
    const categoryPanel = document.getElementById('categoryPanel');
    const categoryList = document.getElementById('categoryList');
    const versionTrigger = document.getElementById('versionTrigger');
    const versionPanel = document.getElementById('versionPanel');
    const versionList = document.getElementById('versionListCustom');
    const jsdelivrTrigger = document.getElementById('jsdelivrVersionTrigger');
    const jsdelivrPanel = document.getElementById('jsdelivrVersionPanel');
    const jsdelivrList = document.getElementById('jsdelivrVersionList');

    const groupDisplayNames = { latest: "Latest", semantic: "Semantic", release: "Release (r)", simple: "Simple" };
    Object.keys(groupDisplayNames).forEach(key => {
        const li = document.createElement('li');
        li.dataset.value = key;
        li.textContent = groupDisplayNames[key];
        categoryList.appendChild(li);
    });

    categoryTrigger.addEventListener('click', (e) => { e.stopPropagation(); categoryPanel.classList.toggle('show'); });
    versionTrigger.addEventListener('click', (e) => { e.stopPropagation(); versionPanel.classList.toggle('show'); });
    jsdelivrTrigger.addEventListener('click', (e) => { e.stopPropagation(); jsdelivrPanel.classList.toggle('show'); });

    categoryList.addEventListener('click', (e) => {
        if (e.target.tagName === 'LI' && e.target.dataset.value) {
            categoryTrigger.textContent = e.target.textContent;
            populateCdnjsVersionDropdown(e.target.dataset.value);
            updateAssetCards(versionTrigger.dataset.value);
        }
    });
    versionList.addEventListener('click', (e) => {
        if (e.target.tagName === 'LI' && e.target.dataset.value) {
            versionTrigger.textContent = e.target.dataset.value;
            versionTrigger.dataset.value = e.target.dataset.value;
            updateAssetCards(e.target.dataset.value);
        }
    });
    jsdelivrList.addEventListener('click', (e) => {
        if (e.target.tagName === 'LI' && e.target.dataset.value) {
            jsdelivrTrigger.textContent = e.target.dataset.value;
            updateAssetCards(e.target.dataset.value);
        }
    });

    window.addEventListener('click', () => {
        categoryPanel.classList.remove('show');
        versionPanel.classList.remove('show');
        jsdelivrPanel.classList.remove('show');
    });

    modalInitialized = true;

    const expanderCheckbox = document.getElementById('assets-expander-checkbox');
    if (expanderCheckbox) {
        expanderCheckbox.addEventListener('change', () => {
            const assetTitleElement = document.getElementById('asset-container-title');
            const selectedFile = assetTitleElement ? assetTitleElement.dataset.selectedFile : '';
            _updateAssetTitle(selectedFile);
        });
    }
}

/**
 * [MODIFIED] Renders file cards, now identifying and flagging all assets from
 * unsupported old versions (< 0.74.0) as incompatible, in addition to modern
 * UMD files.
 * @param {Array<string>} finalUrls - An array of full, final asset URLs.
 * @param {string} version - The version string associated with these URLs.
 */
function renderFileCards(finalUrls, version) {
    const scrollArea = document.querySelector('#fileCardContainer .assets-scroll-area');
    const applyBtn = document.getElementById('applyVersionBtn');
    scrollArea.innerHTML = '';
    applyBtn.classList.add('is-disabled');
    modalSelectionState = { url: null, version: null };

    if (!finalUrls || finalUrls.length === 0) {
        scrollArea.innerHTML = '<div class="loader-placeholder">No compatible core files found.</div>';
        _updateAssetTitle('');
        return;
    }

    // --- Step 1: Define all incompatibility conditions ---
    const isModernEra = _isVersionInRange(version, '0.148.0', '0.999.0');
    const isTooOld = _isVersionInRange(version, '0.0.0', '0.73.9');

    const renderGroup = (group, title, tooltip, isUmdGroup) => {
        if (group.length === 0) return;

        const separator = document.createElement('div');
        separator.className = 'asset-separator';
        separator.dataset.tooltip = tooltip;
        separator.innerHTML = `<span>${title}</span>`;
        scrollArea.appendChild(separator);

        group.forEach(url => {
            const fileName = url.split('/').pop();
            const card = document.createElement('div');
            
            // A file is compatible only if the version is NOT too old AND it's NOT a modern UMD file.
            const isCompatible = !isTooOld && !(isUmdGroup && isModernEra);
            
            card.className = `file-card ${!isCompatible ? 'is-incompatible' : ''}`;
            card.dataset.url = url;
            card.dataset.version = version;
            card.dataset.isCompatible = isCompatible;

            let actionButtonHtml = '';
            if (isCompatible) {
                actionButtonHtml = `<button class="file-card-copy-btn" data-tooltip="Copy URL" onclick="copyCardUrl(event, '${url}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                </button>`;
            } else {
                const infoTooltip = isTooOld
                    ? `Version ${version} is too old and not supported by this editor.`
                    : `This UMD file can't be used with TextGeometry in version ${version}. Select an ESM file instead.`;
                
                actionButtonHtml = `<div class="file-card-info-btn" data-tooltip="${infoTooltip}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                </div>`;
            }

            card.innerHTML = `<span class="file-card-url" title="${url}">${fileName}</span> ${actionButtonHtml}`;

            card.addEventListener('click', (e) => {
                const currentSelected = scrollArea.querySelector('.file-card.selected');
                if (currentSelected) currentSelected.classList.remove('selected');
                card.classList.add('selected');

                let reason = null;
                if (!isCompatible) {
                    reason = isTooOld ? 'TOO_OLD' : 'MODERN_UMD';
                }
                
                modalSelectionState = { url: url, version: version, isCompatible: isCompatible, incompatibilityReason: reason };
                
                applyBtn.classList.remove('is-disabled');
                document.getElementById('apply-error-message').style.display = 'none';
                lastUserSelectedAsset = fileName;
                _updateAssetTitle(fileName);
            });
            scrollArea.appendChild(card);
        });
    };

    // --- Rendering logic remains unchanged ---
    const assets = {
        umd: finalUrls.filter(url => !url.includes('.module.')),
        esm: finalUrls.filter(url => url.includes('.module.'))
    };
    renderGroup(assets.umd, 'UMD', 'Universal Module Definition (classic scripts for global scope)', true);
    renderGroup(assets.esm, 'ESM', 'ECMAScript Modules (for modern `import`/`export` workflows)', false);
    
    // --- Auto-selection logic remains unchanged ---
    const allCards = Array.from(scrollArea.querySelectorAll('.file-card'));
    const compatibleCards = allCards.filter(c => c.dataset.isCompatible === 'true');
    let cardToSelect = null;

    if (lastUserSelectedAsset) {
        cardToSelect = allCards.find(card => card.querySelector('.file-card-url').textContent === lastUserSelectedAsset);
    }
    
    if (!cardToSelect && compatibleCards.length > 0) {
        const findUrl = (suffix) => compatibleCards.find(c => c.dataset.url.endsWith(suffix));
        cardToSelect =
            findUrl('.module.min.js') || findUrl('.module.js') ||
            findUrl('.min.js') || findUrl('.js') || null;
    }

    if (cardToSelect) {
        cardToSelect.click();
    } else {
        _updateAssetTitle('');
        applyBtn.classList.add('is-disabled');
    }

    dependencies.utils.initSmartTooltips();
}

/**
 * Populates the version number dropdown for the cdnjs provider.
 * @param {string} category - The selected category (e.g., 'release', 'semantic').
 */
function populateCdnjsVersionDropdown(category) {
    const versionList = document.getElementById('versionListCustom');
    const versionTrigger = document.getElementById('versionTrigger');
    versionList.innerHTML = '';
    if (!cdnjsVersionsData.all) return;

    let versions = (category === 'latest') ? [cdnjsVersionsData.latest] : (cdnjsVersionsData.all[category] || []);
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
 * Populates the single version number dropdown for the jsDelivr provider.
 */
function populateJsdelivrDropdown() {
    const versionList = document.getElementById('jsdelivrVersionList');
    const versionTrigger = document.getElementById('jsdelivrVersionTrigger');
    versionList.innerHTML = '';
    if (!jsdelivrVersionsData.all) return;

    const versions = jsdelivrVersionsData.all;
    versions.forEach(v => {
        const li = document.createElement('li');
        li.dataset.value = v;
        li.textContent = v;
        versionList.appendChild(li);
    });

    if (versions.length > 0) {
        versionTrigger.textContent = versions[0];
    } else {
        versionTrigger.textContent = 'N/A';
    }
}


/**
 * Populates the version dropdown list from the global PRESET_VERSIONS object,
 * highlighting the currently loaded version.
 */
function _populateVersionList(versions, listContainer, headerTextElement, parentToCollapse) {
    listContainer.innerHTML = '';

    Object.values(versions).forEach(versionObject => {
        const li = document.createElement('li');
        li.textContent = versionObject.version;

        if (versionObject.version === currentLoadedVersion) {
            li.classList.add('active');
        }

        li.addEventListener('click', () => {
            headerTextElement.textContent = versionObject.version;
            parentToCollapse.classList.remove('expanded');
            proceedWithReloadFromPreset(versionObject);
        });

        listContainer.appendChild(li);
    });
}
//----------------------------------------> END [MODAL UI & LOGIC]


//-------------------------------------------------------------
//--------------------[   ACTIONS & HELPERS   ]----------------
//-------------------------------------------------------------

/**
 * [MODIFIED] Handles the click on the "Apply & Reload" button.
 * It now builds the full HTML for the info-card to be displayed in the modal,
 * ensuring the correct design is used.
 */
function applyThreeJsVersion() {
    const errorMsg = document.getElementById('apply-error-message');
    if (!modalSelectionState.url) {
        errorMsg.textContent = 'Please select an asset to apply.';
        errorMsg.style.display = 'block';
        return;
    }
    errorMsg.style.display = 'none';

    if (!modalSelectionState.isCompatible) {
        let title = '';
        let explanation = '';
        let details = '';
        const version = modalSelectionState.version;

        const reason = modalSelectionState.incompatibilityReason;

        // [FIX] Define the title and explanation based on the reason
        if (reason === 'TOO_OLD') {
            title = `Version Not Supported (${version})`;
            explanation = `Three.js version ${version} is too old. Due to major changes in the core Geometry class around r74, versions prior to this are not supported for 3D text rendering in this editor.`;
        } else { // Default to MODERN_UMD reason
            title = `Version Incompatibility (${version})`;
            explanation = `Starting with version r148, Three.js stopped publishing key addons like <strong>FontLoader</strong> and <strong>TextGeometry</strong> as classic UMD scripts. To use 3D text functionality with this version, you must use a JavaScript Module (ESM) file by selecting a ".module.js" asset.`;
            details = `<div class="url-display">${modalSelectionState.url}</div>`;
        }
        
        // [FIX] Build the full info-card HTML structure
        const iconSvg = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>`;

        const htmlContent = `
            <div class="info-card">
                <div class="card-header">
                    ${iconSvg}
                    <h2>${title}</h2>
                </div>
                <div class="card-body">
                    <p>${explanation}</p>
                    ${details}
                </div>
            </div>`;

        dependencies.utils.showInfoModal({ title: title, html: htmlContent });
        return;
    }

    if (modalSelectionState.url === currentIframeUrl) {
        dependencies.utils.showConfirmationModal({
            title: "Action Confirmation",
            text: "This version is already loaded. Do you want to proceed with a reload?",
            buttons: [{ label: 'Cancel' }, { label: 'OK', callback: proceedWithReload }]
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

    renderVersion(currentIframeUrl);
}

/**
 * Generates the iframe HTML and passes it to the main controller for state-saving reload.
 * @param {string} iframeUrl - The URL of the Three.js script to load.
 */
function renderVersion(iframeUrl) {
    dependencies.utils.showToastMessage(`Reloading with Three.js ${currentLoadedVersion}...`);

    const iframeHtml = _generateIframeHtml(iframeUrl);

    try {
        dependencies.viewer.reloadWithState(iframeHtml);

        updateLoadedAssetIndicator(iframeUrl);
        document.getElementById('version-header-text').textContent = currentLoadedVersion;
    } catch (error) {
        dependencies.ui.handle_error(error, { showInDevConsole: true, openUiConsole: false, showInAlert: true });
    }
}

/**
 * Updates the visual indicator with the currently loaded asset URL.
 * @param {string} url - The URL of the script being loaded.
 */
function updateLoadedAssetIndicator(url) {
    const indicator = document.getElementById('loaded-asset-indicator');
    if (indicator) {
        indicator.textContent = url;
        indicator.title = url;
    }
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
 * Initiates the viewer reload process using data from a PRESET_VERSIONS object.
 * @param {object} presetObject - The preset object containing version and asset_url.
 */
function proceedWithReloadFromPreset(presetObject) {
    if (!presetObject || !presetObject.asset_url || !presetObject.version) {
        console.error("Invalid preset object for reload:", presetObject);
        return;
    }

    currentLoadedVersion = presetObject.version;
    currentIframeUrl = presetObject.asset_url;

    renderVersion(currentIframeUrl);
}

/**
 * Updates the asset container title based on the current selection and collapsed/expanded state.
 * @param {string} [selectedFileName] - The name of the currently selected file.
 */
function _updateAssetTitle(selectedFileName) {
    const assetTitleElement = document.getElementById('asset-container-title');
    const expanderCheckbox = document.getElementById('assets-expander-checkbox');

    if (!assetTitleElement || !expanderCheckbox) return;

    assetTitleElement.dataset.selectedFile = selectedFileName || '';

    if (expanderCheckbox.checked) {
        assetTitleElement.textContent = 'Asset';
    } else {
        assetTitleElement.textContent = selectedFileName || 'Asset';
    }
}

/**
 * [PUBLIC] Generates the initial HTML for the iframe.
 * A wrapper for the private _generateIframeHtml function.
 * @param {string} versionUrl - The full URL to the Three.js script.
 * @returns {string} The complete HTML content.
 */
function generateInitialIframeHtml(versionUrl) {
    return _generateIframeHtml(versionUrl);
}


/**
 * [NEW HELPER] Scans a list of asset URLs and returns the best available module URL.
 * It prioritizes '.module.min.js' over '.module.js'.
 * @param {string[]} urlList - A list of full asset URLs for a specific version.
 * @returns {string|null} The best module URL found, or null if none exist.
 * @private
 */
function _findBestModuleUrl(urlList) {
    if (!urlList || urlList.length === 0) return null;

    const minifiedModule = urlList.find(url => url.endsWith('.module.min.js'));
    if (minifiedModule) return minifiedModule;

    const standardModule = urlList.find(url => url.endsWith('.module.js'));
    if (standardModule) return standardModule;

    return null;
}
//----------------------------------------> END [ACTIONS & HELPERS]

export {
    initThreeVersioner,
    setInitialVersion,
    toggleVersionModal,
    applyThreeJsVersion,
    copyCardUrl,
    updateLoadedAssetIndicator,
    generateInitialIframeHtml
};