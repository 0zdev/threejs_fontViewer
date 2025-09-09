/**
 * Project: Three.js JSON Font Editor
 * File: editor/viewer/viewer-core.js
 * (Complete, Dependency-Injected Architecture)
 *
 * Description:
 * This script contains the complete core logic for the Three.js viewer application.
 * It is environment-agnostic and receives all its dependencies (like the THREE
 * object and a font parser function) via the initViewer entry point. This allows
 * it to be used in both legacy and modern module environments without modification.
 */

//-------------------------------------------------------------
//---------------------[   MODULE STATE   ]--------------------
//-------------------------------------------------------------

// Injected dependencies, populated by initViewer
let THREE;
let TextGeometry;
let fontParser;
let appConfig;

// Constants restored from original viewer.js
const VERTICAL_ALIGN_MODE = 'baseline';
const SHOW_BOUNDING_BOX_IN_WIREFRAME = true;

// Scene and Core Three.js components
let scene, camera, renderer, textMesh, gridHelper, pivotGroup, boundingBoxHelper;

// State variables
let panEnabled = false, zoomEnabled = true, is3D = true, gridVisible = true, rotationEnabled = true;
let rotateObjectEnabled = true, moveObjectEnabled = false, rotateCameraEnabled = false;
let isBoundingBoxVisible = false;

// Material and color state
let currentMaterialConstructor;
let isWireframe = false;
let currentColor = '#0077fe';
let currentAlpha = 1.0;
let currentTheme = 'dark';

// State for advanced features
let savedViewState = null;
let pendingStateRestore = null;
let currentFontData = null;
let currentText = '';
let isFirstRender = true;
let originalConsoleError = console.error;

const materialMap = {}; // Will be populated in initViewer

//----------------------------------------> END [MODULE STATE]


//-------------------------------------------------------------
//---------------------[   PUBLIC API   ]----------------------
//-------------------------------------------------------------

/**
 * Initializes the entire viewer application.
 * This is the single entry point for this module.
 * @param {object} dependencies - An object containing all necessary dependencies.
 * @param {object} dependencies.THREE - The core THREE library object.
 * @param {function} dependencies.TextGeometry - The constructor for TextGeometry.
 * @param {function} dependencies.fontParser - A function that takes font JSON and returns a Font object.
 * @param {object} config_dep - A configuration object for version-specific logic.
 */
export function initViewer(dependencies, config_dep) {
    // Populate module-level variables with injected dependencies
    THREE = dependencies.THREE;
    TextGeometry = dependencies.TextGeometry;
    fontParser = dependencies.fontParser;
    appConfig = config_dep;

    // Populate material map using the injected THREE object
    Object.assign(materialMap, {
        'Normal': THREE.MeshNormalMaterial, 'Basic': THREE.MeshBasicMaterial,
        'Lambert': THREE.MeshLambertMaterial, 'Phong': THREE.MeshPhongMaterial,
        'Standard': THREE.MeshStandardMaterial, 'Physical': THREE.MeshPhysicalMaterial,
        'Toon': THREE.MeshToonMaterial, 'Wireframe': THREE.MeshBasicMaterial,
    });
    currentMaterialConstructor = THREE.MeshPhongMaterial;

    initScene();
    setupMessageListener();
}

//----------------------------------------> END [PUBLIC API]


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

//----------------------------------------> END [SCENE SETUP]


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

/**
 * [MODIFIED] The main update function. It now uses the config flag in two places:
 * once to call the correct geometry creation, and again for the 'baseline'
 * alignment calculation to support very old Three.js versions.
 */
