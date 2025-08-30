/**
 * Project: Three.js JSON Font Editor
 * File: editor/js/glyph-viewer.js
 * Created: 2025-08-29
 * Author: [Tu Nombre/Apodo]
 *
 * Description:
 * This module manages the virtualized glyph viewer tab, including rendering
 * glyphs to canvas elements and handling scrolling performance.
 */

//-------------------------------------------------------------
//--------------------[   MODULE STATE   ]---------------------
//-------------------------------------------------------------

const glyphViewerState = {
    isInitialized: false,
    fontKey: null,
    metrics: {},
    nodes: { container: null, sizer: null, pool: null },
    pool: [],
    data: [],
    updateQueue: [],
    isTaskProcessorScheduled: false,
    resizeObserver: null,
};
//----------------------------------------> END [MODULE STATE]


//-------------------------------------------------------------
//--------------------[   INITIALIZATION   ]-------------------
//-------------------------------------------------------------

/**
 * Initializes the glyph viewer for the currently active font.
 * @param {object} editorInstance - The CodeMirror editor instance.
 * @param {string} currentFontKey - The key of the currently loaded font.
 * @returns {void}
 */
function init(editorInstance, currentFontKey) {
    if (glyphViewerState.isInitialized && glyphViewerState.fontKey === currentFontKey) return;
    if (glyphViewerState.resizeObserver) glyphViewerState.resizeObserver.disconnect();
    
    // Reset state
    Object.assign(glyphViewerState, {
        isInitialized: false, fontKey: currentFontKey, metrics: {}, pool: [], data: [],
        updateQueue: [], isTaskProcessorScheduled: false,
    });

    glyphViewerState.nodes.container = document.getElementById('glyphGridsContainer');
    glyphViewerState.nodes.sizer = document.getElementById('glyphSizer');
    glyphViewerState.nodes.pool = document.getElementById('glyphPoolContainer');
    glyphViewerState.nodes.pool.innerHTML = '';
    
    try {
        const fontData = JSON.parse(editorInstance.getValue());
        const glyphs = fontData.glyphs || {};
        glyphViewerState.data = Object.keys(glyphs).map(char => ({
            char: char, data: glyphs[char], fontBoundingBox: fontData.boundingBox
        }));

        document.getElementById('glyphCount').textContent = `${glyphViewerState.data.length} Glyphs`;
        if (glyphViewerState.data.length === 0) {
            glyphViewerState.nodes.sizer.style.height = '0px';
            return;
        }

        glyphViewerState.isInitialized = true;
        measureAndCalculateMetrics(); // Kicks off the rendering process
        glyphViewerState.nodes.container.onscroll = handleGlyphViewScroll;
        glyphViewerState.resizeObserver = new ResizeObserver(measureAndCalculateMetrics);
        glyphViewerState.resizeObserver.observe(glyphViewerState.nodes.container);
    } catch (error) {
        console.error("Error initializing glyph viewer:", error);
    }
}
//----------------------------------------> END [INITIALIZATION]


//-------------------------------------------------------------
//---------------[   VIRTUALIZATION LOGIC   ]------------------
//-------------------------------------------------------------

function measureAndCalculateMetrics() {
    const m = glyphViewerState.metrics;
    const container = glyphViewerState.nodes.container;
    m.itemWidth = 80; m.itemHeight = 80;
    const containerWidth = container.clientWidth;
    const gap = 12;
    m.itemsPerRow = Math.max(1, Math.floor((containerWidth - 16 * 2) / (m.itemWidth + gap)));
    m.rowHeight = m.itemHeight + gap;
    const totalRows = Math.ceil(glyphViewerState.data.length / m.itemsPerRow);
    glyphViewerState.nodes.sizer.style.height = `${totalRows * m.rowHeight}px`;
    m.visibleRows = Math.ceil(container.clientHeight / m.rowHeight);
    const poolRowCount = m.visibleRows + 5 * 2; // Buffer rows
    const newPoolSize = poolRowCount * m.itemsPerRow;

    if (newPoolSize !== m.poolSize) {
        m.poolSize = newPoolSize;
        createNodePoolAndAttach();
    }
    handleGlyphViewScroll();
}

function createNodePoolAndAttach() {
    const { pool, metrics } = glyphViewerState;
    const poolContainer = glyphViewerState.nodes.pool;
    poolContainer.innerHTML = '';
    pool.length = 0;
    for (let i = 0; i < metrics.poolSize; i++) {
        const card = document.createElement('div');
        card.className = 'glyph-card';
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const charSpan = document.createElement('span');
        charSpan.className = 'glyph-char';
        card.appendChild(canvas); card.appendChild(charSpan);
        pool.push(card); poolContainer.appendChild(card);
    }
}

