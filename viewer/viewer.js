/**
 * Project: Three.js JSON Font Editor
 * File: editor/viewer/viewer.js
 * Created: 2025-08-29
 * Author: [Tu Nombre/Apodo]
 *
 * Description:
 * This script is a self-contained Three.js application that runs inside
 * an iframe. It sets up the scene, renders text geometry, and listens for
 * commands from the parent window to update its state.
 */

//-------------------------------------------------------------
//---------------------[   MODULE STATE   ]--------------------
//-------------------------------------------------------------

// Scene and Core Three.js components
let scene, camera, renderer, textMesh, gridHelper, pivotGroup;

// State variables controlled by the parent window
let panEnabled = false, zoomEnabled = true, is3D = true, gridVisible = true, rotationEnabled = true;
let rotateObjectEnabled = true, moveObjectEnabled = false, rotateCameraEnabled = false;

// Material and color state
let currentMaterialConstructor = THREE.MeshPhongMaterial;
let isWireframe = false;
let currentColor = '#0077fe';
let currentAlpha = 1.0;

// State for advanced features
let savedViewState = null;
let pendingStateRestore = null;

const materialMap = {
    'Normal': THREE.MeshNormalMaterial, 'Basic': THREE.MeshBasicMaterial,
    'Lambert': THREE.MeshLambertMaterial, 'Phong': THREE.MeshPhongMaterial,
    'Standard': THREE.MeshStandardMaterial, 'Physical': THREE.MeshPhysicalMaterial,
    'Toon': THREE.MeshToonMaterial, 'Wireframe': THREE.MeshBasicMaterial,
};
//----------------------------------------> END [MODULE STATE]


//-------------------------------------------------------------
//---------[   MESSAGE HANDLING (PARENT -> VIEWER)   ]---------
//-------------------------------------------------------------

/**
 * Listens for commands from the parent window and routes them to the appropriate functions.
 */
window.addEventListener('message', (event) => {
    // Basic security check
    if (event.source !== window.parent) {
        return;
    }

    const { command, args } = event.data;

    try {
        switch (command) {
            case 'update': updateViewer(args); break;
            case 'setColor': setColor(args.color, args.alpha); break;
            case 'setMaterial': setMaterial(args.material); break;
            case 'toggleRotation': toggleRotation(args.enabled); break;
            case 'toggleGrid': toggleGrid(args.visible); break;
            case 'resetView': resetView(); break;
            case 'updateTheme': updateTheme(args.theme); break;
            case 'setMouseState': setMouseState(args); break;
            case 'setWireframe': setWireframeMode(args.active); break;
            case 'restoreState': applyRestoredState(args); break;
            case 'requestViewerState': saveCameraAndPivot(args); break;
            case 'fontDataForRestore': handleFontDataForRestore(args); break;
        }
    } catch (error) {
        console.error(`Error processing command '${command}': ${error.message}`);
        reportErrorToParent(error);
    }
});
//----------------------------------------> END [MESSAGE HANDLING (PARENT -> VIEWER)]


//-------------------------------------------------------------
//------------[   SCENE SETUP & INITIALIZATION   ]-------------
//-------------------------------------------------------------

/**
 * Initializes the entire Three.js scene, camera, renderer, and lights.
 * @returns {void}
 */
function initScene() {
    try {
        const canvas = document.getElementById('canvas');
        scene = new THREE.Scene();
        pivotGroup = new THREE.Group();
        scene.add(pivotGroup);

        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        resetView();

        renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 10, 5);
        scene.add(directionalLight);

        // Grid
        gridHelper = new THREE.GridHelper(10, 20);
        gridHelper.visible = gridVisible;
        scene.add(gridHelper);

        // Event listeners
        window.addEventListener('resize', onWindowResize);
        setupMouseControls();
        
        // Start rendering
        animate();

        // Notify parent window that the viewer is ready
        log('Viewer initialized successfully.');
        window.parent.postMessage({ command: 'ready' }, '*');
    } catch (error) {
        log('Fatal error during scene initialization: ' + error.message);
        reportErrorToParent(error);
    }
}

