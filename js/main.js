/**
 * Project: Three.js JSON Font Editor
 * File: editor/js/main.js
 * Created: 2025-08-29
 * Author: [Tu Nombre/Apodo]
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

let state = {
    panEnabled: false,
    zoomEnabled: true,
    is3D: true,
    gridVisible: true,
    rotationEnabled: true,
    rotateObjectEnabled: true,
    moveObjectEnabled: false,
    rotateCameraEnabled: false,
    isEditorLocked: true, // Initial state should match editor-config
    isWireframeModeActive: false, 
    savedViewState: null,       
    isWireframeTransitioning: false,
    currentColor: '#0077fe',
    currentAlpha: 1.0,
    currentMaterialName: 'Phong'
};
//----------------------------------------> END [APPLICATION STATE]


//-------------------------------------------------------------
//-----------------[   MAIN APPLICATION LOGIC   ]--------------
//-------------------------------------------------------------

/**
 * Parses editor content and sends it to the viewer for an update.
 * @returns {void}
 */
function updateViewer() {
    const editorInstance = Editor.getEditorInstance();
    if (!editorInstance) return;

    const errorToast = document.getElementById('error-toast-message');
    try {
        const fontData = JSON.parse(editorInstance.getValue());
        const textInput = document.getElementById('textInput').value;
        errorToast.classList.remove('show');

        if (!textInput) {
            UI.clearConsole();
            UI.clearConsoleError();
            Viewer.update({ text: '' }); // Send command to clear viewer
            return;
        }
        
        // Basic glyph check
        const missingChars = [...new Set(textInput.split('').filter(char => !fontData.glyphs?.[char]))];
        if (missingChars.length > 0) {
            const formatted = missingChars.map(c => `'${c}'`).join(' ');
            UI.handle_error(new Error(`Characters not in font: ${formatted}`), { showInAlert: true, alertPersistent: true });
        } else {
            UI.clearConsoleError(); // Clear persistent error toast if exists
        }

        Viewer.update({
            fontData: fontData,
            text: textInput,
            is3D: state.is3D,
            shouldFrame: state.isWireframeModeActive
        });

        UI.finishLoadingProgress();

    } catch (error) {
        if (!errorToast.classList.contains('show')) {
            UI.handle_error(error, { openConsole: true });
        }
        UI.resetLoadingProgressOnError();
    }
}

/**
 * Updates the viewer and then frames the object.
 * @returns {void}
 */
function updateAndFrameObject() {
    updateViewer();
    if (state.isWireframeModeActive) {
        // In wireframe mode, framing is handled by the update function itself.
        // If you need framing outside wireframe, a 'frameObject' command would be sent here.
    }
}
//----------------------------------------> END [MAIN APPLICATION LOGIC]


//-------------------------------------------------------------
//---------------------[   INITIALIZATION   ]------------------
//-------------------------------------------------------------

/**
 * Main function to initialize the application.
 * @returns {void}
 */
function initializeApp() {
     Editor.initEditor('editor', () => {
        setTimeout(updateViewer, 150);
    });

    UI.initUIManager({
        onThemeChange: (newTheme) => {
            Viewer.updateTheme(newTheme);
            if (document.getElementById('glyphs-view').classList.contains('active')) {
                GlyphViewer.init(Editor.getEditorInstance(), FontManager.currentFontKey);
            }
        },
        onTabSwitch: (tabName) => {
            if (tabName === 'info') {
                FontManager.renderInfoView();
            } else if (tabName === 'glyphs') {
                GlyphViewer.init(Editor.getEditorInstance(), FontManager.currentFontKey);
            }
        },
         onColorChange: (color, alpha) => {
            state.currentColor = color;
            state.currentAlpha = alpha;
            Viewer.setColor(color, alpha);
        },
        onMaterialSelect: (materialName) => {
            state.currentMaterialName = materialName;
            Viewer.setMaterial(materialName);
        }
    });

     
    Viewer.initViewerBridge({
        fontManager: FontManager,
        ui: UI
    }, () => {
         console.log("Viewer is ready. Initializing dependent modules...");
         
         Viewer.setColor(state.currentColor, state.currentAlpha);
         Viewer.setMaterial(state.currentMaterialName);

         FontManager.initFontManager({
            editor: Editor,
            ui: UI,
            utils: Utils,
            viewer: { update: updateViewer },
            onFontLoaded: () => {
                 if (document.getElementById('glyphs-view').classList.contains('active')) {
                     GlyphViewer.init(Editor.getEditorInstance(), FontManager.currentFontKey);
                }
            }   
        });

        Versioner.initThreeVersioner({
            ui: UI,
            viewer: {
                requestViewerState: Viewer.requestViewerState,
                cacheState: () => { /* cache logic */ }
            }
        });
        
         UI.initButtonStates(state);
    });

     Viewer.reloadViewerWithVersion(default_threejs_version);
}

 document.addEventListener('DOMContentLoaded', initializeApp); //   :) >

//----------------------------------------> END [INITIALIZATION]


//-------------------------------------------------------------
//----------------[   GLOBAL EVENT HANDLERS   ]----------------
//-------------------------------------------------------------
//@leo, This is the final and complete version of the global handlers block.

// --- Helper Functions for Buttons ---

/**
 * Sets the exclusive mouse interaction mode (e.g., pan, rotate).
 * This function handles the cross-operation logic.
 * @param {string} mode - The mode to activate ('pan', 'rotateObject', 'moveObject', 'rotateCamera').
 */
