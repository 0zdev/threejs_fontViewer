/**
 * Project: Three.js JSON Font Editor
 * File: editor/js/font-manager.js
 * Created: 2025-08-29
 * Author: @lewopxd
 *
 * Description:
 * This module manages font I/O (loading, saving) and renders font-specific
 * UI components based on the global application state.
 */

import { initSmartTooltips, formatBytes, formatLabelKey, linkify, truncateText } from './utils.js';

//-------------------------------------------------------------
//--------------------[   MODULE STATE   ]---------------------
//-------------------------------------------------------------

let fontAnalyzerWorker;
let stateManager = {}; // Injected from main.js, manages AppState
let dependencies = { ui: null, utils: null };
let currentAllFonts = {};
let currentFontID = null;

//----------------------------------------> END [MODULE STATE]


//-------------------------------------------------------------
//--------------------[   INITIALIZATION   ]-------------------
//-------------------------------------------------------------

/**
 * Initializes the font manager and its components.
 * @param {object} injectedDependencies - An object containing references to other modules.
 * @param {function} onInitialFontsLoaded - Callback to run after default fonts are loaded.
 * @returns {void}
 */
function initFontManager(injectedDependencies, onInitialFontsLoaded) {
    dependencies = {
        ui: injectedDependencies.ui,
        utils: injectedDependencies.utils
    };
    stateManager = injectedDependencies.stateManager;
    initFontAnalyzerWorker();
    fetchAndStoreFonts(onInitialFontsLoaded);
}
//----------------------------------------> END [INITIALIZATION]


//-------------------------------------------------------------
//-------------[   FONT DATA FETCHING & PROCESSING   ]---------
//-------------------------------------------------------------

/**
 * Fetches the default Three.js example fonts. It tries to load them from
 * the official URL first, and if that fails, it attempts to load a local
 * fallback file. It then adds them to the AppState via the stateManager.
 * @param {function} onComplete - Callback with the ID of the first font to be selected.
 * @returns {Promise<void>}
 */
async function fetchAndStoreFonts(onComplete) {
    document.getElementById('fileInfo').innerHTML = `<span>Loading default fonts...</span>`;

    const fontsToLoad = [
       
        { key: 'helvetiker_regular', name: 'Helvetiker Regular', url: 'https://threejs.org/examples/fonts/helvetiker_regular.typeface.json' },
        { key: 'helvetiker_bold', name: 'Helvetiker Bold', url: 'https://threejs.org/examples/fonts/helvetiker_bold.typeface.json' },
        { key: 'optimer_regular', name: 'Optimer Regular', url: 'https://threejs.org/examples/fonts/optimer_regular.typeface.json' },
        { key: 'optimer_bold', name: 'Optimer Bold', url: 'https://threejs.org/examples/fonts/optimer_bold.typeface.json' },
        { key: 'gentilis_regular', name: 'Gentilis Regular', url: 'https://threejs.org/examples/fonts/gentilis_regular.typeface.json' },
        { key: 'gentilis_bold', name: 'Gentilis Bold', url: 'https://threejs.org/examples/fonts/gentilis_bold.typeface.json' },
        { key: 'droid_sans_regular', name: 'Droid Sans Regular', url: 'https://threejs.org/examples/fonts/droid/droid_sans_regular.typeface.json' },
        { key: 'droid_sans_bold', name: 'Droid Sans Bold', url: 'https://threejs.org/examples/fonts/droid/droid_sans_bold.typeface.json' },
        { key: 'droid_serif_regular', name: 'Droid Serif Regular', url: 'https://threejs.org/examples/fonts/droid/droid_serif_regular.typeface.json' },
        { key: 'droid_serif_bold', name: 'Droid Serif Bold', url: 'https://threejs.org/examples/fonts/droid/droid_serif_bold.typeface.json' }
    ];

    let firstFontID = null;

    // Add the local example font first for immediate availability.
    const exampleData = { "glyphs": { "n": { "x_min": 0, "x_max": 669, "ha": 782, "o": "m 669 0 l 469 0 l 469 452 q 442 553 469 513 q 352 601 412 601 q 245 553 290 601 q 200 441 200 505 l 200 0 l 0 0 l 0 748 l 194 748 l 194 659 q 289 744 230 713 q 416 775 349 775 q 600 700 531 775 q 669 509 669 626 l 669 0 " } }, "boundingBox": { "yMin": -333, "xMin": -162, "yMax": 1216, "xMax": 1681 }, "resolution": 1000 };
    const exampleFontObject = {
        originalName: 'example.json',
        fontName: 'Example',
        originalType: 'json',
        jsonData: exampleData,
        isFallback: true // Mark as fallback since it's local.
    };
    const exampleId = 'example';
    stateManager.addFont(exampleFontObject, exampleId);
    firstFontID = exampleId;

    // Process the remote fonts with local fallback logic.
    for (const font of fontsToLoad) {
        let fontData;
        let isFallback = false;
        const filename = font.url.split('/').pop();

        try {
            const response = await fetch(font.url);
            if (!response.ok) throw new Error(`HTTP error ${response.status} for ${font.url}`);
            fontData = await response.json();
        } catch (error) {
            //console.warn(`Could not fetch '${font.name}' from URL. Attempting local fallback...`, error);
            isFallback = true;
            
            try {
                const fallbackUrl = `./threejs_official/examples/fonts/${filename}`;
                const fallbackResponse = await fetch(fallbackUrl);
                if (!fallbackResponse.ok) throw new Error(`HTTP error ${fallbackResponse.status} for local file ${filename}`);
                fontData = await fallbackResponse.json();
             } catch (fallbackError) {
                console.error(`Failed to load '${font.name}' from both URL and local fallback. Skipping.`, fallbackError);
                continue;  // Skip this font if both sources fail.
            }
        }
        
        const fontObject = {
            originalName: filename,
            fontName: get_font_FullName(fontData, font.name),
            originalType: 'json',
            jsonData: fontData,
            url: font.url,
            isFallback: isFallback
        };
        stateManager.addFont(fontObject, font.key);
    }

    if (onComplete) {
        onComplete(firstFontID);
    }
}



