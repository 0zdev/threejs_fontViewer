/**
 * Project: Three.js JSON Font Editor
 * File: editor/js/main.js
 * Created: 2025-08-29
 * Author: @lewopxd
 *
 * Description:
 * This is the main entry point and orchestrator for the application. It imports
 * all modules, manages the global application state, initializes all components,
 * and delegates UI updates to the ui-manager.
 */

import * as Editor from './editor-config.js';
import * as UI from './ui-manager.js';
import * as Utils from './utils.js';
import * as FontManager from './font-manager.js';
import * as Viewer from './viewer-bridge.js';
import * as Versioner from './three-versioner.js';
import * as GlyphViewer from './glyph-viewer.js';
import * as FontPreviewer from './font-previewer.js';

//-------------------------------------------------------------
//-------------------[   APPLICATION STATE   ]-----------------
//-------------------------------------------------------------

// Al inicio de js/main.js

const default_version_string = 'r128';
const default_threejs_version_url = `https://cdnjs.cloudflare.com/ajax/libs/three.js/${default_version_string}/three.min.js`;
let glyphSorterWorker = null;
let sortedGlyphMaps = {};

let AppState = {
    inAppFonts: {},
    currentFontID: null,
    isEditing: false,
    editingBuffer: "",
    isGlyphSortActive: true,
    fontDataHasChanged: true,
    viewerState: {
        panEnabled: false,
        zoomEnabled: true,
        is3D: true,
        gridVisible: true,
        rotationEnabled: true,
        rotateObjectEnabled: true,
        moveObjectEnabled: false,
        rotateCameraEnabled: false,
        isWireframeModeActive: false,
        isBoundingBoxVisible: false,
        savedViewState: null,
        currentColor: '#0077fe',
        currentAlpha: 1.0,
        currentMaterialName: 'Phong'
    }
};
let isProgrammaticEdit = false;






//----------------------------------------> END [APPLICATION STATE]


//-------------------------------------------------------------
//---------------------[   STATE MUTATIONS   ]-----------------
//-------------------------------------------------------------

function selectFont(fontID) {
    if (AppState.isEditing) {
        Utils.showConfirmationModal({
            title: "Unsaved Changes",
            text: "You have unsaved changes. Do you want to save them before switching?",
            buttons: [{
                label: 'Discard',
                callback: () => {
                    _discardChanges();
                    _setCurrentFont(fontID);
                }
            }, {
                label: 'Save & Switch',
                callback: () => {
                    _saveChanges();
                    _setCurrentFont(fontID);
                }
            }]
        });
    } else {
        _setCurrentFont(fontID);
    }
}

function _setCurrentFont(fontID, isInitialLoad = false) {
    if (!AppState.inAppFonts[fontID]) {
        console.error(`Font with ID ${fontID} not found in AppState.`);
        return;
    }
    AppState.currentFontID = fontID;
    AppState.isEditing = false;
    AppState.editingBuffer = "";
    AppState.fontDataHasChanged = true;

    const fontData = AppState.inAppFonts[fontID].data;
    const editor = Editor.getEditorInstance();

    isProgrammaticEdit = true;
    editor.setValue(JSON.stringify(fontData, null, 2));
    isProgrammaticEdit = false;
    editor.clearHistory();
    editor.setOption('readOnly', true);

    const uiState = isInitialLoad ? 'initialLoad' : 'fontSelected';
    UI.updateUI(uiState, { appState: AppState });

    updateViewer({ shouldResetPosition: false, shouldFrame: false });
    // FontManager.analyzeCurrentFont(fontData); // Consider adding a dedicated analyzer module

    if (glyphSorterWorker && fontData.glyphs && !sortedGlyphMaps[fontID]) {
        glyphSorterWorker.postMessage({
            fontKey: fontID,
            glyphs: fontData.glyphs
        });
    }
}

function addFont(fontObject, customID = null) {
    const fontID = customID || `user_${Date.now()}`;
    AppState.inAppFonts[fontID] = {
        id: fontID,
        name: fontObject.originalName,
        fontName: fontObject.fontName,
        type: fontObject.originalType,
        data: fontObject.jsonData,
        url: fontObject.url || null,
        isFallback: fontObject.isFallback || false
    };

    UI.updateUI('fontAdded', { appState: AppState });
    return fontID;
}

function startEditing() {
    const editor = Editor.getEditorInstance();
    if (!editor) return;
    AppState.isEditing = true;
    AppState.editingBuffer = editor.getValue();
    editor.setOption('readOnly', false);
    editor.focus();
    UI.updateUI('editingStateChanged', { appState: AppState });
}

