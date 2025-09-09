/**
 * Project: Three.js JSON Font Editor
 * File: editor/js/viewer-bridge.js
 * Created: 2025-08-29
 * Author: @lewopxd
 *
 * Description:
 * This module acts as a communication bridge between the main editor
 * window and the viewer iframe. It abstracts the postMessage API
 * for sending commands and handling the state restoration handshake.
 */

 
//-------------------------------------------------------------
//--------------------[   MODULE STATE   ]---------------------
//-------------------------------------------------------------

let isViewerReady = false;
let completeStateToRestore = {}; // Holds the merged state (UI from parent + Scene from iframe)
let pendingReloadUrl = null;      // Holds the URL for the upcoming reload

let dependencies = {
    ui: null
};
//----------------------------------------> END [MODULE STATE]


//-------------------------------------------------------------
//-----------[   INITIALIZATION & EVENT HANDLING   ]-----------
//-------------------------------------------------------------

/**
 * Initializes the viewer bridge and sets up the message listener.
 * @param {object} injectedDependencies - An object containing references to other modules.
 * @param {function} onReadyCallback - A function to call once the viewer iframe signals it is ready.
 */
function initViewerBridge(injectedDependencies, onReadyCallback) {
    dependencies = injectedDependencies;
    const iframe = document.getElementById('viewer-iframe');

    window.addEventListener('message', (event) => {
        if (event.source !== iframe.contentWindow) {
            return;
        }

        const { command, args, payload, state } = event.data;

        switch (command) {
            case 'ready':
                isViewerReady = true;
                if (Object.keys(completeStateToRestore).length > 0) {
                    restoreState(completeStateToRestore);
                    completeStateToRestore = {}; // Clear state after use
                }
                onReadyCallback();
                break;

            case 'viewerStateResponse':
                const parentState = payload.parentState;
                const iframeState = state;
                completeStateToRestore = { ...parentState, ...iframeState };
                reloadViewerWithVersion(pendingReloadUrl);
                pendingReloadUrl = null;
                break;

            case 'requestFontDataForRestore':
                const fontData = dependencies.fontManager.provideFontDataForRestore();
                if (fontData) {
                    fontDataForRestore(fontData);
                }
                break;
            
               case 'reportError': {
                dependencies.ui.handle_error(new Error(payload.message), {
                    source: 'iframe',
                    type: payload.type,
                    openConsole: true,
                    logData: payload.logData
                });
                break;
            }
        }
    });
}
//----------------------------------------> END [INITIALIZATION & EVENT HANDLING]


//-------------------------------------------------------------
//-------------[   OUTGOING COMMANDS (EDITOR -> VIEWER)   ]--------------
//-------------------------------------------------------------

/**
 * A generic function to send a command and payload to the viewer iframe.
 * @param {string} command - The command to be executed by the viewer.
 * @param {object} [args={}] - The payload/arguments for the command.
 */
function sendViewerMessage(command, args = {}) {
    
    const iframe = document.getElementById('viewer-iframe');
    if (iframe && iframe.contentWindow && isViewerReady) {
        iframe.contentWindow.postMessage({ command, args }, '*');
    } else if (!isViewerReady) {
        console.warn(`[BRIDGE] Viewer not ready. Command '${command}' was blocked.`);
    }
 
}

 
function requestAndReload(newContent, parentState) {
    pendingReloadUrl = newContent; // The variable now holds the HTML string
    const iframe = document.getElementById('viewer-iframe');
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ command: 'requestViewerState', args: { parentState } }, '*');
    }
}

function update({ fontData, text, is3D, shouldFrame, shouldResetPosition, fontHasChanged }) {  
    sendViewerMessage('update', { 
        fontData, 
        text, 
        is3D, 
        shouldFrame, 
        shouldResetPosition,
        fontHasChanged  
    });
}

/**
 * Sets the color and alpha of the text mesh in the viewer.
 */
function setColor(color, alpha) {
    sendViewerMessage('setColor', { color, alpha });
}

/**
 * Sets the material of the text mesh in the viewer.
 */
function setMaterial(material) {
    sendViewerMessage('setMaterial', { material });
}

/**
 * Toggles the auto-rotation animation in the viewer.
 */
function toggleRotation(enabled) {
    sendViewerMessage('toggleRotation', { enabled });
}

/**
 * Toggles the visibility of the grid in the viewer.
 */
function toggleGrid(visible) {
    sendViewerMessage('toggleGrid', { visible });
}

/**
 * Resets the camera and object position/rotation to the default view.
 */
function resetView() {
    sendViewerMessage('resetView');
}

/**
 * Updates the theme (background color) of the viewer scene.
 */
function updateTheme(theme) {
    sendViewerMessage('updateTheme', { theme });
}

/**
 * Updates the mouse controls state (pan, zoom, etc.) in the viewer.
 */
function setMouseState(mouseState) {
    sendViewerMessage('setMouseState', mouseState);
}

/**
 * Activates or deactivates the wireframe view mode.
 */
function setWireframe(active) {
    sendViewerMessage('setWireframe', { active });
}

/**
 * Toggles the visibility of the text's bounding box.
 */
function toggleBoundingBox(visible) {
    sendViewerMessage('toggleBoundingBox', { visible });
}

/**
 * Sends a previously saved state to the viewer for restoration.
 */
function restoreState(stateToRestore) {
    sendViewerMessage('restoreState', stateToRestore);
}

/**
 * Sends restored font data to a viewer pending a state restore.
 */
function fontDataForRestore(fontData) {
    sendViewerMessage('fontDataForRestore', { fontData });
}
//----------------------------------------> END [OUTGOING COMMANDS (EDITOR -> VIEWER)]


//-------------------------------------------------------------
//-------------------[   IFRAME MANAGEMENT   ]-----------------
//-------------------------------------------------------------

//-------------------------------------------------------------
//-------------------[   IFRAME MANAGEMENT   ]-----------------
//-------------------------------------------------------------

/**
 * [MODIFIED] Reloads the viewer iframe with pre-generated HTML content.
 * Its responsibility is now only to set the srcdoc attribute.
 * @param {string} generatedHtml - The full HTML content string for the iframe.
 */
function reloadViewerWithVersion(generatedHtml) {
    const iframe = document.getElementById('viewer-iframe');
    isViewerReady = false; // Reset the ready flag for the new content
    
    if (iframe) {
        iframe.srcdoc = generatedHtml;
    } else {
        // This case should not happen in normal operation, but it's good practice to handle it.
        dependencies.ui.handle_error(new Error("Viewer iframe not found in DOM."), { openConsole: true });
    }
}
//----------------------------------------> END [IFRAME MANAGEMENT]


export {
    initViewerBridge,
    reloadViewerWithVersion,
    requestAndReload,
    fontDataForRestore,
    // Command Wrappers
    update,
    setColor,
    setMaterial,
    toggleRotation,
    toggleGrid,
    resetView,
    updateTheme,
    setMouseState,
    setWireframe,
    toggleBoundingBox
};