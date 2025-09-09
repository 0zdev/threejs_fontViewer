/**
 * Project: Three.js JSON Font Editor
 * File: editor/viewer/viewer-module.js
 * (Final, Dependency-Injection Architecture)
 *
 * Description:
 * This is the entry point for modern ES Module versions of Three.js. It uses
 * 'import' statements to load its dependencies, which are resolved by the
 * importmap present in the host HTML. It then initializes the core viewer logic.
 */

// --- Step 1: Import all dependencies directly ---
/**
 * [MODIFIED] This is the entry point for modern ES Module versions of Three.js.
 * It now includes the 'useManualCenter' config flag for architectural consistency.
 */

import * as THREE from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { initViewer } from './viewer-core.js';

const loader = new FontLoader();

const moduleDependencies = {
    THREE: THREE,
    TextGeometry: TextGeometry,
    fontParser: (data) => loader.parse(data)
};

const revision = parseInt(THREE.REVISION, 10) || 0;

// [NEW LOGIC] Create the full config object
const config = {
    useDepthProperty: revision >= 162,
    useManualCenter: revision < 81, // Will always be false , but good for consistency!
      useManualBoxSize: revision < 81
};

try {
    initViewer(moduleDependencies, config);
} catch (error) {
    console.error("Failed to initialize viewer-core.js from module loader:", error);
}