function updateViewer(args) {
    try {
        if (args.fontHasChanged) {
            if (args.fontData) currentFontData = args.fontData;
            else { reportErrorToParent(new Error('Sync Error: fontHasChanged but no fontData.')); return; }
        }

        currentText = args.text;
        const { text, is3D: is3Dmode, shouldFrame, shouldResetPosition } = args;

        if (textMesh) {
            pivotGroup.remove(textMesh);
            textMesh.geometry.dispose();
            if (textMesh.material) textMesh.material.dispose();
            textMesh = null;
        }

        updateBoundingBoxHelper(null);

        if (!text || !currentFontData) return;

        is3D = is3Dmode;
        
        const font = fontParser(currentFontData);
        const geometry = createTextGeometry(font, text, is3Dmode);

        if (geometry) {
            const materialProps = { color: new THREE.Color(currentColor), wireframe: isWireframe, transparent: true, opacity: currentAlpha };
            const material = new currentMaterialConstructor(materialProps);
            textMesh = new THREE.Mesh(geometry, material);
            pivotGroup.add(textMesh);

            const userPosX = shouldResetPosition ? 0 : pivotGroup.position.x;
            const userPosY = shouldResetPosition ? 0 : pivotGroup.position.y;
            const userPosZ = shouldResetPosition ? 0 : pivotGroup.position.z;

            if (shouldResetPosition) {
                 pivotGroup.rotation.set(0, 0, 0);
            }

            let finalY;
            if (shouldResetPosition || isFirstRender) {
                if (VERTICAL_ALIGN_MODE === 'baseline') {
                    const center = new THREE.Vector3();
                    
                    // [FIX] Apply the same conditional logic here for getCenter()
                    if (appConfig.useManualCenter) {
                        center.addVectors( geometry.boundingBox.min, geometry.boundingBox.max ).multiplyScalar( 0.5 );
                    } else {
                        geometry.boundingBox.getCenter(center);
                    }
                    
                    finalY = center.y - geometry.boundingBox.min.y;
                } else { // 'center' mode
                    finalY = 0;
                }
                isFirstRender = false;
            } else {
                finalY = userPosY;
            }
            pivotGroup.position.set(userPosX, finalY, userPosZ);

            if (shouldFrame) {
                frameObject();
            }

            updateBoundingBoxHelper(textMesh);
        }
    } catch (error) {
        originalConsoleError("Caught exception during viewer update:", error);
        reportErrorToParent(error);
    }
}

/**
 * [MODIFIED] Creates the TextGeometry, now handling both modern and very-legacy
 * geometry centering methods based on the injected config.
 * @param {THREE.Font} font - The parsed font object.
 * @param {string} text - The string to render.
 * @param {boolean} is3Dmode - Whether to render in 3D.
 * @returns {THREE.BufferGeometry|null} The created text geometry.
 * @private
 */
function createTextGeometry(font, text, is3Dmode) {
    const geometryOptions = {
        font: font,
        size: 1,
        curveSegments: 12,
        bevelEnabled: is3Dmode,
        bevelThickness: 0.01,
        bevelSize: 0.01,
        bevelSegments: 2
    };

    const extrusionValue = is3Dmode ? 0.2 : 0;
    if (appConfig.useDepthProperty) {
        geometryOptions.depth = extrusionValue;
    } else {
        geometryOptions.height = extrusionValue;
    }

    const geometry = new TextGeometry(text, geometryOptions);

    geometry.computeBoundingBox();
    const center = new THREE.Vector3();

    // [NEW LOGIC] Use the correct centering method based on the version flag
    if (appConfig.useManualCenter) {
        // Manual calculation for very old versions (< r81)
        center.addVectors( geometry.boundingBox.min, geometry.boundingBox.max ).multiplyScalar( 0.5 );
    } else {
        // Standard method for all other versions
        geometry.boundingBox.getCenter(center);
    }

    geometry.translate(-center.x, -center.y, -center.z);

    return geometry;
}

