/**
 * Project: Three.js JSON Font Editor
 * File: editor/viewer/viewer.js
 * Created: 2025-08-29
 * Author: @lewopxd
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
let savedViewState = null; // Used LOCALLY and AUTONOMOUSLY by setWireframeMode
let pendingStateRestore = null;

const materialMap = {
    'Normal': THREE.MeshNormalMaterial, 'Basic': THREE.MeshBasicMaterial,
    'Lambert': THREE.MeshLambertMaterial, 'Phong': THREE.MeshPhongMaterial,
    'Standard': THREE.MeshStandardMaterial, 'Physical': THREE.MeshPhysicalMaterial,
    'Toon': THREE.MeshToonMaterial, 'Wireframe': THREE.MeshBasicMaterial,
};

let currentFontData = null;
let currentText = '';
let originalConsoleError = console.error;
//----------------------------------------> END [MODULE STATE]


//-------------------------------------------------------------
//---------[   MESSAGE HANDLING (PARENT -> VIEWER)   ]---------
//-------------------------------------------------------------

window.addEventListener('message', (event) => {
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
        reportErrorToParent(error);
    }
});
//----------------------------------------> END [MESSAGE HANDLING (PARENT -> VIEWER)]


//-------------------------------------------------------------
//------------[   SCENE SETUP & INITIALIZATION   ]-------------
//-------------------------------------------------------------

function initScene() {
    try {
        setupConsoleInterceptor(); 
        
        const canvas = document.getElementById('canvas');
        scene = new THREE.Scene();
        pivotGroup = new THREE.Group();
        scene.add(pivotGroup);

        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        resetView();

        renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 10, 5);
        scene.add(directionalLight);

        gridHelper = new THREE.GridHelper(10, 20);
        gridHelper.visible = gridVisible;
        scene.add(gridHelper);

        window.addEventListener('resize', onWindowResize);
        setupMouseControls();

        animate();

         window.parent.postMessage({ command: 'ready' }, '*');
    } catch (error) {
        originalConsoleError("Caught exception during scene initialization:", error);
        reportErrorToParent(error);
    }
}

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

function updateViewer(args) {
    currentFontData = args.fontData;
    currentText = args.text;

    try {
        const { fontData, text, is3D: is3Dmode, shouldFrame, shouldResetPosition } = args;

        if (pivotGroup) {
            pivotGroup.visible = false;
        }
        if (textMesh) {
            pivotGroup.remove(textMesh);
            textMesh.geometry.dispose();
            if (textMesh.material) textMesh.material.dispose();
            textMesh = null;
        }
        if (!text || !fontData) {
            return;
        }
        is3D = is3Dmode;
        const geometry = createTextGeometry(fontData, text, is3D);
        if (geometry) {
            const materialProps = { color: new THREE.Color(currentColor), wireframe: isWireframe, transparent: true, opacity: currentAlpha };
            const material = new currentMaterialConstructor(materialProps);
            textMesh = new THREE.Mesh(geometry, material);
            const yOffset = -geometry.boundingBox.min.y;
            pivotGroup.add(textMesh);
            if (shouldFrame) {
                frameObject();
            }
            if (shouldResetPosition) {
                pivotGroup.position.set(0, yOffset, 0);
            }
            pivotGroup.visible = true;
        }
    } catch (error) {
        originalConsoleError("Caught exception during viewer update:", error);
         reportErrorToParent(error);
    }
}

function createTextGeometry(fontData, text, is3Dmode) {
    const font = new THREE.Font(fontData);
    const geometry = new THREE.TextGeometry(text, { font: font, size: 1, height: is3Dmode ? 0.2 : 0, curveSegments: 12, bevelEnabled: is3Dmode, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 });
    geometry.computeBoundingBox();
    const center = new THREE.Vector3();
    geometry.boundingBox.getCenter(center);
    geometry.translate(-center.x, -center.y, -center.z);
    return geometry;
}

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

function setMaterial(materialName) {
    currentMaterialConstructor = materialMap[materialName] || THREE.MeshPhongMaterial;
    isWireframe = (materialName === 'Wireframe');

    if (!textMesh) return;

    const oldMaterial = textMesh.material;
    const materialProps = { color: new THREE.Color(currentColor), wireframe: isWireframe, transparent: true, opacity: currentAlpha };
    const newMaterial = new currentMaterialConstructor(materialProps);
    textMesh.material = newMaterial;
    if (oldMaterial) oldMaterial.dispose();
}

function resetView() {
    camera.position.set(0, 0.7, 2.5);
    camera.lookAt(new THREE.Vector3(0, 0, 0));
    if (pivotGroup) {
        pivotGroup.rotation.set(0, 0, 0);
        pivotGroup.position.x = 0;
        pivotGroup.position.z = 0;
    }
}

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

function toggleRotation(enabled) { rotationEnabled = enabled; }
function toggleGrid(visible) { gridVisible = visible; if (gridHelper) gridHelper.visible = visible; }
function updateTheme(theme) { if (scene) scene.background = new THREE.Color(theme === 'dark' ? 0x1a1a1a : 0xf8f9fa); }
//----------------------------------------> END [CORE VIEWER LOGIC]


//-------------------------------------------------------------
//--------------------[   MOUSE CONTROLS   ]-------------------
//-------------------------------------------------------------

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
    const onMouseUp = () => { isMouseDown = false; document.removeEventListener('mousemove', onMouseMove); };
    const onWheel = (e) => {
        e.preventDefault();
        if (zoomEnabled) {
            const direction = camera.getWorldDirection(new THREE.Vector3());
            camera.position.addScaledVector(direction, -e.deltaY * 0.002);
            if (camera.position.length() < 0.2) {
                camera.position.setLength(0.2);
            }
        }
    };
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('wheel', onWheel, { passive: false });
}

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

function saveCameraAndPivot(payload) {
    const currentState = {
        cameraState: { position: camera.position.clone(), rotation: camera.rotation.clone() },
        pivotState: { position: pivotGroup.position.clone(), rotation: pivotGroup.rotation.clone() }
    };
    window.parent.postMessage({ command: 'viewerStateResponse', state: currentState, payload: payload }, '*');
}

function applyRestoredState(state) {
     setColor(state.currentColor, state.currentAlpha);
    setMaterial(state.currentMaterialName);
    toggleGrid(state.gridVisible);
    toggleRotation(state.rotationEnabled);
    setMouseState({
        pan: state.panEnabled, zoom: state.zoomEnabled,
        rotateObject: state.rotateObjectEnabled, moveObject: state.moveObjectEnabled,
        rotateCamera: state.rotateCameraEnabled,
    });
    if (state.cameraState) {
        camera.position.copy(state.cameraState.position);
        camera.rotation.copy(state.cameraState.rotation);
    }
    if (state.pivotState) {
        pivotGroup.position.copy(state.pivotState.position);
        pivotGroup.rotation.copy(state.pivotState.rotation);
    }
    if (state.text) {
        pendingStateRestore = state;
        window.parent.postMessage({ command: 'requestFontDataForRestore' }, '*');
    }
}

function handleFontDataForRestore(args) {
    if (pendingStateRestore) {
        updateViewer({
            fontData: args.fontData,
            text: pendingStateRestore.text,
            is3D: pendingStateRestore.is3D,
            shouldFrame: false,
            shouldResetPosition: false
        });
        pendingStateRestore = null;
    }
}

/**
 * Manages the special wireframe view mode autonomously by saving/restoring
 * its own state and using its cached font data to rebuild geometry.
 * @param {boolean} active - True to activate wireframe mode.
 */
