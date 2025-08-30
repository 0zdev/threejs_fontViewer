/**
 * Project: Three.js JSON Font Editor
 * File: editor/js/font-manager.js
 * Created: 2025-08-29
 * Author: [Tu Nombre/Apodo]
 *
 * Description:
 * This module manages all font data and related logic, including loading,
 * processing, storing, and rendering font-specific UI components.
 */

import { initSmartTooltips, formatBytes, formatLabelKey, linkify, truncateText } from './utils.js';

//-------------------------------------------------------------
//--------------------[   MODULE STATE   ]---------------------
//-------------------------------------------------------------

/**
 * @var {object} fontDataStore - Stores pre-loaded example fonts.
 * @var {object} userLoadedFonts - Stores fonts loaded by the user during the session.
 * @var {string} currentFontKey - The key of the currently active font.
 * @var {Worker|null} fontAnalyzerWorker - The web worker for font analysis.
 */
const fontDataStore = {
    'example': { name: 'example.json', fontName: 'Example', type: 'json', data: { "glyphs": { "n": { "x_min": 0, "x_max": 669, "ha": 782, "o": "m 669 0 l 469 0 l 469 452 q 442 553 469 513 q 352 601 412 601 q 245 553 290 601 q 200 441 200 505 l 200 0 l 0 0 l 0 748 l 194 748 l 194 659 q 289 744 230 713 q 416 775 349 775 q 600 700 531 775 q 669 509 669 626 l 669 0 " } }, "boundingBox": { "yMin": -333, "xMin": -162, "yMax": 1216, "xMax": 1681 }, "resolution": 1000 } }
};
let userLoadedFonts = {};
export let currentFontKey = 'example';
let fontAnalyzerWorker;

// Dependencies injected from main.js
let dependencies = {
    editor: null,
    ui: null,
    viewer: null
};

let onFontLoadedCallback = () => { };

//----------------------------------------> END [MODULE STATE]


//-------------------------------------------------------------
//--------------------[   INITIALIZATION   ]-------------------
//-------------------------------------------------------------

/**
 * Initializes the font manager and its components.
 * @param {object} injectedDependencies - An object containing references to other modules.
 * @returns {void}
 */
function initFontManager(injectedDependencies) {
    dependencies = injectedDependencies;
    // Store the callback function passed from main.js
    onFontLoadedCallback = injectedDependencies.onFontLoaded || onFontLoadedCallback;
    initFontAnalyzerWorker();
    fetchAndStoreFonts();
}
//----------------------------------------> END [INITIALIZATION]


//-------------------------------------------------------------
//-------------[   FONT DATA FETCHING & STORAGE   ]------------
//-------------------------------------------------------------

/**
 * Fetches the default Three.js example fonts and stores them.
 * @returns {Promise<void>}
 */
/**
 * Fetches the default Three.js example fonts and stores them.
 * It first tries the official URL, then falls back to a local copy if the URL fails.
 * @returns {Promise<void>}
 */
async function fetchAndStoreFonts() {
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

    for (const font of fontsToLoad) {
        let fontData;
        let isFallback = false;
        const filename = font.url.split('/').pop();

        try {
            
            const response = await fetch(font.url);
            if (!response.ok) throw new Error(`HTTP error ${response.status} for ${font.url}`);
            fontData = await response.json();
            //console.log(`Successfully loaded '${font.name}' from URL.`);
        } catch (error) {
            console.warn(`Could not fetch '${font.name}' from URL. Attempting local fallback...`, error);
            isFallback = true;
            
             
            try {
                const fallbackUrl = `./threejs_official/examples/fonts/${filename}`;
                const fallbackResponse = await fetch(fallbackUrl);
                if (!fallbackResponse.ok) throw new Error(`HTTP error ${fallbackResponse.status} for local file ${filename}`);
                fontData = await fallbackResponse.json();
                console.log(`Successfully loaded '${font.name}' from LOCAL FALLBACK.`);
            } catch (fallbackError) {
                console.error(`Failed to load '${font.name}' from both URL and local fallback. Skipping.`, fallbackError);
                continue;  
            }
        }
        
         fontDataStore[font.key] = {
            data: fontData,
            name: filename,
            fontName: get_font_FullName(fontData, font.name),
            url: font.url,  
            type: 'json',
            isFallback: isFallback 
        };
    }

     populateFontListUI();
    const initialFont = fontDataStore[currentFontKey];
    if (initialFont) {
        loadFontIntoEditor({
            originalName: initialFont.name,
            fontName: initialFont.fontName,
            originalType: initialFont.type,
            jsonData: initialFont.data
        });
    }
}

