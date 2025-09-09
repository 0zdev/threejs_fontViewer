/**
 * Project: Three.js JSON Font Editor
 * File: editor/js/workers/font-processor.worker.js
 * (CORRECTED VERSION)
 *
 * Description:
 * A module worker using absolute URLs from an ES Module CDN (esm.sh)
 * to resolve dependencies correctly within the isolated worker context.
 */

// 1. Importar directamente desde una CDN de módulos ES.
//    esm.sh resolverá las dependencias internas de TTFLoader (como 'three') por nosotros.
import { TTFLoader } from 'https://cdn.esm.sh/three@0.180.0/examples/jsm/loaders/TTFLoader.js';

 
self.onmessage = function (e) {
    const { buffer, type } = e.data;

    try {
        self.postMessage({ status: 'processing' });

        if (type !== 'ttf') {
            throw new Error(`Unsupported file type: '${type}'. This worker only processes .TTF binary fonts.`);
        }
        
        const ttfLoader = new TTFLoader();
        const typefaceJson = ttfLoader.parse(buffer);
        
        self.postMessage({ status: 'success', result: typefaceJson });

    } catch (error) {
        self.postMessage({ status: 'error', message: `Failed to parse font: ${error.message}` });
    }
};