function setColor(color, alpha) {
    currentColor = color;
    currentAlpha = alpha;
    if (textMesh?.material) {
        if (textMesh.material.color) textMesh.material.color.set(color);
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
    if (!camera) return;
    camera.position.set(0, 0.7, 2.5);
    camera.lookAt(new THREE.Vector3(0, 0, 0));
    if (pivotGroup) {
        pivotGroup.rotation.set(0, 0, 0);
        pivotGroup.position.set(0, 0, 0);
    }
}

/**
 * [MODIFIED] Frames the camera to fit the currently rendered text object.
 * It now uses a config flag to manually calculate the bounding box size
 * on very old Three.js versions.
 */
function frameObject() {
    if (!textMesh) return;
    
    const boundingBox = new THREE.Box3().setFromObject(textMesh);
    let size;

    // [FIX] Use the correct method to get the bounding box size
    if (appConfig.useManualBoxSize) {
        // Manual calculation for very old versions (< r81)
        size = new THREE.Vector3().subVectors(boundingBox.max, boundingBox.min);
    } else {
        // Standard method for all other versions
        size = boundingBox.getSize(new THREE.Vector3());
    }

    if (size.x > 0 || size.y > 0) {
        const fov = camera.fov * (Math.PI / 180);
        const aspect = window.innerWidth / window.innerHeight;
        const distance = (aspect > size.x / size.y)
            ? (size.y / 2) / Math.tan(fov / 2)
            : (size.x / 2) / (aspect * Math.tan(fov / 2));
        camera.position.set(pivotGroup.position.x, pivotGroup.position.y, pivotGroup.position.z + distance * 1.5);
        camera.lookAt(pivotGroup.position);
    }
}
function toggleRotation(enabled) { rotationEnabled = enabled; }
function toggleGrid(visible) { gridVisible = visible; if (gridHelper) gridHelper.visible = visible; }

function updateTheme(theme) {
    currentTheme = theme;
    if (scene) scene.background = new THREE.Color(theme === 'dark' ? 0x1a1a1a : 0xf8f9fa);
    if (boundingBoxHelper) {
        boundingBoxHelper.material.color.set(new THREE.Color(theme === 'dark' ? 0x666666 : 0x444444));
    }
}

function toggleBoundingBox(visible) {
    isBoundingBoxVisible = visible;
    updateBoundingBoxHelper(isBoundingBoxVisible ? textMesh : null);
}

/**
 * [MODIFIED] Creates, updates, or removes the bounding box helper visualization.
 * It now uses a config flag to manually calculate the box size on very old
 * Three.js versions, avoiding the use of the non-existent .getSize() method.
 */
function updateBoundingBoxHelper(mesh) {
    if (boundingBoxHelper) {
        if (boundingBoxHelper.parent) {
            boundingBoxHelper.parent.remove(boundingBoxHelper);
        }
        boundingBoxHelper.geometry.dispose();
        boundingBoxHelper.material.dispose();
        boundingBoxHelper = null;
    }

    if (!mesh || !isBoundingBoxVisible) return;
    if (isWireframe && !SHOW_BOUNDING_BOX_IN_WIREFRAME) return;
    
    const box = mesh.geometry.boundingBox;
    let size;

    // [NEW LOGIC] Use the correct method to get the bounding box size
    if (appConfig.useManualBoxSize) {
        // Manual calculation for very old versions (< r81)
        size = new THREE.Vector3().subVectors(box.max, box.min);
    } else {
        // Standard method for all other versions
        size = box.getSize(new THREE.Vector3());
    }

    const center = new THREE.Vector3();
    // The getCenter logic was already fixed in a previous step, so we reuse it
    if (appConfig.useManualCenter) {
        center.addVectors( box.min, box.max ).multiplyScalar( 0.5 );
    } else {
        box.getCenter(center);
    }

    const boxGeometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    const edgesGeometry = new THREE.EdgesGeometry(boxGeometry);
    
    const lineMaterial = new THREE.LineBasicMaterial({
        color: (currentTheme === 'dark') ? 0x666666 : 0x444444,
        transparent: true,
        opacity: 0.7
    });

    boundingBoxHelper = new THREE.LineSegments(edgesGeometry, lineMaterial);
    
    // The created box geometry is already centered at (0,0,0),
    // so we position the helper at the calculated center of the text's bounding box.
    boundingBoxHelper.position.copy(center);
    pivotGroup.add(boundingBoxHelper);
}

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
            const radius = camera.position.distanceTo(pivotGroup.position);
            camera.position.sub(pivotGroup.position);
            let phi = Math.acos(camera.position.y / radius) - deltaY * 0.01;
            phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi));
            const theta = Math.atan2(camera.position.z, camera.position.x) - deltaX * 0.01;
            camera.position.x = radius * Math.sin(phi) * Math.cos(theta);
            camera.position.y = radius * Math.cos(phi);
            camera.position.z = radius * Math.sin(phi) * Math.sin(theta);
            camera.position.add(pivotGroup.position);
            camera.lookAt(pivotGroup.position);
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
            if (camera.position.distanceTo(pivotGroup.position) < 0.2) {
                camera.position.copy(pivotGroup.position).addScaledVector(direction, -0.2);
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

function setupMessageListener() {
    window.addEventListener('message', (event) => {
        if (event.source !== window.parent) return;
        const { command, args } = event.data;
        try {
            switch (command) {
                case 'update': updateViewer(args); break;
                case 'setColor': setColor(args.color, args.alpha); break;
                case 'setMaterial': setMaterial(args.material); break;
                case 'toggleRotation': toggleRotation(args.enabled); break;
                case 'toggleGrid': toggleGrid(args.visible); break;
                case 'toggleBoundingBox': toggleBoundingBox(args.visible); break;
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
    window.parent.postMessage({ command: 'ready' }, '*');
}

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
    setMouseState({ pan: state.panEnabled, zoom: state.zoomEnabled, rotateObject: state.rotateObjectEnabled, moveObject: state.moveObjectEnabled, rotateCamera: state.rotateCameraEnabled });
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
        updateViewer({ fontData: args.fontData, text: pendingStateRestore.text, is3D: pendingStateRestore.is3D, shouldFrame: false, shouldResetPosition: false, fontHasChanged: true });
        pendingStateRestore = null;
    }
}

function setWireframeMode(active) {
    try {
        if (active) {
            const currentAlign = VERTICAL_ALIGN_MODE; // Use a local copy
            savedViewState = { cameraPos: camera.position.clone(), cameraRot: camera.rotation.clone(), pivotPos: pivotGroup.position.clone(), pivotRot: pivotGroup.rotation.clone(), rotationEnabled, panEnabled, zoomEnabled, rotateCameraEnabled, gridVisible, is3D, rotateObjectEnabled, moveObjectEnabled, currentMaterialConstructor, verticalAlign: currentAlign };
            
            // Temporarily override VERTICAL_ALIGN_MODE for wireframe view
            const tempAlignMode = 'center';
            const tempIs3D = false;
            
            updateViewer({ fontData: null, fontHasChanged: false, text: currentText, is3D: tempIs3D, shouldFrame: false, shouldResetPosition: true });
            
            rotationEnabled = false; panEnabled = true; zoomEnabled = true; rotateCameraEnabled = false; rotateObjectEnabled = false; moveObjectEnabled = false;
            toggleGrid(false);
            setMaterial('Wireframe');
            requestAnimationFrame(frameObject);
        } else if (savedViewState) {
            is3D = savedViewState.is3D;
            currentMaterialConstructor = savedViewState.currentMaterialConstructor;
            updateViewer({ fontData: null, fontHasChanged: false, text: currentText, is3D: savedViewState.is3D, shouldFrame: false, shouldResetPosition: false });
            const materialName = Object.keys(materialMap).find(key => materialMap[key] === currentMaterialConstructor) || 'Phong';
            setMaterial(materialName);
            camera.position.copy(savedViewState.cameraPos);
            camera.rotation.copy(savedViewState.cameraRot);
            pivotGroup.position.copy(savedViewState.pivotPos);
            pivotGroup.rotation.copy(savedViewState.pivotRot);
            rotationEnabled = savedViewState.rotationEnabled; panEnabled = savedViewState.panEnabled; zoomEnabled = savedViewState.zoomEnabled; rotateCameraEnabled = savedViewState.rotateCameraEnabled;
            toggleGrid(savedViewState.gridVisible);
            rotateObjectEnabled = savedViewState.rotateObjectEnabled; moveObjectEnabled = savedViewState.moveObjectEnabled;
            savedViewState = null;
        }
    } catch (error) {
        console.error("Error during wireframe transition:", error);
        resetView();
    }
}

//----------------------------------------> END [STATE MANAGEMENT]


//-------------------------------------------------------------
//----------------[   ERROR HANDLING & LOGGING   ]-------------
//-------------------------------------------------------------

function reportErrorToParent(error, logArgs = null) {
    const errorDetails = { type: isThreeJsError(error) ? 'threejs' : 'generic', message: error.message, logData: logArgs || [{ message: error.message, stack: error.stack?.split('\n').map(s => s.trim()) }] };
    window.parent.postMessage({ command: 'reportError', payload: errorDetails }, '*');
}

window.onerror = function (message, source, lineno, colno, error) {
    originalConsoleError("Caught unhandled exception:", error);
    reportErrorToParent(error);
    return true;
};

function isThreeJsError(error) {
    if (!error || !error.stack) return false;
    const stack = error.stack.toLowerCase();
    return stack.includes('three.min.js') || stack.includes('three.module.js') || stack.includes('three');
}

function setupConsoleInterceptor() {
    const originalConsoleWarn = console.warn;
    const interceptAndReport = (originalLogFunc, ...args) => {
        originalLogFunc.apply(console, args);
        const logArgs = args.map(arg => { if (typeof arg === 'object' && arg !== null) { return inspectAndCleanObject(arg); } return arg; });
        const syntheticError = new Error(logArgs.find(arg => typeof arg === 'string') || 'Console Log');
        reportErrorToParent(syntheticError, logArgs);
    };
    console.error = (...args) => interceptAndReport(originalConsoleError, ...args);
    console.warn = (...args) => interceptAndReport(originalConsoleWarn, ...args);
}

function inspectAndCleanObject(obj) {
    const maxDepth = 5; const visited = new WeakSet();
    function inspect(item, depth) {
        if (depth > maxDepth) return "[Max depth reached]";
        if (typeof item !== 'object' || item === null) return item;
        if (visited.has(item)) return "[Circular Reference]";
        visited.add(item);
        const constructorName = item.constructor ? item.constructor.name : 'Object';
        if (item.isVector3 || item.isVector2 || item.isEuler || item.isColor) { const clean = { _constructorName: constructorName }; ['r', 'g', 'b', 'x', 'y', 'z', 'order'].forEach(prop => { if (item[prop] !== undefined) clean[prop] = item[prop]; }); return clean; }
        if (item.isBufferAttribute) { return { _constructorName: "BufferAttribute", array: `[${item.array.length} items]`, count: item.count, itemSize: item.itemSize, normalized: item.normalized }; }
        const isArray = Array.isArray(item); const result = isArray ? [] : { _constructorName: constructorName };
        for (const key in item) { if (Object.prototype.hasOwnProperty.call(item, key) && !key.startsWith('_')) { try { result[key] = inspect(item[key], depth + 1); } catch (e) { result[key] = `[Error inspecting property: ${e.message}]`; } } }
        return result;
    }
    try { return inspect(obj, 0); } catch (e) { return { error: "Failed to inspect object", message: e.message }; }
}

//----------------------------------------> END [ERROR HANDLING]