/**
 * Event handler for the file input. Triggers font processing and adds to state.
 * @param {Event} event - The change event from the file input.
 * @returns {Promise<void>}
 */
async function handleFileLoad(event) {
    dependencies.ui.updateProgressBar(10);
    const file = event.target.files[0];
    if (!file) return;

    try {
        const fontObject = await file_manager(file);
        const newID = stateManager.addFont(fontObject);
        stateManager.selectFont(newID);
    } catch (error) {
        dependencies.ui.handle_error(error, { openConsole: true, showInAlert: true });
    }
}


/**
 * Fetches and processes a font from a given URL.
 * @returns {Promise<void>}
 */
async function loadFontFromUrl() {
    dependencies.ui.updateProgressBar(10);
    const url = document.getElementById('fontUrlInput').value.trim();
    if (!url) {
        dependencies.ui.handle_error(new Error("URL cannot be empty."), { showInAlert: true });
        return;
    }
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const fontData = await response.json();
        const fontName = url.split('/').pop() || 'new-font.json';

        const fontObject = {
            originalName: fontName,
            fontName: get_font_FullName(fontData, fontName),
            originalType: 'json',
            jsonData: fontData,
            url: url
        };

        const newID = stateManager.addFont(fontObject);
        stateManager.selectFont(newID);

        dependencies.ui.hideUrlModal();
    } catch (error) {
        dependencies.ui.handle_error(new Error(`Failed to load font from URL: ${error.message}`), { openConsole: true, showInAlert: true });
    }
}

/**
 * Processes a file (JSON or TTF) and returns a standardized font object.
 * @param {File} file - The file to process.
 * @returns {Promise<object>} A standardized font object.
 */
async function file_manager(file) {
    const fileName = file.name.toLowerCase();
    const extension = fileName.split('.').pop();

    switch (extension) {
        case 'json': {
            const jsonData = JSON.parse(await file.text());
            return {
                originalName: file.name,
                fontName: get_font_FullName(jsonData, file.name),
                originalType: 'json',
                jsonData: jsonData
            };
        }
        case 'ttf': {
            const convertedJson = await convertTTF(file);
            return {
                originalName: file.name,
                fontName: get_font_FullName(convertedJson, file.name),
                originalType: 'ttf',
                jsonData: convertedJson
            };
        }
        default:
            throw new Error("Unsupported file format. Please use .json or .ttf");
    }
}

/**
 * Converts a TTF font file into the Three.js JSON format.
 * @param {File} file - The TTF file.
 * @returns {Promise<object>} The font data in JSON format.
 */
