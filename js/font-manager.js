/**
 * Project: Three.js JSON Font Editor
 * File: editor/js/font-manager.js
 * Created: 2025-08-29
 * Author: @lewopxd
 *
 * Description:
 * This module manages font I/O (loading, saving) and orchestrates font
 * processing via a dedicated worker. It has no direct knowledge of the DOM.
 */

import { showToastMessage } from './utils.js';

//-------------------------------------------------------------
//--------------------[   MODULE STATE   ]---------------------
//-------------------------------------------------------------

let fontProcessorWorker;
let activeFontRequest = null; // Holds the promise callbacks for the active worker request

let stateManager = {}; // Injected from main.js, manages AppState
let dependencies = { ui: null }; // For progress bars, modals, etc.

//----------------------------------------> END [MODULE STATE]


//-------------------------------------------------------------
//--------------------[   INITIALIZATION   ]-------------------
//-------------------------------------------------------------

/**
 * Initializes the font manager and the font processor worker.
 * @param {object} injectedDependencies - An object containing references to other modules.
 * @param {function} onInitialFontsLoaded - Callback to run after default fonts are loaded.
 */
function initFontManager(injectedDependencies, onInitialFontsLoaded) {
    dependencies = {
        ui: injectedDependencies.ui
    };
    stateManager = injectedDependencies.stateManager;

    initFontProcessorWorker();
    fetchAndStoreFonts(onInitialFontsLoaded);
}
//----------------------------------------> END [INITIALIZATION]


//-------------------------------------------------------------
//----------------[   WORKER ORCHESTRATION   ]-----------------
//-------------------------------------------------------------

/**
 * Initializes the font processor worker and its message handlers, which now
 * understand a status-based messaging protocol.
 */
function initFontProcessorWorker() {
    fontProcessorWorker = new Worker('./js/workers/font-processor.worker.js', { type: 'module' });

    fontProcessorWorker.onmessage = (e) => {
        if (!activeFontRequest) return;

        const { status, result, message } = e.data;

        switch (status) {
            case 'processing':
                // The worker has started. We could update the UI here if needed.
                // For now, we just wait for the final result.
                 break;

            case 'success':
                // The worker succeeded, resolve the promise with the font data.
                activeFontRequest.resolve(result);
                activeFontRequest = null;
                 break;

            case 'error':
                // The worker failed, reject the promise with the error message.
                activeFontRequest.reject(new Error(message));
                activeFontRequest = null;
                console.log('Error in worker');
                break;
        }
    };

    fontProcessorWorker.onerror = (e) => {
        // This handles critical errors, like the worker script failing to load.
        const errorMessage = `A critical error occurred in the Font Processor Worker: ${e.message}`;
        if (activeFontRequest) {
            activeFontRequest.reject(new Error(errorMessage));
            activeFontRequest = null;
        }
        console.error("Font Processor Worker Error:", e);
    };
}


/**
 * Central processor for any font source. Determines type, gets ArrayBuffer,
 * and sends it to the worker for parsing (if binary) or handles it directly (if JSON).
 * This robust version handles both network and HTTP errors before attempting a fallback.
 * @param {File|object} source - A File object from user input or a config object {url, name, key}.
 * @returns {Promise<object>} A promise that resolves with the parsed .typeface.json data.
 */
function processFontSource(source) {
    return new Promise(async (resolve, reject) => {
        if (activeFontRequest) {
            return reject(new Error("Another font is already being processed. Please wait."));
        }
        
        const isFile = source instanceof File;
        const fileName = source.name.toLowerCase();
        const extension = fileName.split('.').pop();
        const isBinary = ['ttf', 'otf', 'woff', 'woff2'].includes(extension);

        let buffer;

        if (isFile) {
            buffer = await source.arrayBuffer();
        } else {
            try {
                // --- Attempt 1: Fetch from the primary URL (CDN) ---
                const response = await fetch(source.url);
                if (!response.ok) {
                    // If the response is not OK (e.g., 404), throw to trigger the fallback.
                    throw new Error(`HTTP status ${response.status}`);
                }
                buffer = await response.arrayBuffer();
            } catch (primaryError) {
                // --- Attempt 2: Local Fallback ---
                // This block is reached on a network error OR a non-ok HTTP status from the primary fetch.
                try {
                    const urlPathSegment = source.url.substring(source.url.indexOf('/examples/') + 1);
                    const fallbackUrl = `./threejs_official/${urlPathSegment}`;
                    const fallbackResponse = await fetch(fallbackUrl);
                    if (!fallbackResponse.ok) {
                        throw new Error(`HTTP status ${fallbackResponse.status}`);
                    }
                    buffer = await fallbackResponse.arrayBuffer();
                    source.isFallback = true;
                } catch (fallbackError) {
                    // If we end up here, both the primary and fallback attempts have failed.
                    reject(new Error(`Failed to load font '${source.name}'. CDN: ${primaryError.message}, Fallback: ${fallbackError.message}`));
                    return; // Exit after rejecting the promise.
                }
            }
        }

        // If a buffer was successfully obtained, proceed to process it.
        try {
            if (isBinary) {
                switch (extension) {
                    case 'ttf':
                        activeFontRequest = { resolve, reject };
                        fontProcessorWorker.postMessage({ buffer, type: extension }, [buffer]);
                        break;
                    default:
                        reject(new Error(`Binary format '${extension}' is not supported for processing.`));
                        break;
                }
            } else { // It's JSON, process on main thread
                const jsonString = new TextDecoder().decode(buffer);
                resolve(JSON.parse(jsonString));
            }
        } catch (parsingError) {
             reject(new Error(`Failed to parse font data for '${fileName}': ${parsingError.message}`));
        }
    });
}
//----------------------------------------> END [WORKER ORCHESTRATION]