function _saveChanges() {
    if (!AppState.isEditing || !AppState.currentFontID) return;
    try {
        const updatedFontData = JSON.parse(AppState.editingBuffer);
        const font = AppState.inAppFonts[AppState.currentFontID];

        font.data = updatedFontData;
        font.fontName = FontManager.get_font_FullName(updatedFontData, font.name);

        AppState.isEditing = false;
        AppState.editingBuffer = "";
        AppState.fontDataHasChanged = true;
        Editor.getEditorInstance().setOption('readOnly', true);

        UI.updateUI('fontSaved', { appState: AppState });
        // FontManager.analyzeCurrentFont(updatedFontData);
        Utils.showToastMessage(`${font.fontName} saved.`);
    } catch (error) {
        UI.handle_error(error, { openConsole: true });
    }
}

function _discardChanges() {
    if (!AppState.isEditing || !AppState.currentFontID) return;
    const fontData = AppState.inAppFonts[AppState.currentFontID].data;
    const editor = Editor.getEditorInstance();
    isProgrammaticEdit = true;
    editor.setValue(JSON.stringify(fontData, null, 2));
    isProgrammaticEdit = false;
    editor.setOption('readOnly', true);
    AppState.isEditing = false;
    AppState.editingBuffer = "";
    Utils.showToastMessage("Changes discarded.");
    UI.updateUI('editingStateChanged', { appState: AppState });
}

function _onEditorChange() {
    if (isProgrammaticEdit) return;
    if (!AppState.isEditing) {
        AppState.isEditing = true;
        UI.updateUI('editingStateChanged', { appState: AppState });
    }

    AppState.fontDataHasChanged = true;
    AppState.editingBuffer = Editor.getEditorInstance().getValue();
    liveUpdateViewer();
}

function reloadViewerWithState(newContent) {
    const parentState = {
        ...AppState.viewerState,
        text: document.getElementById('textInput').value
    };
    // The bridge's requestAndReload function will handle the content.
    Viewer.requestAndReload(newContent, parentState);
}

/**
 * Removes a font from the application state, triggers a subtle UI update,
 * and selects a default font if the active one was deleted.
 * @param {string} fontID - The ID of the font to remove.
 */
function deleteFont(fontID) {
    if (AppState.inAppFonts[fontID]) {
        const wasActive = AppState.currentFontID === fontID;

        // 1. Remove from state
        delete AppState.inAppFonts[fontID];

        // 2. Trigger subtle DOM removal
        UI.updateUI('fontRemoved', { appState: AppState, removedFontID: fontID });

        // 3. If the active font was deleted, select the default one
        if (wasActive) {
            // Use a reliable default key. 'helvetiker_regular' is a good candidate.
            const defaultFontKey = 'helvetiker_regular';
            if (AppState.inAppFonts[defaultFontKey]) {
                selectFont(defaultFontKey);
            } else {
                // Fallback if the default is somehow missing
                const firstKey = Object.keys(AppState.inAppFonts)[0];
                if (firstKey) selectFont(firstKey);
            }
        }
    }
}

//----------------------------------------> END [STATE MUTATIONS]


//-------------------------------------------------------------
//---------------------[   CORE LOGIC & RENDER   ]-------------
//-------------------------------------------------------------

function updateViewer(options = {}) {
    const { shouldFrame: frameOption = false, shouldResetPosition: resetOption = false } = options;
    if (!AppState.currentFontID) return;

    try {
        const textInput = document.getElementById('textInput').value;
        const fontSourceString = AppState.isEditing ? AppState.editingBuffer : JSON.stringify(AppState.inAppFonts[AppState.currentFontID].data);
        const finalShouldFrame = frameOption || AppState.viewerState.isWireframeModeActive;

        const fontDataToSend = AppState.fontDataHasChanged ? JSON.parse(fontSourceString) : null;

        if (!textInput) {
            Viewer.update({ text: '' });
            return;
        }

        const fontForValidation = fontDataToSend || AppState.inAppFonts[AppState.currentFontID].data;
        const fontName = AppState.inAppFonts[AppState.currentFontID]?.fontName || 'current font';

        if (!validateTextGlyphs(textInput, fontForValidation, fontName)) {
            return;
        }

        Viewer.update({
            fontData: fontDataToSend,
            text: textInput,
            is3D: AppState.viewerState.is3D,
            shouldFrame: finalShouldFrame,
            shouldResetPosition: resetOption,
            fontHasChanged: AppState.fontDataHasChanged
        });

        AppState.fontDataHasChanged = false;

    } catch (error) {
        AppState.fontDataHasChanged = false;
        UI.handle_error(error, { openConsole: true });
    }
}