function convertTTF(file) {
    return new Promise((resolve, reject) => {
        const fontUrl = URL.createObjectURL(file);
        const ttfLoader = new THREE.TTFLoader();

        ttfLoader.load(fontUrl,
            (jsonFont) => {
                URL.revokeObjectURL(fontUrl);
                resolve(jsonFont);
            },
            undefined,
            (error) => {
                URL.revokeObjectURL(fontUrl);
                console.error('TTFLoader error:', error);
                reject(new Error('Failed to convert TTF font.'));
            }
        );
    });
}
//----------------------------------------> END [FONT DATA FETCHING & PROCESSING]


//-------------------------------------------------------------
//---------------------[   FONT SAVING   ]---------------------
//-------------------------------------------------------------

/**
 * Triggers a download of the provided font data as a .json file.
 * @param {string} fontDataString - The JSON string of the font data.
 * @param {string} originalFileName - The original name of the font file.
 * @returns {void}
 */
function saveFont(fontDataString, originalFileName) {
    const blob = new Blob([fontDataString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = originalFileName.replace(/\.(json|ttf|otf)$/i, '') + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Triggers the hidden file input dialog.
 * @returns {void}
 */
function loadFontFromFile() {
    document.getElementById('fileInput').click();
    document.getElementById('addFontContextMenu').style.display = 'none';
}
//----------------------------------------> END [FONT SAVING]


//-------------------------------------------------------------
//---------------[   UI RENDERING & UPDATES   ]----------------
//-------------------------------------------------------------

/**
 * Main entry point for this module to update its UI based on the global state.
 * @param {object} allFonts - The AppState.inAppFonts object.
 * @param {string} activeFontID - The AppState.currentFontID.
 */
function updateUI(allFonts, activeFontID) {
    currentAllFonts = allFonts;
    currentFontID = activeFontID;

    populateFontListUI();

    const activeFont = allFonts[activeFontID];
    if (activeFont) {
        updateSubheader(activeFont);
         renderInfoView();
    } else {
        // Clear UI if no font is active
        document.getElementById('fileInfo').innerHTML = '<span>No font selected.</span>';
        document.getElementById('fontDetails').textContent = '';
    }
}

/**
 * Updates the subheader with the current font's information.
 * @param {object} fontObject - The active font object from AppState.
 */
function updateSubheader(fontObject) {
    const fileInfoSpan = document.getElementById('fileInfo');
    if (fontObject.type === 'ttf') {
        fileInfoSpan.innerHTML = `<span class="subheader-format">(TTF)</span> <span>${fontObject.fontName}</span> <span style="margin: 0 4px; color: var(--color-text-light);">></span> <span>.json</span>`;
    } else {
        fileInfoSpan.innerHTML = `<span class="subheader-format">(JSON)</span> <span>${fontObject.fontName}</span>`;
    }
    updateFontFileInfo(fontObject.data);
}

/**
 * Re-draws the entire font list in the UI based on the current state.
 * It now handles rendering fallback icons and action buttons.
 */
function populateFontListUI() {
    const list = document.getElementById('fontList');
    list.innerHTML = '';

  const createLi = (key, font) => {
        const li = document.createElement('li');
        const isUserFont = key.startsWith('user_');

        // --- LÍNEA CORREGIDA ---
        // La lógica ahora comprueba si la fuente tiene una URL y NO es un respaldo local.
        const iconSVG = font.url && !font.isFallback
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.72"></path></svg>`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;
        
        // Generates the correct action buttons based on font type
        let actionsHTML = '';
         if (font.isFallback) {
              const tooltipText = `Using local font file.\n\nThe original source isn't available at: \n${font.url}\n\n---\nYou can modify this local file, save your changes\n and using it by downloading it.`;
              
              actionsHTML = `<div class="font-actions-container">
                  <div class="font-action-info" data-tooltip="${tooltipText}">
                       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                  </div>
             </div>`;
        } else if (isUserFont) {   
            actionsHTML = `<div class="font-actions-container"><div class="copy-icon-wrapper">
                <div class="copy-event-interceptor" data-tooltip="Delete Font" onclick="deleteUserFont(event, '${key}')"></div>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </div></div>`;
        } else if (font.url) {
            actionsHTML = `<div class="font-actions-container">
                <span class="font-url">${font.url.split('/').pop()}</span>
                <div class="copy-icon-wrapper">
                    <div class="copy-event-interceptor" data-tooltip="Copy URL" onclick="copyFontUrl(event, '${font.url}')"></div>
                    <svg class="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </div>
             </div>`;
        }

        li.innerHTML = `${iconSVG}<span class="subheader-format">(${font.type.toUpperCase()})</span><span>${font.fontName}</span>${actionsHTML}`;
        li.dataset.fontKey = key;
        if (key === currentFontID) {
            li.classList.add('active');
        }

        // Prevents selecting the font when clicking an action icon
        li.addEventListener('click', (e) => {
            if (e.target.closest('.copy-event-interceptor') || e.target.closest('.font-action-info')) return;
            stateManager.selectFont(key);
        });
        
        return li;
    };

    // This is the modern, sorted loop from v1.2.4
    const sortedKeys = Object.keys(currentAllFonts).sort((a, b) => {
        if (a === 'example') return -1;
        if (b === 'example') return 1;
        if (a.startsWith('user_') && !b.startsWith('user_')) return 1;
        if (!a.startsWith('user_') && b.startsWith('user_')) return -1;
        return currentAllFonts[a].fontName.localeCompare(currentAllFonts[b].fontName);
    });

    let hasAddedSeparator = false;
    for (const key of sortedKeys) {
        if (key.startsWith('user_') && !hasAddedSeparator) {
            const separator = document.createElement('div');
            separator.className = 'font-list-separator';
            separator.innerHTML = '<span>--- loaded fonts ---</span>';
            list.appendChild(separator);
            hasAddedSeparator = true;
        }
        list.appendChild(createLi(key, currentAllFonts[key]));
    }
    initSmartTooltips();
}
/**
 * Updates the file details (size, char count) in the subheader.
 * @param {object} fontData - The JSON data of the current font.
 * @returns {void}
 */
function updateFontFileInfo(fontData) {
    const detailsSpan = document.getElementById('fontDetails');
    try {
        const fontJsonString = JSON.stringify(fontData);
        const sizeInBytes = new Blob([fontJsonString]).size;
        const charCount = Object.keys(fontData.glyphs || {}).length;
        detailsSpan.textContent = `${dependencies.utils.formatBytes(sizeInBytes)}, ${charCount} chars`;
    } catch (e) {
        detailsSpan.textContent = '';
    }
}

/**
 * Renders the content of the "Font Info" tab.
 * @returns {void}
 */
function renderInfoView() {
    const font = currentAllFonts[currentFontID];
    if (!font || !document.getElementById('info-view').classList.contains('active')) return;

    const techList = document.getElementById('tech-details-list');
    const metadataList = document.getElementById('metadata-list');
    const metadataFallback = document.getElementById('metadata-fallback');

    techList.innerHTML = '';
    metadataList.innerHTML = '';
    metadataFallback.style.display = 'none';

    try {
        const fontJsonString = JSON.stringify(font.data);
        const fileSize = new Blob([fontJsonString]).size;
        const glyphCount = Object.keys(font.data.glyphs || {}).length;
        const outlineStats = analyzeFontOutlines(font.data);

        const techData = {
            'File Name': font.name,
            'File Type': `${font.type.toUpperCase()}`,
            'File Size': formatBytes(fileSize),
            'Glyph Count': glyphCount.toLocaleString(),
        };

        for (const key in techData) {
            techList.innerHTML += `<dt>${key}</dt><dd>${techData[key]}</dd>`;
        }

        const metadata = font.data.original_font_information;
        if (metadata && Object.keys(metadata).length > 0) {
            metadataList.style.display = '';
            metadataFallback.style.display = 'none';
            for (const key in metadata) {
                let value = metadata[key].en || metadata[key];
                if (value) {
                    const finalValue = truncateText(linkify(value));
                    metadataList.innerHTML += `<dt title="${key}">${formatLabelKey(key)}</dt><dd>${finalValue}</dd>`;
                }
            }
        } else {
            metadataList.style.display = 'none';
            metadataFallback.style.display = 'block';
        }
        initSmartTooltips();
    } catch (error) {
        console.error("Failed to render font info:", error);
    }
}
//----------------------------------------> END [UI RENDERING & UPDATES]


//-------------------------------------------------------------
//----------------[   FONT ANALYSIS (WORKER)   ]---------------
//-------------------------------------------------------------

function initFontAnalyzerWorker() {
    try {
        fontAnalyzerWorker = new Worker('./js/workers/font-analyzer.js');
        fontAnalyzerWorker.onmessage = function(e) {
            const result = JSON.parse(e.data);
            updateAnalysisUI(result);
        };
        fontAnalyzerWorker.onerror = function(error) {
            console.error("An error occurred in the Font Analyzer Worker:", error);
        };
    } catch (error) {
        console.error("Failed to initialize the Font Analyzer Worker.", error);
    }
}

function updateAnalysisUI(result) {
    const analysisSpan = document.getElementById('fontAnalysis');
    if (!analysisSpan || !result) return;
    
    let levelClass = '';
    const overallLevel = result.overall;

    switch (overallLevel) {
        case 'Fully Optimized': levelClass = 'level-1'; break;
        case 'Well Optimized': levelClass = 'level-2'; break;
        case 'Acceptable': levelClass = 'level-3'; break;
        case 'Critical': levelClass = 'level-4'; break;
        default: levelClass = 'level-3';
    }

    const displayText = overallLevel.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
    const displayIcon = (levelClass === 'level-3' || levelClass === 'level-4') ? '⚠' : '✓';

    analysisSpan.innerHTML = `<span class="${levelClass}">${displayIcon} ${displayText}</span>`;

    const details = result.detailedMetrics;
    const conclusionFormatted = (result.conclusion || '').replace(/\./g, '.\n');
    const tooltipText = `Evaluation: ${result.evaluation}\nConclusion: ${conclusionFormatted}\n---\nGlyphs: ${details.glyphCount}\nFile Size: ${dependencies.utils.formatBytes(details.fileSize)}\nAvg. Curves: ${details.avgCurveRatio}%`;
    
    analysisSpan.setAttribute('data-tooltip', tooltipText);
    
    initSmartTooltips();
}

function analyzeCurrentFont(fontData) {
    if (!fontAnalyzerWorker) return;
    document.getElementById('fontAnalysis').innerHTML = 'Analyzing...';
    try {
        const fontJsonString = JSON.stringify(fontData);
        const fileSize = new Blob([fontJsonString]).size;
        fontAnalyzerWorker.postMessage({ fontData, fileSize });
    } catch (e) {
        document.getElementById('fontAnalysis').innerHTML = '';
    }
}
//----------------------------------------> END [FONT ANALYSIS (WORKER)]


//-------------------------------------------------------------
//--------------------[   HELPER FUNCTIONS   ]-----------------
//-------------------------------------------------------------

function get_font_FullName(jsonData, fallbackFileName) {
    let fontName = '';
    const info = jsonData.original_font_information;
    if (info) {
        if (info.full_font_name) fontName = info.full_font_name;
        else if (info.font_family_name) {
            const family = info.font_family_name;
            const subFamily = info.font_subfamily_name;
            fontName = (subFamily && subFamily.toLowerCase() !== 'regular') ? `${family} ${subFamily}` : family;
        }
    }
    if (!fontName) {
        fontName = fallbackFileName;
    }
    return fontName.replace(/\.(json|ttf|otf|woff2?)/gi, '').trim();
}

function analyzeFontOutlines(fontData) {
    const stats = { m: 0, l: 0, q: 0, total: 0 };
    for (const char in fontData.glyphs || {}) {
        const outline = fontData.glyphs[char].o || '';
        (outline.match(/[mlq]/g) || []).forEach(cmd => stats[cmd]++);
    }
    stats.total = stats.m + stats.l + stats.q;
    return stats;
}

/**
 * Provides the raw data for the currently active font.
 * This is called by the viewer bridge during the state restoration handshake.
 * @returns {object|null} The JSON data of the current font, or null if not found.
 */
function provideFontDataForRestore() {
    if (currentFontID && currentAllFonts[currentFontID]) {
        return currentAllFonts[currentFontID].data;
    }
    console.warn('[FontManager] provideFontDataForRestore was called but no active font was found.');
    return null;
}
/**
 * Copies the font URL to the clipboard and shows a toast notification.
 * @param {Event} event - The click event to prevent propagation.
 * @param {string} url - The URL string to copy.
 */
function copyFontUrl(event, url) {
    event.stopPropagation(); // Evita que al hacer clic se seleccione la fuente.
    if (navigator.clipboard && url) {
        navigator.clipboard.writeText(url).then(() => {
            dependencies.utils.showToastMessage('URL copied!');
        }).catch(err => {
            console.error('Failed to copy URL: ', err);
            dependencies.utils.showToastMessage('Error copying URL');
        });
    }
}

//----------------------------------------> END [HELPER FUNCTIONS]


export {
    initFontManager,
    updateUI,
    handleFileLoad,
    loadFontFromUrl,
    saveFont,
    loadFontFromFile,
    provideFontDataForRestore,
    analyzeCurrentFont,
    copyFontUrl
};