/**
 * Handles window resize events to keep the camera and renderer updated.
 * @returns {void}
 */
function onWindowResize() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
//----------------------------------------> END [SCENE SETUP & INITIALIZATION]


//-------------------------------------------------------------
//---------------------[   ANIMATION LOOP   ]------------------
//-------------------------------------------------------------

/**
 * The main animation loop, called recursively via requestAnimationFrame.
 * @returns {void}
 */
function animate() {
    requestAnimationFrame(animate);
    if (pivotGroup && rotationEnabled) {
        pivotGroup.rotation.y += 0.005;
    }
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}
//----------------------------------------> END [ANIMATION LOOP]


//-------------------------------------------------------------
//-------------------[   CORE VIEWER LOGIC   ]-----------------
//-------------------------------------------------------------

/**
 * The main function to update or create the text geometry and mesh.
 * @param {object} args - The arguments for the update.
 * @param {object} args.fontData - The Three.js font JSON.
 * @param {string} args.text - The text string to render.
 * @param {boolean} args.is3D - Flag for 3D extrusion.
 * @param {boolean} args.shouldFrame - Flag to frame the object after creation.
 * @returns {void}
 */
function updateViewer(args) {
    const { fontData, text, is3D: is3Dmode, shouldFrame } = args;

    if (pivotGroup) {
        pivotGroup.visible = false; // Anti-flicker
    }

    if (textMesh) {
        pivotGroup.remove(textMesh);
        textMesh.geometry.dispose();
        if (textMesh.material) textMesh.material.dispose();
        textMesh = null;
    }

    if (!text || !fontData) {
        return; // Nothing to render
    }
    
    is3D = is3Dmode;
    const geometry = createTextGeometry(fontData, text, is3D);
    
    if (geometry) {
         const materialProps = { color: new THREE.Color(currentColor), wireframe: isWireframe, transparent: true, opacity: currentAlpha };
        if (currentMaterialConstructor === THREE.MeshNormalMaterial) {
            delete materialProps.color;
        }
        if (currentMaterialConstructor === THREE.MeshPhongMaterial) {
            materialProps.shininess = 100;
        }
        
        const material = new currentMaterialConstructor(materialProps);
        
        textMesh = new THREE.Mesh(geometry, material);

        // Position pivot based on geometry to keep text baseline on the grid
        const yOffset = -geometry.boundingBox.min.y;
        pivotGroup.position.set(0, yOffset, 0);
        pivotGroup.add(textMesh);

        if (shouldFrame) {
            frameObject();
        }

        pivotGroup.visible = true;
    }
}

/**
 * Creates a THREE.TextGeometry instance from font data.
 * @param {object} fontData - The font JSON data.
 * @param {string} text - The text to generate geometry for.
 * @param {boolean} is3Dmode - Whether to create 3D or flat geometry.
 * @returns {THREE.TextGeometry} The generated geometry.
 */
function createTextGeometry(fontData, text, is3Dmode) {
    const font = new THREE.Font(fontData);
    const geometry = new THREE.TextGeometry(text, { font: font, size: 1, height: is3Dmode ? 0.2 : 0, curveSegments: 12, bevelEnabled: is3Dmode, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 });
    geometry.computeBoundingBox();
    const center = new THREE.Vector3();
    geometry.boundingBox.getCenter(center);
    geometry.translate(-center.x, -center.y, -center.z);
    return geometry;
}

/**
 * Sets the color and opacity of the current text mesh.
 * @param {string} color - The new color (hex).
 * @param {number} alpha - The new opacity (0-1).
 * @returns {void}
 */
function setColor(color, alpha) {
    currentColor = color;
    currentAlpha = alpha;
    if (textMesh?.material) {
        if (textMesh.material.color) {
            textMesh.material.color.set(color);
        }
        textMesh.material.transparent = true;
        textMesh.material.opacity = alpha;
    }
}

/**
 * Changes the material of the current text mesh.
 * @param {string} materialName - The name of the new material.
 * @returns {void}
 */
