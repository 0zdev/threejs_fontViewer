/**
 * Project: Three.js JSON Font Editor
 * File: editor/js/main.js
 * Created: 2025-08-29
 * Author: @lewopxd
 *
 * Description:
 * This is the main entry point for the application. It imports all
 * modules, manages the global application state, initializes all
 * components, and wires up event handlers.
 */

import * as Editor from './editor-config.js';
import * as UI from './ui-manager.js';
import * as Utils from './utils.js';
import * as FontManager from './font-manager.js';
import * as Viewer from './viewer-bridge.js';
import * as Versioner from './three-versioner.js';
import * as GlyphViewer from './glyph-viewer.js';



//-------------------------------------------------------------
//-------------------[   APPLICATION STATE   ]-----------------
//-------------------------------------------------------------

const default_threejs_version = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

let AppState = {
    inAppFonts: {},
    currentFontID: null,
    isEditing: false,
    editingBuffer: "",
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
        savedViewState: null, // This will be used by the PARENT to save its button states
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

/**
 * Internal function to switch the current font, set it in the editor,
 * and render it in the viewer with a position reset but without framing.
 * @param {string} fontID - The ID of the font to make current.
 */
function _setCurrentFont(fontID) {
    if (!AppState.inAppFonts[fontID]) {
        console.error(`Font with ID ${fontID} not found in AppState.`);
        return;
    }
    AppState.currentFontID = fontID;
    AppState.isEditing = false;
    AppState.editingBuffer = "";

    const fontData = AppState.inAppFonts[fontID].data;

    isProgrammaticEdit = true;
    Editor.getEditorInstance().setValue(JSON.stringify(fontData, null, 2));
    isProgrammaticEdit = false;
    Editor.getEditorInstance().clearHistory();


    _syncParentUI();
    
    // On initial font load, explicitly reset its position but DO NOT frame the camera,
    // to respect the original default camera view.
    updateViewer({ shouldResetPosition: true, shouldFrame: false });

    FontManager.analyzeCurrentFont(fontData)
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
    return fontID;
}

function _saveChanges() {
    if (!AppState.isEditing || !AppState.currentFontID) return;
    try {
        const updatedFontData = JSON.parse(AppState.editingBuffer);
        AppState.inAppFonts[AppState.currentFontID].data = updatedFontData;
        AppState.isEditing = false;
        AppState.editingBuffer = "";
        Utils.showToastMessage(`${AppState.inAppFonts[AppState.currentFontID].fontName} saved.`);
        _syncParentUI();        
        FontManager.analyzeCurrentFont(updatedFontData)

    } catch (error) {
        UI.handle_error(error, { openConsole: true });
    }
}

function _discardChanges() {
    if (!AppState.isEditing || !AppState.currentFontID) return;
    const fontData = AppState.inAppFonts[AppState.currentFontID].data;
    Editor.getEditorInstance().setValue(JSON.stringify(fontData, null, 2));
    AppState.isEditing = false;
    AppState.editingBuffer = "";
    Utils.showToastMessage("Changes discarded.");
    _syncParentUI();
}

function _onEditorChange() {
    if(isProgrammaticEdit){
        return;
    }  

    if (Editor.getEditorInstance().isClean()) return;
    AppState.isEditing = true;
    AppState.editingBuffer = Editor.getEditorInstance().getValue();
    liveUpdateViewer();
    UI.initButtonStates(AppState.viewerState, AppState.isEditing);
}

function reloadViewerWithState(newUrl) {
    const parentState = {
        ...AppState.viewerState,
        text: document.getElementById('textInput').value
    };
    Viewer.requestAndReload(newUrl, parentState);
}

//----------------------------------------> END [STATE MUTATIONS]


//-------------------------------------------------------------
//---------------------[   CORE LOGIC & RENDER   ]-------------
//-------------------------------------------------------------

function _syncParentUI() {
    UI.initButtonStates(AppState.viewerState, AppState.isEditing);
    FontManager.updateUI(AppState.inAppFonts, AppState.currentFontID);
    updateGlyphViewerIfActive();
}

function updateViewer(options = {}) {
    const { shouldFrame: frameOption = false, shouldResetPosition: resetOption = false } = options;
    if (!AppState.currentFontID) return;

    try {
        const fontSourceString = AppState.isEditing ? AppState.editingBuffer : JSON.stringify(AppState.inAppFonts[AppState.currentFontID].data);
        const fontData = JSON.parse(fontSourceString);
        const textInput = document.getElementById('textInput').value;
        const finalShouldFrame = frameOption || AppState.viewerState.isWireframeModeActive;

        if (!textInput) {
            Viewer.update({ text: '' });
            return;
        }

         const fontName = AppState.inAppFonts[AppState.currentFontID]?.fontName || 'current font';
        if (!validateTextGlyphs(textInput, fontData, fontName)) {
            return;  
        }
      

        Viewer.update({
            fontData: fontData,
            text: textInput,
            is3D: AppState.viewerState.is3D,
            shouldFrame: finalShouldFrame,
            shouldResetPosition: resetOption
        });
    } catch (error) {
        UI.handle_error(error, { openConsole: true });
    }
}

 
 
function validateTextGlyphs(text, fontData, fontName) {
    const availableGlyphs = fontData.glyphs || {};
    for (const char of text) {
        if (!availableGlyphs.hasOwnProperty(char)) {
            const warningMessage = `THREE.Font: character "${char}" does not exist in font family ${fontName}.`;
            UI.logToConsole([warningMessage], true); // true para estilo de error
            return false; // Detiene la validación y retorna false
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
        if (font) {
            GlyphViewer.render(font.data, window.handleGlyphClick);
        }
    }
}

//----------------------------------------> END [CORE LOGIC & RENDER]


//-------------------------------------------------------------
//---------------------[   INITIALIZATION   ]------------------
//-------------------------------------------------------------

function initializeApp() {
    Editor.initEditor('editor', _onEditorChange);
    UI.initUIManager({
        onThemeChange: (newTheme) => { Viewer.updateTheme(newTheme); updateGlyphViewerIfActive(); },
        onTabSwitch: (tabName) => {
            if (tabName === 'info' || tabName === 'glyphs') {
                FontManager.updateUI(AppState.inAppFonts, AppState.currentFontID);
                if (tabName === 'glyphs') { updateGlyphViewerIfActive(); }
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
        }
    });

    // 1. INICIALIZACIÓN DE MÓDULOS (UNA SOLA VEZ)
    // Estos módulos ahora se inicializan aquí, una única vez al cargar la app.
    FontManager.initFontManager({
        stateManager: { addFont, selectFont },
        ui: UI,
        utils: Utils
    }, (initialFontID) => { _setCurrentFont(initialFontID); });
    
    Versioner.initThreeVersioner({
        ui: UI,
        utils: Utils,
        viewer: { reloadWithState: reloadViewerWithState }
    });

    // 2. INICIALIZACIÓN DEL BRIDGE CON UN CALLBACK SIMPLIFICADO
    // El callback ahora solo ejecuta tareas de sincronización.
     Viewer.initViewerBridge({ ui: UI, fontManager: FontManager }, () => {
        _syncParentUI();
    });

    Viewer.reloadViewerWithVersion(default_threejs_version);
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
    _syncParentUI();
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
window.reloadViewer = () => { Viewer.resetView(); updateViewer({ shouldResetPosition: true }); };
window.copyCardUrl = Versioner.copyCardUrl;
window.applyThreeJsVersion = Versioner.applyThreeJsVersion;
window.toggleRotation = () => { AppState.viewerState.rotationEnabled = !AppState.viewerState.rotationEnabled; Viewer.toggleRotation(AppState.viewerState.rotationEnabled); _syncParentUI(); };
window.toggleGrid = () => { AppState.viewerState.gridVisible = !AppState.viewerState.gridVisible; Viewer.toggleGrid(AppState.viewerState.gridVisible); _syncParentUI(); };
window.toggleMode = () => { AppState.viewerState.is3D = !AppState.viewerState.is3D; updateViewer({ shouldResetPosition: true }); };
window.toggleColorPicker = UI.toggleColorPicker;
window.toggleMaterialModal = UI.toggleMaterialModal;
window.toggleConsole = UI.toggleConsole;
window.toggleVersionModal = Versioner.toggleVersionModal;
window.copyFontUrl = FontManager.copyFontUrl;
window.clearConsole = UI.clearConsole;
    
window.toggleWireframeView = () => {
    const vs = AppState.viewerState;
    
    // The state is now toggled AFTER the save/restore logic is complete.
    const newActiveState = !vs.isWireframeModeActive;

    if (newActiveState) {
        // --- ACTIVATING ---
        // 1. Save a clean snapshot of the CURRENT state BEFORE any changes.
        const stateToSave = { ...vs };
        delete stateToSave.savedViewState;
        vs.savedViewState = stateToSave;

        // 2. Apply the temporary inspection state.
        vs.panEnabled = true;
        vs.zoomEnabled = true;
        vs.is3D = false;
        vs.gridVisible = false;
        vs.rotationEnabled = false;
        vs.rotateObjectEnabled = false;
        vs.moveObjectEnabled = false;
        vs.rotateCameraEnabled = false;

    } else {
        // --- DEACTIVATING ---
        // 1. Restore the state from the clean snapshot.
        if (vs.savedViewState) {
            Object.assign(vs, vs.savedViewState);
            vs.savedViewState = null;
        }
    }
    
    // 2. NOW, officially update the state flag AFTER all logic is done.
    vs.isWireframeModeActive = newActiveState;
    
    // 3. Send the command to the autonomous iframe.
    Viewer.setWireframe(vs.isWireframeModeActive);
    
    // 4. Sync the parent UI to reflect the new, stable state.
    _syncParentUI();
};

window.togglePan = () => setMouseMode(AppState.viewerState.panEnabled ? '' : 'pan');
window.toggleRotateObject = () => setMouseMode(AppState.viewerState.rotateObjectEnabled ? '' : 'rotateObject');
window.toggleMoveObject = () => setMouseMode(AppState.viewerState.moveObjectEnabled ? '' : 'moveObject');
window.toggleRotateCamera = () => setMouseMode(AppState.viewerState.rotateCameraEnabled ? '' : 'rotateCamera');
window.toggleZoom = () => { AppState.viewerState.zoomEnabled = !AppState.viewerState.zoomEnabled; setMouseMode(AppState.viewerState.panEnabled ? 'pan' : AppState.viewerState.rotateObjectEnabled ? 'rotateObject' : AppState.viewerState.moveObjectEnabled ? 'moveObject' : AppState.viewerState.rotateCameraEnabled ? 'rotateCamera' : ''); };

//----------------------------------------> END [GLOBAL EVENT HANDLERS]