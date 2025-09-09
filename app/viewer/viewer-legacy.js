/**
 * Project: Three.js JSON Font Editor
 * File: editor/viewer/viewer-legacy.js
 * (Final, Dependency-Injection Architecture)
 *
 * Description:
 * This is the entry point for legacy (UMD) versions of Three.js. It assumes
 * that the THREE object has been attached to the global 'window' object.
 * It prepares the environment-specific dependencies and configuration, then
 * dynamically imports and initializes the core viewer logic.
 */

/**
 * [MODIFIED] This is the entry point for legacy (UMD) versions of Three.js.
 * It now detects very old versions (< r81) and passes a config flag
 * to the core viewer to handle API differences.
 */
(async () => {
    if (!window.THREE) {
        console.error("viewer-legacy.js: THREE object not found on window. Aborting.");
        return;
    }

    const THREE = window.THREE;

    if (!THREE.TextGeometry && parseInt(THREE.REVISION, 10) >= 133) {
        console.error("viewer-legacy.js: THREE.TextGeometry not found. Make sure the addon script was loaded. Aborting.");
        return;
    }

    const legacyDependencies = {
        THREE: THREE,
        TextGeometry: THREE.TextGeometry,
        fontParser: (data) => new THREE.Font(data)
    };

    const revision = parseInt(THREE.REVISION, 10) || 0;
    
    // [NEW LOGIC] Create the full config object
    const config = {
        useDepthProperty: revision >= 162,
        useManualCenter: revision < 81, // Flag for very old centering logic
          useManualBoxSize: revision < 81
    };

    try {
        const core = await import('./viewer-core.js');
        core.initViewer(legacyDependencies, config);
    } catch (error) {
        console.error("Failed to load or initialize viewer-core.js from legacy loader:", error);
    }
})();