function validateTextGlyphs(text, fontData, fontName) {
    const availableGlyphs = fontData.glyphs || {};
    for (const char of text) {
        if (!availableGlyphs.hasOwnProperty(char)) {
            const warningMessage = `THREE.Font: character "${char}" does not exist in font family ${fontName}.`;
            UI.logToConsole([warningMessage], true);
            return false;
        }
    }
    return true;
}

function liveUpdateViewer() {
    updateViewer({
        shouldFrame: false,
        shouldResetPosition: false
    });
}

function updateGlyphViewerIfActive() {
    if (document.getElementById('glyphs-view').classList.contains('active')) {
        const font = AppState.inAppFonts[AppState.currentFontID];
        const glyphMap = sortedGlyphMaps[AppState.currentFontID];
        if (font && glyphMap) {
            GlyphViewer.render(font.data, glyphMap, AppState.isGlyphSortActive, window.handleGlyphClick, window.handleCategoryToggle);
        } else if (font) {
            GlyphViewer.render(font.data, null, false, window.handleGlyphClick, null);
        }
    }
}
//----------------------------------------> END [CORE LOGIC & RENDER]


//-------------------------------------------------------------
//---------------------[   INITIALIZATION   ]------------------
//-------------------------------------------------------------

function initGlyphSorterWorker() {
    try {
        glyphSorterWorker = new Worker('./js/workers/glyph-sorter.js');
        glyphSorterWorker.onmessage = function (e) {
            const { fontKey, glyphMap, error } = e.data;
            if (error) {
                console.error(`[GlyphSorter Worker] Error for font ${fontKey}:`, error);
                return;
            }
            if (fontKey && glyphMap) {
                glyphMap.categorizedOrder.forEach(category => {
                    category.isCollapsed = false;
                });
                sortedGlyphMaps[fontKey] = glyphMap;
                updateGlyphViewerIfActive();
            }
        };
        glyphSorterWorker.onerror = (err) => console.error("Error in GlyphSorter Worker:", err);
    } catch (error) {
        console.error("Failed to initialize the GlyphSorter Worker.", error);
    }
}

function initializeApp() {
    const stateManager = { addFont, selectFont, deleteFont, getState: () => AppState };
    Editor.initEditor('editor', _onEditorChange);
    initGlyphSorterWorker();
    window.hideInfoModal = Utils.hideInfoModal;
    
    UI.initUIManager({
        stateManager: stateManager,
        fontPreviewer: FontPreviewer,
        glyphViewer: GlyphViewer,
        utils: Utils, // <-- [CORRECTION] Pass the imported Utils module as a dependency.
        onCopyFontUrl: FontManager.copyFontUrl,
        onDeleteUserFont: FontManager.deleteUserFont,
        onThemeChange: (newTheme) => {
            Viewer.updateTheme(newTheme);
            const newColor = window.getComputedStyle(document.body).getPropertyValue('--color-text-preview').trim();
            UI.updateUI('themeChanged', { appState: AppState, newColor });
        },
        onTabSwitch: (tabName) => {

            if (tabName === 'info') {
                UI.updateUI('fontSelected', { appState: AppState });
            }
            if (tabName === 'glyphs') {
                UI.updateUI('fontSelected', { appState: AppState });
                updateGlyphViewerIfActive();
            }
            if (tabName === 'editor') {

                const editor = Editor.getEditorInstance();
                if (editor) {
                    setTimeout(() => editor.refresh(), 1);
                }
            }
        },
        onColorChange: (color, alpha) => {
            AppState.viewerState.currentColor = color;
            AppState.viewerState.currentAlpha = alpha;
            Viewer.setColor(color, alpha);
        },
        onMaterialSelect: (materialName) => {
            AppState.viewerState.currentMaterialName = materialName;
            Viewer.setMaterial(materialName);
        },
        onResizeEnd: () => {
            if (document.getElementById('glyphs-view').classList.contains('active')) {
                GlyphViewer.measureAndRender();
            }
        }
    });

    FontManager.initFontManager({
        stateManager: stateManager,
        ui: UI
    }, (initialFontID) => { _setCurrentFont(initialFontID, true); });

    Versioner.initThreeVersioner({
        ui: UI,
        utils: Utils,
        viewer: { reloadWithState: reloadViewerWithState }
    });

    Viewer.initViewerBridge({ ui: UI, fontManager: FontManager }, () => {
        UI.updateUI('initialLoad', { appState: AppState });
    });


    const initialHtml = Versioner.generateInitialIframeHtml(default_threejs_version_url);
    Viewer.reloadViewerWithVersion(initialHtml);
    Versioner.setInitialVersion(default_version_string, default_threejs_version_url);
}
document.addEventListener('DOMContentLoaded', initializeApp);
//----------------------------------------> END [INITIALIZATION]