function setMaterial(materialName) {
    currentMaterialConstructor = materialMap[materialName] || THREE.MeshPhongMaterial;
    isWireframe = (materialName === 'Wireframe');

    if (!textMesh) return;

    const oldMaterial = textMesh.material;
     const materialProps = { color: new THREE.Color(currentColor), wireframe: isWireframe, transparent: true, opacity: currentAlpha };
    if (currentMaterialConstructor === THREE.MeshNormalMaterial) {
        delete materialProps.color;
    }
    if (currentMaterialConstructor === THREE.MeshPhongMaterial) {
        materialProps.shininess = 100;
    }

    const newMaterial = new currentMaterialConstructor(materialProps);
    textMesh.material = newMaterial;
    if (oldMaterial) oldMaterial.dispose();
}

/**
 * Resets the camera and pivot group to their default positions and rotations.
 * @returns {void}
 */
function resetView() {
    camera.position.set(0, 0.7, 2.5);
    camera.lookAt(new THREE.Vector3(0, 0, 0));
    if (pivotGroup) {
        pivotGroup.rotation.set(0, 0, 0);
        pivotGroup.position.x = 0;
        pivotGroup.position.z = 0;
    }
}

/**
 * Moves the camera to perfectly frame the currently loaded text object.
 */
function frameObject() {
    if (!textMesh) return;

     const boundingBox = new THREE.Box3().setFromObject(textMesh);
    const size = boundingBox.getSize(new THREE.Vector3());

    if (size.x > 0 || size.y > 0) {
        const fov = camera.fov * (Math.PI / 180);
        const aspect = window.innerWidth / window.innerHeight;
        const distance = (aspect > size.x / size.y)
            ? (size.y / 2) / Math.tan(fov / 2)
            : (size.x / 2) / (aspect * Math.tan(fov / 2));
        camera.position.set(0, pivotGroup.position.y, distance * 1.2);
        camera.lookAt(pivotGroup.position);
    }
}

/**
 * Toggles the auto-rotation feature.
 * @param {boolean} enabled - State of the rotation.
 */
function toggleRotation(enabled) { rotationEnabled = enabled; }

/**
 * Toggles the grid visibility.
 * @param {boolean} visible - State of the grid visibility.
 */
function toggleGrid(visible) { gridVisible = visible; if (gridHelper) gridHelper.visible = visible; }

/**
 * Updates the scene background color based on the theme.
 * @param {string} theme - The theme name ('dark' or 'light').
 */
function updateTheme(theme) { if (scene) scene.background = new THREE.Color(theme === 'dark' ? 0x1a1a1a : 0xf8f9fa); }
//----------------------------------------> END [CORE VIEWER LOGIC]


//-------------------------------------------------------------
//--------------------[   MOUSE CONTROLS   ]-------------------
//-------------------------------------------------------------

/**
 * Sets up all mouse event listeners for camera and object manipulation.
 * This is the faithful restoration of the original logic.
 * @returns {void}
 */