function setMouseMode(mode) {
    state.panEnabled = mode === 'pan';
    state.rotateObjectEnabled = mode === 'rotateObject';
    state.moveObjectEnabled = mode === 'moveObject';
    state.rotateCameraEnabled = mode === 'rotateCamera';
    
    // Send the updated state to the viewer
    Viewer.setMouseState({
        pan: state.panEnabled,
        zoom: state.zoomEnabled, // Always include zoom state
        rotateObject: state.rotateObjectEnabled,
        moveObject: state.moveObjectEnabled,
        rotateCamera: state.rotateCameraEnabled,
    });
    
    // Update all button visuals
    UI.initButtonStates(state);
}

// --- Assignment of Functions to the Global Window (for HTML onclick attributes) ---

window.handleGlyphClick = (char) => {
    document.getElementById('textInput').value = char;
    updateAndFrameObject();
};

// Sidebar Buttons
window.toggleTheme = () => UI.toggleTheme(Editor.getEditorInstance());

// Editor Panel Buttons
window.saveFont = FontManager.saveFont;
window.handleFileLoad = FontManager.handleFileLoad;
window.showTab = UI.showTab;
window.toggleFontList = UI.toggleFontList;
window.toggleAddFontMenu = UI.toggleAddFontMenu;
window.loadFontFromFile = FontManager.loadFontFromFile;
window.showUrlModal = UI.showUrlModal;
window.hideUrlModal = UI.hideUrlModal;
window.loadFontFromUrl = FontManager.loadFontFromUrl;
window.toggleEditorLock = Editor.toggleEditorLock;

// Viewer Panel Buttons
window.updateAndFrameObject = updateAndFrameObject;
window.reloadViewer = Viewer.resetView;
window.toggleRotation = () => { state.rotationEnabled = !state.rotationEnabled; Viewer.toggleRotation(state.rotationEnabled); UI.initButtonStates(state); };
window.toggleGrid = () => { state.gridVisible = !state.gridVisible; Viewer.toggleGrid(state.gridVisible); UI.initButtonStates(state); };
window.toggleMode = () => { state.is3D = !state.is3D; updateViewer(); UI.initButtonStates(state); };
window.toggleColorPicker = UI.toggleColorPicker;
window.toggleMaterialModal = UI.toggleMaterialModal;
window.toggleConsole = UI.toggleConsole;
window.applyThreeJsVersion = Versioner.applyThreeJsVersion;
window.toggleVersionModal = Versioner.toggleVersionModal;
window.deleteUserFont = FontManager.deleteUserFont;
window.copyFontUrl = FontManager.copyFontUrl;

// This is the full, non-omitted implementation for the wireframe view toggle.
window.toggleWireframeView = () => {
    if (state.isWireframeTransitioning) return;
    state.isWireframeTransitioning = true;

    state.isWireframeModeActive = !state.isWireframeModeActive;
    document.getElementById('wireframeModeBtn').classList.toggle('active', state.isWireframeModeActive);

    if (state.isWireframeModeActive) {
        // Save the current application state
        state.savedViewState = {
            panEnabled: state.panEnabled,
            zoomEnabled: state.zoomEnabled,
            is3D: state.is3D,
            gridVisible: state.gridVisible,
            rotationEnabled: state.rotationEnabled,
            rotateObjectEnabled: state.rotateObjectEnabled,
            moveObjectEnabled: state.moveObjectEnabled,
            rotateCameraEnabled: state.rotateCameraEnabled
        };

        // Apply the temporary wireframe mode state
        state.panEnabled = true;
        state.zoomEnabled = true;
        state.is3D = false;
        state.gridVisible = false;
        state.rotationEnabled = false;
        state.rotateObjectEnabled = false;
        state.moveObjectEnabled = false;
        state.rotateCameraEnabled = false;

        // Send the command to the viewer
        Viewer.setWireframe(true);

    } else {
        // Restore the saved state if it exists
        if (state.savedViewState) {
            Object.assign(state, state.savedViewState);
            state.savedViewState = null;
        }
        // Send the command to the viewer
        Viewer.setWireframe(false);
    }
    
    // Force a viewer update with the new state (e.g., to apply 2D mode)
    updateViewer();
    // Update the UI buttons to reflect the new state
    UI.initButtonStates(state);

    state.isWireframeTransitioning = false;
};

// Mouse control buttons (using the centralized setMouseMode logic)
window.togglePan = () => setMouseMode(state.panEnabled ? '' : 'pan');
window.toggleRotateObject = () => setMouseMode(state.rotateObjectEnabled ? '' : 'rotateObject');
window.toggleMoveObject = () => setMouseMode(state.moveObjectEnabled ? '' : 'moveObject');
window.toggleRotateCamera = () => setMouseMode(state.rotateCameraEnabled ? '' : 'rotateCamera');
window.toggleZoom = () => { 
    state.zoomEnabled = !state.zoomEnabled; 
    // Call setMouseMode with the current mode to send the updated zoom state
    const currentMode = state.panEnabled ? 'pan' 
                      : state.rotateObjectEnabled ? 'rotateObject' 
                      : state.moveObjectEnabled ? 'moveObject' 
                      : state.rotateCameraEnabled ? 'rotateCamera' 
                      : '';
    setMouseMode(currentMode);
};

//----------------------------------------> END [GLOBAL EVENT HANDLERS]