function setWireframeMode(active) {
    
    try {
        if (active) {
            // 1. Save the complete internal state.
            savedViewState = {
                cameraPos: camera.position.clone(), cameraRot: camera.rotation.clone(),
                pivotPos: pivotGroup.position.clone(), pivotRot: pivotGroup.rotation.clone(),
                rotationEnabled, panEnabled, zoomEnabled, rotateCameraEnabled, gridVisible, is3D,
                rotateObjectEnabled, moveObjectEnabled, currentMaterialConstructor
            };

                 
            // 2. Rebuild the geometry as a flat 2D shape for wireframe view.
            updateViewer({
                fontData: currentFontData,
                text: currentText,
                is3D: false, // Force 2D
                shouldFrame: false, // We will frame manually
                shouldResetPosition: true // Center the new 2D geometry
            });

            // 3. Apply the temporary wireframe mode state
            rotationEnabled = false; // Pause the animation
            panEnabled = true;
            zoomEnabled = true;
            rotateCameraEnabled = false;
            rotateObjectEnabled = false;
            moveObjectEnabled = false;
            toggleGrid(false);
            pivotGroup.rotation.set(0, 0, 0);

            // 4. Apply wireframe material and frame the new 2D shape.
            setMaterial('Wireframe');
            
            requestAnimationFrame(frameObject);

        } else if (savedViewState) {

             // 1. Restore all simple state variables first.
            is3D = savedViewState.is3D;
            currentMaterialConstructor = savedViewState.currentMaterialConstructor;

            // 2. Rebuild the geometry with the restored state (e.g., back to 3D).
            updateViewer({
                fontData: currentFontData,
                text: currentText,
                is3D: savedViewState.is3D,
                shouldFrame: false,
                shouldResetPosition: false // Position will be restored manually
            });

            // 3. Restore the material and all scene/camera positions.
            const materialName = Object.keys(materialMap).find(key => materialMap[key] === currentMaterialConstructor) || 'Phong';
            setMaterial(materialName);

            camera.position.copy(savedViewState.cameraPos);
            camera.rotation.copy(savedViewState.cameraRot);
            pivotGroup.position.copy(savedViewState.pivotPos);
            pivotGroup.rotation.copy(savedViewState.pivotRot);

            // Restore other states
            rotationEnabled = savedViewState.rotationEnabled;
            panEnabled = savedViewState.panEnabled;
            zoomEnabled = savedViewState.zoomEnabled;
            rotateCameraEnabled = savedViewState.rotateCameraEnabled;
            toggleGrid(savedViewState.gridVisible);
            rotateObjectEnabled = savedViewState.rotateObjectEnabled;
            moveObjectEnabled = savedViewState.moveObjectEnabled;

            savedViewState = null;
        }
    } catch (error) {
        console.error("Error during wireframe transition:", error);
        resetView();
    }
}
//----------------------------------------> END [STATE MANAGEMENT & COMMUNICATION]