/**
 * Adds a user-loaded font to the session store and loads it.
 * @param {object} fontObject - The processed font object to add.
 * @returns {void}
 */
function addUserFont(fontObject) {
    const fontKey = `user_${Date.now()}`;
    userLoadedFonts[fontKey] = {
        name: fontObject.originalName,
        fontName: fontObject.fontName,
        type: fontObject.originalType,
        data: fontObject.jsonData,
        url: fontObject.url || null
    };

    currentFontKey = fontKey;

    populateFontListUI();
    loadFontIntoEditor(fontObject);

    // Update the UI to show the new font as active
    const newLi = document.querySelector(`#fontList li[data-font-key="${fontKey}"]`);
    if (newLi) {
        document.querySelectorAll('#fontList li').forEach(item => item.classList.remove('active'));
        newLi.classList.add('active');
    }
}

/**
 * Deletes a font from the user-loaded font store.
 * @param {Event} event - The click event.
 * @param {string} fontKey - The key of the font to delete.
 * @returns {void}
 */
function deleteUserFont(event, fontKey) {
    event.stopPropagation();
    delete userLoadedFonts[fontKey];
    populateFontListUI();
    if (currentFontKey === fontKey) {
        // Fallback to the default example font
        const firstLi = document.querySelector(`#fontList li[data-font-key="example"]`);
        selectFontFromList('example', firstLi);
    }
}

/**
 * Copies a font's URL to the clipboard and shows a toast message.
 * @param {Event} event - The click event.
 * @param {string} url - The URL string to copy.
 * @returns {void}
 */
function copyFontUrl(event, url) {
    event.stopPropagation(); // Prevent the font from being selected
    navigator.clipboard.writeText(url).then(() => {
            dependencies.utils.showToastMessage('URL copied to clipboard');
    }).catch(err => {
        console.error('Failed to copy URL: ', err);
    });
}
//----------------------------------------> END [FONT DATA FETCHING & STORAGE]


//-------------------------------------------------------------
//--------------[   FONT LOADING & PROCESSING   ]--------------
//-------------------------------------------------------------

/**
 * Event handler for the file input. Triggers font processing.
 * @param {Event} event - The change event from the file input.
 * @returns {Promise<void>}
 */
async function handleFileLoad(event) {
    dependencies.ui.updateProgressBar(10);
    const file = event.target.files[0];
    if (!file) return;

    try {
        const fontObject = await file_manager(file);
        addUserFont(fontObject);
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

        addUserFont({
            originalName: fontName,
            fontName: get_font_FullName(fontData, fontName),
            originalType: 'json',
            jsonData: fontData,
            url: url
        });

        dependencies.ui.hideUrlModal();
    } catch (error) {
        dependencies.ui.handle_error(new Error(`Failed to load font from URL: ${error.message}`), { openConsole: true, showInAlert: true });
    }
}

/**
 * Processes a file, whether it's JSON or TTF.
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
            undefined, // onProgress callback not needed here
            (error) => {
                URL.revokeObjectURL(fontUrl);
                console.error('TTFLoader error:', error);
                reject(new Error('Failed to convert TTF font.'));
            }
        );
    });
}
//----------------------------------------> END [FONT LOADING & PROCESSING]


//-------------------------------------------------------------
//---------------------[   FONT SAVING   ]---------------------
//-------------------------------------------------------------

/**
 * Triggers a download of the current editor content as a .json file.
 * @returns {void}
 */