//-------------------------------------------------------------
//-------------[   FONT DATA FETCHING & PROCESSING   ]---------
//-------------------------------------------------------------

/**
 * Fetches the default Three.js example fonts sequentially.
 * @param {function} onComplete - Callback with the ID of the first font to be selected.
 */
async function fetchAndStoreFonts(onComplete) {
    dependencies.ui.updateProgressBar(5);
    const fontsToLoad = [
        // ---  Droid ( /droid/) ---
        { key: 'droid_sans_bold', name: 'droid_sans_bold.typeface.json', url: 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/droid/droid_sans_bold.typeface.json' },
        { key: 'droid_sans_mono_regular', name: 'droid_sans_mono_regular.typeface.json', url: 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/droid/droid_sans_mono_regular.typeface.json' },
        { key: 'droid_sans_regular', name: 'droid_sans_regular.typeface.json', url: 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/droid/droid_sans_regular.typeface.json' },
        { key: 'droid_serif_bold', name: 'droid_serif_bold.typeface.json', url: 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/droid/droid_serif_bold.typeface.json' },
        { key: 'droid_serif_regular', name: 'droid_serif_regular.typeface.json', url: 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/droid/droid_serif_regular.typeface.json' },
        
        // --- standar ---
        { key: 'gentilis_bold', name: 'gentilis_bold.typeface.json', url: 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/gentilis_bold.typeface.json' },
        { key: 'gentilis_regular', name: 'gentilis_regular.typeface.json', url: 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/gentilis_regular.typeface.json' },
        { key: 'helvetiker_bold', name: 'helvetiker_bold.typeface.json', url: 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/helvetiker_bold.typeface.json' },
        { key: 'helvetiker_regular', name: 'helvetiker_regular.typeface.json', url: 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/helvetiker_regular.typeface.json' },
        
        // ---  TTF ( /ttf/) ---
        { key: 'kenpixel', name: 'kenpixel.ttf', url: 'helvetiker_regular.typeface.json', url: 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/ttf/kenpixel.ttf' },
    
        // --- standar ---
        { key: 'optimer_bold', name: 'optimer_bold.typeface.json', url: 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/optimer_bold.typeface.json' },
        { key: 'optimer_regular', name: 'optimer_regular.typeface.json', url: 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/optimer_regular.typeface.json' }
    ];
    let firstFontID = null;

    for (const [index, fontConfig] of fontsToLoad.entries()) {
        try {
            const typefaceJson = await processFontSource(fontConfig);
            const fontObject = {
                originalName: fontConfig.name,
                fontName: get_font_FullName(typefaceJson, fontConfig.name),
                originalType: 'json',
                jsonData: typefaceJson,
                url: fontConfig.url,
                isFallback: fontConfig.isFallback || false
            };
            const fontId = stateManager.addFont(fontObject, fontConfig.key);
            if (!firstFontID) {
                firstFontID = fontId;
            }
            dependencies.ui.updateProgressBar(5 + (index + 1) / fontsToLoad.length * 90);
        } catch (error) {
            console.error(`Failed to load and process '${fontConfig.name}':`, error);
        }
    }

    if (onComplete && firstFontID) {
        onComplete(firstFontID);
    }
    dependencies.ui.finishLoadingProgress();
}

/**
 * Event handler for the file input. Triggers font processing.
 * @param {Event} event - The change event from the file input.
 */
async function handleFileLoad(event) {
    dependencies.ui.updateProgressBar(10);
    const file = event.target.files[0];
    if (!file) {
        dependencies.ui.resetLoadingProgressOnError();
        return;
    }

    try {
        const typefaceJson = await processFontSource(file);
        const fileType = file.name.toLowerCase().split('.').pop();

        const appStateObject = {
            originalName: file.name,
            fontName: get_font_FullName(typefaceJson, file.name),
            originalType: fileType,
            jsonData: typefaceJson
        };

        const newID = stateManager.addFont(appStateObject);
        stateManager.selectFont(newID);
        dependencies.ui.finishLoadingProgress();

    } catch (error) {
        dependencies.ui.handle_error(error, { openConsole: true, showInAlert: true });
        dependencies.ui.resetLoadingProgressOnError();
    }
}

/**
 * Fetches and processes a font from a given URL.
 */
async function loadFontFromUrl() {
    dependencies.ui.updateProgressBar(10);
    const url = document.getElementById('fontUrlInput').value.trim();
    if (!url) {
        dependencies.ui.handle_error(new Error("URL cannot be empty."), { showInAlert: true });
        return;
    }
    try {
        const fontName = url.split('/').pop() || 'new-font.json';
        const fileType = fontName.toLowerCase().split('.').pop();
        const sourceConfig = { url: url, name: fontName };

        const typefaceJson = await processFontSource(sourceConfig);

        const appStateObject = {
            originalName: fontName,
            fontName: get_font_FullName(typefaceJson, fontName),
            originalType: fileType,
            jsonData: typefaceJson,
            url: url
        };

        const newID = stateManager.addFont(appStateObject);
        stateManager.selectFont(newID);
        dependencies.ui.hideUrlModal();
        dependencies.ui.finishLoadingProgress();

    } catch (error) {
        dependencies.ui.handle_error(new Error(`Failed to load font from URL: ${error.message}`), { openConsole: true, showInAlert: true });
        dependencies.ui.resetLoadingProgressOnError();
    }
}
//----------------------------------------> END [FONT DATA FETCHING & PROCESSING]


//-------------------------------------------------------------
//---------------------[   FONT SAVING   ]---------------------
//-------------------------------------------------------------

/**
 * Triggers a download of the provided font data as a .json file.
 * @param {string} fontDataString - The JSON string of the font data.
 * @param {string} originalFileName - The original name of the font file.
 */
function saveFont(fontDataString, originalFileName) {
    const blob = new Blob([fontDataString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = originalFileName.replace(/\.(json|ttf|otf|woff2?)$/i, '') + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Triggers the hidden file input dialog.
 */
function loadFontFromFile() {
    document.getElementById('fileInput').click();
    document.getElementById('addFontContextMenu').style.display = 'none';
}
//----------------------------------------> END [FONT SAVING]


//-------------------------------------------------------------
//--------------------[   HELPER FUNCTIONS   ]-----------------
//-------------------------------------------------------------

/**
 * Extracts a display-friendly full name from the font's metadata.
 * @param {object} jsonData - The .typeface.json object.
 * @param {string} fallbackFileName - The original filename to use as a fallback.
 * @returns {string} The formatted font name.
 */
function get_font_FullName(jsonData, fallbackFileName) {
    if (!jsonData) return fallbackFileName.replace(/\.(json|ttf|otf|woff2?)/gi, '').trim();
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
    return fontName ? fontName.trim() : fallbackFileName.replace(/\.(json|ttf|otf|woff2?)/gi, '').trim();
}

/**
 * Provides the raw data for the currently active font.
 * @returns {object|null} The .typeface.json data of the current font.
 */
function provideFontDataForRestore() {
    const state = stateManager.getState();
    if (state.currentFontID && state.inAppFonts[state.currentFontID]) {
        return state.inAppFonts[state.currentFontID].data;
    }
    return null;
}

/**
 * Copies the font URL to the clipboard and shows a toast notification.
 * @param {Event} event - The click event to prevent propagation.
 * @param {string} url - The URL string to copy.
 */
function copyFontUrl(event, url) {
    event.stopPropagation();
    if (navigator.clipboard && url) {
        navigator.clipboard.writeText(url).then(() => {
            showToastMessage('URL copied!');
        }).catch(err => {
            showToastMessage('Error copying URL');
        });
    }
}

/**
 * Deletes a user-added font from the application state.
 * @param {Event} event - The click event to prevent propagation.
 * @param {string} fontId - The ID of the font to delete.
 */
function deleteUserFont(event, fontId) {
    event.stopPropagation();
    // The main module will handle the state update and UI repaint.
    stateManager.deleteFont(fontId); 
}
//----------------------------------------> END [HELPER FUNCTIONS]


export {
    initFontManager,
    handleFileLoad,
    loadFontFromUrl,
    saveFont,
    loadFontFromFile,
    provideFontDataForRestore,
    copyFontUrl,
    deleteUserFont,
    get_font_FullName
};