function setupMouseControls() {
    const canvas = renderer.domElement;
    let isMouseDown = false, lastMouseX = 0, lastMouseY = 0;

    const onMouseDown = (e) => {
        isMouseDown = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp, { once: true });
    };

    const onMouseMove = (e) => {
        if (!isMouseDown) return;
        const deltaX = e.clientX - lastMouseX;
        const deltaY = e.clientY - lastMouseY;

         if (rotateObjectEnabled && pivotGroup) {
            pivotGroup.rotation.y += deltaX * 0.01;
            pivotGroup.rotation.x += deltaY * 0.01;
        } else if (panEnabled) {
            const right = new THREE.Vector3().crossVectors(camera.up, camera.getWorldDirection(new THREE.Vector3()).negate()).normalize();
            camera.position.addScaledVector(right, -deltaX * 0.005);
            camera.position.addScaledVector(camera.up, deltaY * 0.005);
        } else if (moveObjectEnabled && pivotGroup) {
            const right = new THREE.Vector3().crossVectors(camera.up, camera.getWorldDirection(new THREE.Vector3()).negate()).normalize();
            pivotGroup.position.addScaledVector(right, deltaX * 0.01);
            pivotGroup.position.addScaledVector(camera.up.clone().normalize(), -deltaY * 0.01);
        } else if (rotateCameraEnabled) {
            const radius = camera.position.length();
            let phi = Math.acos(camera.position.y / radius) - deltaY * 0.01;
             // limit phi to avoid camera flipping
            phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi));
            const theta = Math.atan2(camera.position.z, camera.position.x) - deltaX * 0.01;
            camera.position.x = radius * Math.sin(phi) * Math.cos(theta);
            camera.position.y = radius * Math.cos(phi);
            camera.position.z = radius * Math.sin(phi) * Math.sin(theta);
            camera.lookAt(scene.position);
        }

        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    };

    const onMouseUp = () => {
        isMouseDown = false;
        document.removeEventListener('mousemove', onMouseMove);
    };

    const onWheel = (e) => {
        e.preventDefault();
        if (zoomEnabled) {
            const direction = camera.getWorldDirection(new THREE.Vector3());
             // zoom factor is adjusted for more sensitivity
            camera.position.addScaledVector(direction, -e.deltaY * 0.002);
             // avoid camera crossing the origin
            if (camera.position.length() < 0.2) {
                camera.position.setLength(0.2);
            }
        }
    };
    
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('wheel', onWheel, { passive: false });
}

/**
 * Updates mouse control state variables from a parent message.
 * @param {object} args - The mouse state flags.
 */
function setMouseState(args) {
    panEnabled = args.pan;
    zoomEnabled = args.zoom;
    rotateObjectEnabled = args.rotateObject;
    moveObjectEnabled = args.moveObject;
    rotateCameraEnabled = args.rotateCamera;
}
//----------------------------------------> END [MOUSE CONTROLS]


//-------------------------------------------------------------
//-----------[   STATE MANAGEMENT & COMMUNICATION   ]----------
//-------------------------------------------------------------

/**
 * Captures the current camera and pivot state and sends it to the parent window.
 * @param {object} payload - The payload received from the parent, to be sent back with the state.
 * @returns {void}
 */
function saveCameraAndPivot(payload) {
    const currentState = {
        cameraState: { position: camera.position.clone(), rotation: camera.rotation.clone() },
        pivotState: { position: pivotGroup.position.clone(), rotation: pivotGroup.rotation.clone() }
    };
    window.parent.postMessage({ command: 'viewerStateResponse', state: currentState, payload: payload }, '*');
}

/**
 * Applies a restored state object to the viewer.
 * @param {object} state - The state object from the parent.
 * @returns {void}
 */
function applyRestoredState(state) {
    log('Applying restored state...');
    setColor(state.color, state.alpha);
    setMaterial(state.material);
    toggleGrid(state.gridVisible);
    toggleRotation(state.rotationEnabled);

    if (state.cameraState) {
        camera.position.copy(state.cameraState.position);
        camera.rotation.copy(state.cameraState.rotation);
    }
    if (state.pivotState) {
        pivotGroup.position.copy(state.pivotState.position);
        pivotGroup.rotation.copy(state.pivotState.rotation);
    }

    // If text needs to be restored, request the font data first
    if (state.text) {
        pendingStateRestore = state;
        window.parent.postMessage({ command: 'requestFontDataForRestore' }, '*');
    }
}

/**
 * Handles the 'fontDataForRestore' message from the parent.
 * @param {object} args - Arguments containing the font data.
 */
function handleFontDataForRestore(args) {
    if (pendingStateRestore) {
        updateViewer({
            fontData: args.fontData,
            text: pendingStateRestore.text,
            is3D: pendingStateRestore.is3D,
            shouldFrame: false // Do not frame on restore, use saved camera position
        });
        pendingStateRestore = null;
    }
}


/**
 * Manages the special wireframe view mode, including state saving, view centering, and restoration.
  * @param {boolean} active - True to activate wireframe mode.
 * @returns {void}
 */