//-------------------------------------------------------------
//----------------[   ERROR HANDLING & LOGGING   ]-------------
//-------------------------------------------------------------

function reportErrorToParent(error, logArgs = null) {
    const errorDetails = {
        type: isThreeJsError(error) ? 'threejs' : 'generic',
        message: error.message,
        // Si tenemos argumentos de log (del interceptor), los enviamos.
        // Si no (de un try/catch), enviamos el stack como un objeto.
        logData: logArgs || [{ message: error.message, stack: error.stack?.split('\n').map(s => s.trim()) }]
    };
    window.parent.postMessage({ command: 'reportError', payload: errorDetails }, '*');
}


function log(message) {
    console.log(`%cviewer> ${message}`, 'color: cyan; font-weight: bold;');
}
window.onerror = function (message, source, lineno, colno, error) {
 originalConsoleError("Caught unhandled exception:", errorObj);
     reportErrorToParent(errorObj);
    return true;
};
function isThreeJsError(error) {
    if (!error || !error.stack) return false;
    const stack = error.stack.toLowerCase();
    // Check for the script name in the stack trace for higher accuracy
    return stack.includes('three.min.js') || stack.includes('three.module.js') || stack.includes('three');
}


function setupConsoleInterceptor() {
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;

    const interceptAndReport = (originalLogFunc, ...args) => {
        originalLogFunc.apply(console, args);

        // Process arguments using the new intelligent parser
        const logArgs = args.map(arg => {
            if (typeof arg === 'object' && arg !== null) {
                // Use the intelligent parser instead of JSON.stringify
                return inspectAndCleanObject(arg);
            }
            return arg;
        });

        const syntheticError = new Error(logArgs.find(arg => typeof arg === 'string') || 'Console Log');
        reportErrorToParent(syntheticError, logArgs);
    };

    console.error = (...args) => interceptAndReport(originalConsoleError, ...args);
    console.warn = (...args) => interceptAndReport(originalConsoleWarn, ...args);
}
/**
 * Intelligently inspects a JavaScript object and creates a clean, serializable
 * representation suitable for postMessage and UI formatters. It handles circular
 * references, summarizes large data, and adds constructor names.
 * @param {any} obj The object to inspect.
 * @returns {object} A clean, descriptive object.
 */
function inspectAndCleanObject(obj) {
    const maxDepth = 5; // Prevents infinite recursion in complex objects
    const visited = new WeakSet(); // Handles circular references

    function inspect(item, depth) {
        // Fail-safe for extreme cases
        if (depth > maxDepth) {
            return "[Max depth reached]";
        }
        if (typeof item !== 'object' || item === null) {
            return item;
        }
        if (visited.has(item)) {
            return "[Circular Reference]";
        }
        visited.add(item);

        // --- Custom Formatters for THREE types ---
        const constructorName = item.constructor ? item.constructor.name : 'Object';

        if (item.isVector3 || item.isVector2 || item.isEuler || item.isColor) {
            const clean = { _constructorName: constructorName };
            ['r', 'g', 'b', 'x', 'y', 'z', 'order'].forEach(prop => {
                if (item[prop] !== undefined) clean[prop] = item[prop];
            });
            return clean;
        }

        if (item.isBufferAttribute) {
            return {
                _constructorName: "BufferAttribute",
                array: `[${item.array.length} items]`,
                count: item.count,
                itemSize: item.itemSize,
                normalized: item.normalized
            };
        }

        // Generic object/array handler
        const isArray = Array.isArray(item);
        const result = isArray ? [] : { _constructorName: constructorName };

        for (const key in item) {
            // Only inspect own properties, excluding common THREE internal ones
            if (Object.prototype.hasOwnProperty.call(item, key) && !key.startsWith('_')) {
                try {
                    result[key] = inspect(item[key], depth + 1);
                } catch (e) {
                    result[key] = `[Error inspecting property: ${e.message}]`;
                }
            }
        }
        return result;
    }

    // Main try-catch block for overall safety
    try {
        return inspect(obj, 0);
    } catch (e) {
        return { error: "Failed to inspect object", message: e.message };
    }
}


//----------------------------------------> END [ERROR HANDLING & LOGGING]


//-------------------------------------------------------------
//--------------------[   INITIAL EXECUTION   ]----------------
//-------------------------------------------------------------
initScene();
//----------------------------------------> END [INITIAL EXECUTION]