//-------------------------------------------------------------
//----------------[   GLOBAL EVENT HANDLERS   ]----------------
//-------------------------------------------------------------

function setMouseMode(mode) {
    const vs = AppState.viewerState;
    vs.panEnabled = mode === 'pan';
    vs.rotateObjectEnabled = mode === 'rotateObject';
    vs.moveObjectEnabled = mode === 'moveObject';
    vs.rotateCameraEnabled = mode === 'rotateCamera';
    Viewer.setMouseState({
        pan: vs.panEnabled, zoom: vs.zoomEnabled,
        rotateObject: vs.rotateObjectEnabled,
        moveObject: vs.moveObjectEnabled, rotateCamera: vs.rotateCameraEnabled
    });
    UI.updateUI('editingStateChanged', { appState: AppState }); // Re-syncs button states
}

window.liveUpdateViewer = liveUpdateViewer;
window.handleGlyphClick = (char) => { document.getElementById('textInput').value = char; liveUpdateViewer(); };
window.saveChanges = _saveChanges;
window.discardChanges = _discardChanges;
window.toggleTheme = () => UI.toggleTheme(Editor.getEditorInstance());
window.saveFont = () => FontManager.saveFont(AppState.isEditing ? AppState.editingBuffer : JSON.stringify(AppState.inAppFonts[AppState.currentFontID].data), AppState.inAppFonts[AppState.currentFontID].name);
window.handleFileLoad = FontManager.handleFileLoad;
window.showTab = UI.showTab;
window.toggleFontList = UI.toggleFontList;
window.toggleAddFontMenu = UI.toggleAddFontMenu;
window.loadFontFromFile = FontManager.loadFontFromFile;
window.showUrlModal = UI.showUrlModal;
window.hideUrlModal = UI.hideUrlModal;
window.loadFontFromUrl = FontManager.loadFontFromUrl;

window.reloadViewer = () => {
    // Reset the internal state and UI buttons first
    _resetViewerStateToDefault();

    // Then, send the command to the iframe to reset the camera/object
    Viewer.resetView();

    // Finally, re-render the text mesh in its new default position
    updateViewer({ shouldResetPosition: true });
};
window.copyCardUrl = Versioner.copyCardUrl;
window.applyThreeJsVersion = Versioner.applyThreeJsVersion;
window.toggleRotation = () => { AppState.viewerState.rotationEnabled = !AppState.viewerState.rotationEnabled; Viewer.toggleRotation(AppState.viewerState.rotationEnabled); UI.updateUI('editingStateChanged', { appState: AppState }); };
window.toggleGrid = () => { AppState.viewerState.gridVisible = !AppState.viewerState.gridVisible; Viewer.toggleGrid(AppState.viewerState.gridVisible); UI.updateUI('editingStateChanged', { appState: AppState }); };
window.toggleMode = () => { AppState.viewerState.is3D = !AppState.viewerState.is3D; updateViewer({ shouldResetPosition: true }); };
window.toggleColorPicker = UI.toggleColorPicker;
window.toggleMaterialModal = UI.toggleMaterialModal;
window.toggleConsole = UI.toggleConsole;
window.toggleVersionModal = Versioner.toggleVersionModal;
window.copyFontUrl = FontManager.copyFontUrl;
window.clearConsole = UI.clearConsole;
window.startEditing = startEditing;

window.toggleGlyphSort = () => {
    AppState.isGlyphSortActive = !AppState.isGlyphSortActive;
    const sortBtn = document.getElementById('sortGlyphsBtn');
    sortBtn.classList.toggle('active', AppState.isGlyphSortActive);
    const newTooltipText = AppState.isGlyphSortActive ? 'Show original order' : 'Sort by common chars';
    sortBtn.setAttribute('data-tooltip', newTooltipText);
    Utils.updateActiveTooltip(sortBtn);
    updateGlyphViewerIfActive();
};