function saveFont() {
    const editor = dependencies.editor.getEditorInstance();
    const blob = new Blob([editor.getValue()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const currentName = document.querySelector('#fileInfo > span:last-of-type').textContent || 'font';
    a.download = currentName.replace(/\.(json|ttf|otf)$/i, '') + '.json';
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
 * Loads a processed font object into the editor and updates all relevant UI.
 * @param {object} fontObject - The standardized font object.
 * @returns {void}
 */
function loadFontIntoEditor(fontObject) {
    dependencies.ui.updateProgressBar(20);

    const editor = dependencies.editor.getEditorInstance();
    editor.setValue(JSON.stringify(fontObject.jsonData, null, 2));

    dependencies.ui.updateProgressBar(40);

    const fileInfoSpan = document.getElementById('fileInfo');
    if (fontObject.originalType === 'ttf') {
        fileInfoSpan.innerHTML = `<span class="subheader-format">(TTF)</span> <span>${fontObject.fontName}</span> <span style="margin: 0 4px; color: var(--color-text-light);">></span> <span>.json</span>`;
    } else {
        fileInfoSpan.innerHTML = `<span class="subheader-format">(JSON)</span> <span>${fontObject.fontName}</span>`;
    }

    // Lock the editor by default on any new font load
    if (!dependencies.editor.isEditorLocked) {
        dependencies.editor.toggleEditorLock();
    }

    updateFontFileInfo();
    analyzeCurrentFont();
    renderInfoView(); // Update info tab
    dependencies.viewer.update(); // Trigger viewer update

    dependencies.ui.finishLoadingProgress();

    onFontLoadedCallback();

}

/**
 * Re-draws the entire font list in the UI based on the current state.
 * It now handles rendering a fallback icon for locally loaded fonts.
 * @returns {void}
 */
function populateFontListUI() {
    const list = document.getElementById('fontList');
    list.innerHTML = '';

    const createLi = (key, font) => {
        const li = document.createElement('li');
        const isUserFont = key.startsWith('user_');

        const iconSVG = font.url && !isUserFont
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.72"></path></svg>`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;
        
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

        li.addEventListener('click', (e) => {
            if (e.target.closest('.copy-event-interceptor') || e.target.closest('.font-action-fallback')) return;
            selectFontFromList(key, li);
        });
        
        return li;
    };

     list.appendChild(createLi('example', fontDataStore['example']));
    for (const key in fontDataStore) {
        if (key !== 'example') list.appendChild(createLi(key, fontDataStore[key]));
    }
    if (Object.keys(userLoadedFonts).length > 0) {
        const separator = document.createElement('div');
        separator.className = 'font-list-separator';
        separator.innerHTML = '<span>--- loaded fonts ---</span>';
        list.appendChild(separator);
        for (const key in userLoadedFonts) list.appendChild(createLi(key, userLoadedFonts[key]));
    }
    initSmartTooltips();
}



/**
 * Handles the selection of a font from the list.
 * @param {string} fontKey - The key of the selected font.
 * @param {HTMLElement} element - The clicked <li> element.
 * @returns {void}
 */
function selectFontFromList(fontKey, element) {
    dependencies.ui.updateProgressBar(10);
    const font = fontDataStore[fontKey] || userLoadedFonts[fontKey];
    if (font) {
        currentFontKey = fontKey;
        loadFontIntoEditor({
            originalName: font.name,
            fontName: font.fontName,
            originalType: font.type,
            jsonData: font.data
        });

        document.querySelectorAll('#fontList li').forEach(item => item.classList.remove('active'));
        element.classList.add('active');
    }
}

/**
 * Updates the file details (size, char count) in the subheader.
 * @returns {void}
 */
function updateFontFileInfo() {
    const detailsSpan = document.getElementById('fontDetails');
    const editor = dependencies.editor.getEditorInstance();
    try {
        const fontJsonString = editor.getValue();
        const sizeInBytes = new Blob([fontJsonString]).size;

        const fontData = JSON.parse(fontJsonString);
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
    const font = fontDataStore[currentFontKey] || userLoadedFonts[currentFontKey];
    if (!font) return;

    const editor = dependencies.editor.getEditorInstance();
    const techList = document.getElementById('tech-details-list');
    const metadataList = document.getElementById('metadata-list');
    const metadataFallback = document.getElementById('metadata-fallback');

    techList.innerHTML = '';
    metadataList.innerHTML = '';
    metadataFallback.style.display = 'none';

    try {
        const fileSize = new Blob([editor.getValue()]).size;
        const glyphCount = Object.keys(font.data.glyphs || {}).length;
        const outlineStats = analyzeFontOutlines(font.data);
        
        const breakdown = [
            outlineStats.m > 0 ? `<span data-tooltip="m = moveto">(m: ${outlineStats.m.toLocaleString()})</span>` : '',
            outlineStats.l > 0 ? `<span data-tooltip="l = lineto">(l: ${outlineStats.l.toLocaleString()})</span>` : '',
            outlineStats.q > 0 ? `<span data-tooltip="q = quadratic curveto">(q: ${outlineStats.q.toLocaleString()})</span>` : ''
        ].filter(Boolean).join(' ');

        const techData = {
            'File Name': font.name,
            'File Type': `${font.type.toUpperCase()}`,
            'File Size': formatBytes(fileSize),
            'Glyph Count': glyphCount.toLocaleString(),
            'Commands': `${outlineStats.total.toLocaleString()} ${breakdown}`
        };

        for (const key in techData) {
            if (techData[key]) {
                techList.innerHTML += `<dt>${key}</dt><dd>${techData[key]}</dd>`;
            }
        }

        const metadata = font.data.original_font_information;
        if (metadata && Object.keys(metadata).length > 0) {
            let hasContent = false;
            for (const key in metadata) {
                let value = metadata[key].en || metadata[key];
                if (value) {
                    hasContent = true;
                    const finalValue = truncateText(linkify(value));
                    metadataList.innerHTML += `<dt title="${key}">${formatLabelKey(key)}</dt><dd>${finalValue}</dd>`;
                }
            }
            if (!hasContent) metadataFallback.style.display = 'block';
        } else {
            metadataFallback.style.display = 'block';
        }

        initSmartTooltips();

    } catch (error) {
        console.error("Failed to render font info:", error);
        techList.innerHTML = `<dt>Error</dt><dd>Could not parse font data to render info.</dd>`;
    }
}

//----------------------------------------> END [UI RENDERING & UPDATES]


//-------------------------------------------------------------
//----------------[   FONT ANALYSIS (WORKER)   ]---------------
//-------------------------------------------------------------

/**
 * Initializes the web worker for font analysis by loading it from its dedicated file.
 * @returns {void}
 */
function initFontAnalyzerWorker() {
     try {
        
        fontAnalyzerWorker = new Worker('./js/workers/font-analyzer.js');

         fontAnalyzerWorker.onmessage = function (e) {
             const result = JSON.parse(e.data);
             updateAnalysisUI(result);
        };

         fontAnalyzerWorker.onerror = function(error) {
            console.error("An error occurred in the Font Analyzer Worker:", error);
            dependencies.ui.handle_error(new Error(`Worker error: ${error.message}`));
        };

    } catch (error) {
        console.error("Failed to initialize the Font Analyzer Worker.", error);
        dependencies.ui.handle_error(error);
    }
}

/**
 * Updates the font analysis section of the UI with results from the worker.
 * @param {object} result - The analysis result object from the worker.
 * @returns {void}
 */
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

/**
 * Triggers the analysis of the font currently in the editor.
 * It gets the data, calculates the size, and posts it to the worker.
 * @returns {void}
 */
function analyzeCurrentFont() {
    //@leo, Esta es la función completa que faltaba para INICIAR el análisis.
    const editor = dependencies.editor.getEditorInstance();
    if (!fontAnalyzerWorker || !editor) {
        // Silently fail if worker or editor aren't ready.
        return;
    }

    // Set a temporary "Analyzing..." message in the UI
    document.getElementById('fontAnalysis').innerHTML = 'Analyzing...';
    document.getElementById('fontAnalysis').removeAttribute('data-tooltip');

    try {
        const fontJsonString = editor.getValue();
        const fontData = JSON.parse(fontJsonString);
        const fileSize = new Blob([fontJsonString]).size;

        // This is the crucial line that was missing:
        // Send the data to the worker to start the analysis.
        fontAnalyzerWorker.postMessage({ fontData, fileSize });

    } catch (e) {
        // If JSON is invalid while trying to analyze, just clear the display.
        document.getElementById('fontAnalysis').innerHTML = '';
    }
}


//----------------------------------------> END [FONT ANALYSIS (WORKER)]


//-------------------------------------------------------------
//--------------------[   HELPER FUNCTIONS   ]-----------------
//-------------------------------------------------------------

/**
 * Extracts a display-friendly full name from font metadata.
 * It searches in multiple possible locations within the JSON data.
 * @param {object} jsonData - The Three.js font data.
 * @param {string} fallbackFileName - A fallback name to use if metadata is absent.
 * @returns {string} The determined full name of the font.
 */
function get_font_FullName(jsonData, fallbackFileName) {
    let fontName = '';

    // Priority 1: Modern metadata object from opentype.js
    const info = jsonData.original_font_information;
    if (info) {
        if (info.full_font_name) {
            fontName = info.full_font_name;
        } else if (info.font_family_name) {
            const family = info.font_family_name;
            const subFamily = info.font_subfamily_name;
            fontName = (subFamily && subFamily.toLowerCase() !== 'regular') ? `${family} ${subFamily}` : family;
        } else if (info.postscript_name) {
            fontName = info.postscript_name;
        }
    }

    // Priority 2: Older Three.js JSON format fields
    if (!fontName) {
        if (typeof jsonData.fullName === 'string') {
            fontName = jsonData.fullName;
        } else if (jsonData.fontFamily?.en || jsonData.familyName) {
            const family = jsonData.fontFamily?.en || jsonData.familyName;
            const subFamily = jsonData.fontSubfamily?.en || jsonData.styleName;
            if (subFamily && !family.toLowerCase().includes(subFamily.toLowerCase())) {
                fontName = `${family} ${subFamily}`;
            } else {
                fontName = family;
            }
        }
    }

    // Priority 3: Fallback to the file name
    if (!fontName) {
        fontName = fallbackFileName;
    }

    // Final cleanup: remove file extensions
    return fontName.replace(/\.(json|ttf|otf|woff2?)/gi, '').trim();
}

/**
 * Analyzes the outlines of all glyphs to count drawing commands.
 * @param {object} fontData - The Three.js font data.
 * @returns {{m: number, l: number, q: number, total: number}} An object with command counts.
 */
function analyzeFontOutlines(fontData) {
    const stats = { m: 0, l: 0, q: 0, total: 0 };
    const glyphs = fontData.glyphs || {};

    for (const char in glyphs) {
        const outline = glyphs[char].o || '';
        const commands = outline.match(/[mlq]/g) || [];
        for (const cmd of commands) {
            stats[cmd]++;
        }
    }

    stats.total = stats.m + stats.l + stats.q;
    return stats;
}
//----------------------------------------> END [HELPER FUNCTIONS]



export {
    initFontManager,
    handleFileLoad,
    loadFontFromUrl,
    saveFont,
    loadFontFromFile,
    selectFontFromList,
    deleteUserFont,  
    copyFontUrl       
};