function setWireframeMode(active) {
    if (active) {
        // 1. Save the viewer's complete state BEFORE making any changes.
        savedViewState = {
            // Camera state
            cameraPos: camera.position.clone(),
            cameraRot: camera.rotation.clone(),
            pivotPos: pivotGroup.position.clone(),
            pivotRot: pivotGroup.rotation.clone(),
            // Controls and UI state
            rotationEnabled, panEnabled, zoomEnabled, rotateCameraEnabled,
            gridVisible, is3D, rotateObjectEnabled, moveObjectEnabled,
            // Material and color state (CRITICAL!)
            currentMaterialConstructor,
            isWireframe,
            currentColor,
            currentAlpha
        };

        // 2. Apply the temporary wireframe mode state
        rotationEnabled = false; // Pause the animation
        panEnabled = true;
        zoomEnabled = true;
        rotateCameraEnabled = false;
        rotateObjectEnabled = false;
        moveObjectEnabled = false;

        toggleGrid(false);
        setMaterial('Wireframe'); // Apply the wireframe material

         pivotGroup.rotation.set(0, 0, 0);

        // 3. Center the CAMERA on the reset object
        requestAnimationFrame(frameObject);

    } else if (savedViewState) {
        // 4. Restore the complete saved state
        // Restore camera and pivot
        camera.position.copy(savedViewState.cameraPos);
        camera.rotation.copy(savedViewState.cameraRot);
        pivotGroup.position.copy(savedViewState.pivotPos);
        pivotGroup.rotation.copy(savedViewState.pivotRot);
        
        // Destructure the saved state variables
        ({ 
            rotationEnabled, panEnabled, zoomEnabled, rotateCameraEnabled, 
            gridVisible, is3D, rotateObjectEnabled, moveObjectEnabled 
        } = savedViewState);
        
        // Restore material and color (CRITICAL!)
        currentMaterialConstructor = savedViewState.currentMaterialConstructor;
        isWireframe = savedViewState.isWireframe;
        currentColor = savedViewState.currentColor;
        currentAlpha = savedViewState.currentAlpha;

        toggleGrid(gridVisible);
        
        // Re-apply the original material by finding its name
        const materialName = Object.keys(materialMap).find(key => materialMap[key] === currentMaterialConstructor) || 'Phong';
        setMaterial(materialName);
        // Re-apply color and transparency
        setColor(currentColor, currentAlpha);
        
        // Clean up the saved state
        savedViewState = null;
    }
}

//----------------------------------------> END [STATE MANAGEMENT & COMMUNICATION]


//-------------------------------------------------------------
//----------------[   ERROR HANDLING & LOGGING   ]-------------
//-------------------------------------------------------------

/**
 * Overrides console methods to forward errors and warnings to the parent window.
 * @returns {void}
 */
function overrideConsoleMethods() {
    ['log', 'warn', 'error'].forEach(method => {
        const original = console[method];
        console[method] = (...args) => {
            const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
            if ((method === 'warn' || method === 'error') && message) {
                window.parent.postMessage({ command: 'iframeConsoleMessage', payload: { type: method, message: message } }, '*');
            }
            original.apply(console, args);
        };
    });
}

/**
 * Reports a caught error to the parent window.
 * @param {Error} error - The error object to report.
 * @returns {void}
 */
function reportErrorToParent(error) {
    const errorDetails = { message: error.message || 'Unknown error in viewer.', stack: error.stack || 'No stack trace.' };
    window.parent.postMessage({ command: 'iframeError', payload: errorDetails }, '*');
}

/**
 * Custom logger for viewer-specific messages.
 * @param {string} message - The message to log.
 * @returns {void}
 */
function log(message) {
    console.log(`%cviewer> ${message}`, 'color: cyan; font-weight: bold;');
}

// Global error handler
window.onerror = function(message, source, lineno, colno, error) {
    reportErrorToParent(error || new Error(message));
    return true; // Prevent default browser error handling
};
//----------------------------------------> END [ERROR HANDLING & LOGGING]


//-------------------------------------------------------------
//--------------------[   INITIAL EXECUTION   ]----------------
//-------------------------------------------------------------
overrideConsoleMethods();
initScene();
//----------------------------------------> END [INITIAL EXECUTION]