window.handleCategoryToggle = (categoryName) => {
    const glyphMap = sortedGlyphMaps[AppState.currentFontID];
    if (!glyphMap || !glyphMap.categorizedOrder) return;
    const category = glyphMap.categorizedOrder.find(cat => cat.name === categoryName);
    if (category) {
        category.isCollapsed = !category.isCollapsed;
        updateGlyphViewerIfActive();
    }
};

window.toggleWireframeView = () => {
    const vs = AppState.viewerState;
    const newActiveState = !vs.isWireframeModeActive;
    if (newActiveState) {
        const stateToSave = { ...vs };
        delete stateToSave.savedViewState;
        vs.savedViewState = stateToSave;
        vs.panEnabled = true; vs.zoomEnabled = true; vs.is3D = false; vs.gridVisible = false; vs.rotationEnabled = false; vs.rotateObjectEnabled = false; vs.moveObjectEnabled = false; vs.rotateCameraEnabled = false;
    } else {
        if (vs.savedViewState) {
            Object.assign(vs, vs.savedViewState);
            vs.savedViewState = null;
        }
    }
    vs.isWireframeModeActive = newActiveState;
    Viewer.setWireframe(vs.isWireframeModeActive);
    UI.updateUI('editingStateChanged', { appState: AppState });
};

window.togglePan = () => setMouseMode(AppState.viewerState.panEnabled ? '' : 'pan');
window.toggleRotateObject = () => setMouseMode(AppState.viewerState.rotateObjectEnabled ? '' : 'rotateObject');
window.toggleMoveObject = () => setMouseMode(AppState.viewerState.moveObjectEnabled ? '' : 'moveObject');
window.toggleRotateCamera = () => setMouseMode(AppState.viewerState.rotateCameraEnabled ? '' : 'rotateCamera');
window.toggleZoom = () => { AppState.viewerState.zoomEnabled = !AppState.viewerState.zoomEnabled; setMouseMode(AppState.viewerState.panEnabled ? 'pan' : AppState.viewerState.rotateObjectEnabled ? 'rotateObject' : AppState.viewerState.moveObjectEnabled ? 'moveObject' : AppState.viewerState.rotateCameraEnabled ? 'rotateCamera' : ''); };

window.toggleBoundingBox = () => {
    const vs = AppState.viewerState;
    vs.isBoundingBoxVisible = !vs.isBoundingBoxVisible;
    Viewer.toggleBoundingBox(vs.isBoundingBoxVisible);
    UI.updateUI('editingStateChanged', { appState: AppState });
};
//----------------------------------------> END [GLOBAL EVENT HANDLERS]





//-------------------------------------------------------------
//----------------------[   Helpers   ]------------------------
//-------------------------------------------------------------



/**
 * [MODIFIED] Resets the viewerState object to its default initial values
 * and sends the updated state to the viewer and UI. Now correctly resets the material.
 * @private
 */
function _resetViewerStateToDefault() {
    // Define the default state exactly as it is upon application start
    const defaultState = {
        panEnabled: false,
        zoomEnabled: true,
        is3D: true,
        gridVisible: true,
        rotationEnabled: true,
        rotateObjectEnabled: true,
        moveObjectEnabled: false,
        rotateCameraEnabled: false,
        isWireframeModeActive: false,
        isBoundingBoxVisible: false,
        savedViewState: null,
        currentColor: '#0077fe',
        currentAlpha: 1.0,
        currentMaterialName: 'Phong'
    };

    // Overwrite the current state with the default state
    AppState.viewerState = { ...defaultState };

    // Synchronize the viewer iframe with the new state
    Viewer.toggleGrid(AppState.viewerState.gridVisible);
    Viewer.toggleRotation(AppState.viewerState.rotationEnabled);
    Viewer.setMouseState({
        pan: AppState.viewerState.panEnabled,
        zoom: AppState.viewerState.zoomEnabled,
        rotateObject: AppState.viewerState.rotateObjectEnabled,
        moveObject: AppState.viewerState.moveObjectEnabled,
        rotateCamera: AppState.viewerState.rotateCameraEnabled
    });

    // [FIX] Send the command to reset the material in the viewer
    Viewer.setMaterial(AppState.viewerState.currentMaterialName);

    // [FIX] Update the UI to reflect the new active material
    UI.updateActiveMaterial(AppState.viewerState.currentMaterialName);

    // Update the UI buttons to reflect the reset state
    UI.updateUI('viewerStateChanged', { appState: AppState });
}


//----------------------------------------------------------> END [HELPERS]