function handleGlyphViewScroll() {
    requestAnimationFrame(() => {
        if (!glyphViewerState.isInitialized) return;
        glyphViewerState.updateQueue.length = 0; // Clear pending tasks

        const { metrics, nodes, data, pool } = glyphViewerState;
        const scrollTop = nodes.container.scrollTop;
        const firstVisibleRow = Math.floor(scrollTop / metrics.rowHeight);
        nodes.pool.style.transform = `translateY(${firstVisibleRow * metrics.rowHeight}px)`;
        const startIndex = firstVisibleRow * metrics.itemsPerRow;

        for (let i = 0; i < metrics.poolSize; i++) {
            const dataIndex = startIndex + i;
            const node = pool[i];
            if (dataIndex < data.length) {
                const rowInPool = Math.floor(i / metrics.itemsPerRow);
                const colInPool = i % metrics.itemsPerRow;
                node.style.top = `${rowInPool * metrics.rowHeight}px`;
                node.style.left = `${colInPool * (metrics.itemWidth + 12) + 16}px`;
                node.style.visibility = 'visible';
                node.classList.add('is-loading');
                glyphViewerState.updateQueue.push({ poolIndex: i, data: data[dataIndex] });
            } else {
                node.style.visibility = 'hidden';
            }
        }
        scheduleTaskProcessing();
    });
}

function scheduleTaskProcessing() {
    if (glyphViewerState.isTaskProcessorScheduled) return;
    glyphViewerState.isTaskProcessorScheduled = true;
    requestIdleCallback(processQueue);
}

function processQueue(deadline) {
    const { updateQueue, pool } = glyphViewerState;
    while (deadline.timeRemaining() > 0 && updateQueue.length > 0) {
        const task = updateQueue.shift();
        const node = pool[task.poolIndex];
        if (!node) continue;
        node.querySelector('.glyph-char').textContent = task.data.char;
        drawGlyphOnCanvas(node.querySelector('canvas'), task.data.data, task.data.fontBoundingBox);
        node.classList.remove('is-loading');
        // This onclick will be assigned to a global function
        node.onclick = () => window.handleGlyphClick(task.data.char);
    }
    if (updateQueue.length > 0) {
        requestIdleCallback(processQueue);
    } else {
        glyphViewerState.isTaskProcessorScheduled = false;
    }
}
//----------------------------------------> END [VIRTUALIZATION LOGIC]


//-------------------------------------------------------------
//--------------------[   CANVAS DRAWING   ]-------------------
//-------------------------------------------------------------

/**
 * Draws a single glyph's outline onto a 2D canvas.
 * @param {HTMLCanvasElement} canvas - The canvas element to draw on.
 * @param {object} glyphData - The data object for the glyph.
 * @param {object} fontBoundingBox - The bounding box of the entire font.
 * @returns {void}
 */
function drawGlyphOnCanvas(canvas, glyphData, fontBoundingBox) {
    if (!glyphData?.o) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const padding = canvas.width * 0.15;
    const drawableWidth = canvas.width - (padding * 2);
    const drawableHeight = canvas.height - (padding * 2);
    const glyphWidth = glyphData.x_max - (glyphData.x_min || 0);
    const fontHeight = fontBoundingBox.yMax - fontBoundingBox.yMin;
    if (glyphWidth <= 0 || fontHeight <= 0) return;

    const scale = Math.min(drawableWidth / glyphWidth, drawableHeight / fontHeight);
    const glyphCenterX = (glyphData.x_min || 0) + glyphWidth / 2;
    const glyphCenterY = fontBoundingBox.yMin + fontHeight / 2;
    const offsetX = (canvas.width / 2) - (glyphCenterX * scale);
    const offsetY = (canvas.height / 2) + (glyphCenterY * scale);
    const pathCommands = glyphData.o.split(' ');

    ctx.beginPath();
    
        for (let i = 0; i < pathCommands.length;) {
        const command = pathCommands[i++];

        const transform = (px, py) => ({
            x: px * scale + offsetX,
            y: -py * scale + offsetY
        });

        switch (command) {
            case 'm': { // moveto
                const p = transform(parseFloat(pathCommands[i++]), parseFloat(pathCommands[i++]));
                ctx.moveTo(p.x, p.y);
                break;
            }
            case 'l': { // lineto
                const p = transform(parseFloat(pathCommands[i++]), parseFloat(pathCommands[i++]));
                ctx.lineTo(p.x, p.y);
                break;
            }
            case 'q': { // quadratic curveto
                const p1 = transform(parseFloat(pathCommands[i++]), parseFloat(pathCommands[i++]));
                const p2 = transform(parseFloat(pathCommands[i++]), parseFloat(pathCommands[i++]));
                ctx.quadraticCurveTo(p2.x, p2.y, p1.x, p1.y);
                break;
            }
        }
    }
 
    const currentTheme = document.body.getAttribute('data-theme');
    ctx.fillStyle = (currentTheme === 'dark') ? '#ffffff' : '#2d2d2d';
    ctx.fill();
}
//----------------------------------------> END [CANVAS DRAWING]


export { init };