/**
 * Project: Three.js JSON Font Editor
 * File: editor/js/viewer-bridge.js
 * Created: 2025-08-29
 * Author: [Tu Nombre/Apodo]
 *
 * Description:
 * This module acts as a communication bridge between the main editor
 * window and the viewer iframe. It abstracts the postMessage API
 * for sending commands and handling responses.
 */

//-------------------------------------------------------------
//--------------------[   MODULE STATE   ]---------------------
//-------------------------------------------------------------

/**
 * @var {boolean} isViewerReady - Tracks if the iframe has loaded and sent the 'ready' signal.
 * @var {object} viewerState - Caches the viewer's camera/pivot state before a reload.
 */
let isViewerReady = false;
let viewerState = {};

// Dependencies injected from main.js
let dependencies = {
    fontManager: null,
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
 * @returns {void}
 */
function initViewerBridge(injectedDependencies, onReadyCallback) {
    dependencies = injectedDependencies;
    const iframe = document.getElementById('viewer-iframe');

    window.addEventListener('message', (event) => {
        // Ensure the message is from our iframe
        if (event.source !== iframe.contentWindow) {
            return;
        }

        const { command, args, payload, state } = event.data;
        // console.log(`%c[BRIDGE] Received command: ${command}`, 'color: orange;');

        switch (command) {
            case 'ready':
                isViewerReady = true;
                if (Object.keys(viewerState).length > 0) {
                    restoreState(viewerState);
                }
                onReadyCallback();
                break;

            case 'requestFontDataForRestore':
                dependencies.fontManager.provideFontDataForRestore();
                break;

            case 'viewerStateResponse':
                // The viewer has sent its state, now we can safely reload
                Object.assign(viewerState, state);
                const reloadUrl = payload.reloadUrl;
                if (reloadUrl) {
                    reloadViewerWithVersion(reloadUrl);
                }
                break;

            case 'iframeError':
                const iframeError = new Error(payload.message);
                iframeError.stack = payload.stack;
                dependencies.ui.handle_error(iframeError, { openConsole: true });
                break;
            
            case 'iframeConsoleMessage':
                dependencies.ui.logToConsole(`[VIEWER ${payload.type.toUpperCase()}]: ${payload.message}`, true);
                document.getElementById('consoleToggle').classList.add('has-error');
                break;
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
 * @returns {void}
 */
function sendViewerMessage(command, args = {}) {
    const iframe = document.getElementById('viewer-iframe');
    if (iframe && iframe.contentWindow && isViewerReady) {
        iframe.contentWindow.postMessage({ command, args }, '*');
    } else if (!isViewerReady) {
        console.warn(`[BRIDGE] Viewer not ready. Command '${command}' was blocked.`);
    }
}

/**
 * Sends font data and text to the viewer for rendering.
 * @param {object} fontData - The Three.js font JSON data.
 * @param {string} text - The text to render.
 * @param {boolean} is3D - Whether to render in 3D.
 * @param {boolean} shouldFrame - Whether to frame the object after rendering.
 * @returns {void}
 */
function update({ fontData, text, is3D, shouldFrame }) {
    sendViewerMessage('update', { fontData, text, is3D, shouldFrame });
}

/**
 * Sets the color and alpha of the text mesh in the viewer.
 * @param {string} color - The color in hex format.
 * @param {number} alpha - The opacity (0.0 to 1.0).
 * @returns {void}
 */
function setColor(color, alpha) {
    sendViewerMessage('setColor', { color, alpha });
}

/**
 * Sets the material of the text mesh in the viewer.
 * @param {string} material - The name of the material to apply.
 * @returns {void}
 */
function setMaterial(material) {
    sendViewerMessage('setMaterial', { material });
}

/**
 * Toggles the auto-rotation animation in the viewer.
 * @param {boolean} enabled - True to enable rotation, false to disable.
 * @returns {void}
 */
function toggleRotation(enabled) {
    sendViewerMessage('toggleRotation', { enabled });
}

/**
 * Toggles the visibility of the grid in the viewer.
 * @param {boolean} visible - True to show the grid, false to hide.
 * @returns {void}
 */
function toggleGrid(visible) {
    sendViewerMessage('toggleGrid', { visible });
}

/**
 * Resets the camera and object position/rotation to the default view.
 * @returns {void}
 */
function resetView() {
    sendViewerMessage('resetView');
}

/**
 * Updates the theme (background color) of the viewer scene.
 * @param {string} theme - The new theme ('dark' or 'light').
 * @returns {void}
 */
function updateTheme(theme) {
    sendViewerMessage('updateTheme', { theme });
}

/**
 * Updates the mouse controls state (pan, zoom, etc.) in the viewer.
 * @param {object} mouseState - An object describing the mouse state.
 * @returns {void}
 */
function setMouseState(mouseState) {
    sendViewerMessage('setMouseState', mouseState);
}

/**
 * Activates or deactivates the wireframe view mode.
 * @param {boolean} active - True to activate wireframe mode.
 * @returns {void}
 */
function setWireframe(active) {
    sendViewerMessage('setWireframe', { active });
}

/**
 * Sends a previously saved state to the viewer for restoration.
 * @param {object} stateToRestore - The complete state object.
 * @returns {void}
 */
function restoreState(stateToRestore) {
    sendViewerMessage('restoreState', stateToRestore);
}

/**
 * Sends restored font data to a viewer pending a state restore.
 * @param {object} fontData - The Three.js font JSON data.
 * @returns {void}
 */
function fontDataForRestore(fontData) {
    sendViewerMessage('fontDataForRestore', { fontData });
}

/**
 * Requests the current camera and pivot state from the viewer.
 * @param {string} reloadUrl - The URL to reload the viewer with after receiving the state.
 * @returns {void}
 */
function requestViewerState(reloadUrl) {
    // Viewer might not be ready if we are in the middle of a reload
    const iframe = document.getElementById('viewer-iframe');
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ command: 'requestViewerState', args: { reloadUrl } }, '*');
    }
}
//----------------------------------------> END [OUTGOING COMMANDS (EDITOR -> VIEWER)]


//-------------------------------------------------------------
//-------------------[   IFRAME MANAGEMENT   ]-----------------
//-------------------------------------------------------------

/**
 * Reloads the viewer iframe, injecting a specific version of Three.js.
 * @param {string} versionUrl - The full URL to the Three.js script.
 * @returns {void}
 */
function reloadViewerWithVersion(versionUrl) {
    const iframe = document.getElementById('viewer-iframe');
    const viewerHtmlPath = './viewer/viewer.html';
    isViewerReady = false; // The viewer is no longer ready until it reloads and tells us

    fetch(viewerHtmlPath)
        .then(response => {
            if (!response.ok) throw new Error(`Failed to load viewer HTML: ${response.statusText}`);
            return response.text();
        })
        .then(htmlContent => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlContent, 'text/html');

            const threejsScript = doc.getElementById('viewer-script-threejs-url');
            if (threejsScript) {
                threejsScript.src = versionUrl;
            }

            const newIframeContent = `<!DOCTYPE html>${doc.documentElement.outerHTML}`;
            iframe.srcdoc = newIframeContent;
            // console.log(`[BRIDGE] Reloading viewer with Three.js from: ${versionUrl}`);
        })
        .catch(error => dependencies.ui.handle_error(error, { openConsole: true }));
}
//----------------------------------------> END [IFRAME MANAGEMENT]

 

export {
    initViewerBridge,
    reloadViewerWithVersion,
    requestViewerState,
    fontDataForRestore,
    viewerState, // Exporting state for caching
    // Command Wrappers
    update,
    setColor,
    setMaterial,
    toggleRotation,
    toggleGrid,
    resetView,
    updateTheme,
    setMouseState,
    setWireframe
};