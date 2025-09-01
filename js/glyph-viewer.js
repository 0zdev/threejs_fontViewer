/**
 * Project: Three.js JSON Font Editor
 * File: editor/js/glyph-viewer.js
 * Created: 2025-08-29
 * Author: @lewopxd
 *
 */

const BUFFER_ROWS = 3;
const GLYPH_CARD_GAP = 12;

let glyphViewerState = {
    nodes: {},
    pool: [],
    data: [],
    onGlyphClick: () => {}
};

/**
 * Main and only public function. Renders the entire glyph grid.
 * @param {object} fontData - The font data object from the AppState.
 * @param {function} onGlyphClick - Callback function for when a glyph is clicked.
 */
function render(fontData, onGlyphClick) {
    glyphViewerState.nodes.container = document.getElementById('glyphGridsContainer');
    if (!glyphViewerState.nodes.container || !fontData) {
        return;
    }

    glyphViewerState.nodes.sizer = document.getElementById('glyphSizer');
    glyphViewerState.nodes.poolContainer = document.getElementById('glyphPoolContainer');
    glyphViewerState.onGlyphClick = onGlyphClick;

    try {
        const glyphs = fontData.glyphs || {};
        glyphViewerState.data = Object.keys(glyphs).map(char => ({
            char: char,
            data: glyphs[char],
            fontBoundingBox: fontData.boundingBox
        }));

        document.getElementById('glyphCount').textContent = `${glyphViewerState.data.length} Glyphs`;

        glyphViewerState.nodes.container.onscroll = null;
        measureAndRender();
        glyphViewerState.nodes.container.onscroll = measureAndRender;
    } catch (error) {
        console.error("Error preparing glyph viewer data:", error);
        document.getElementById('glyphCount').textContent = `Error loading glyphs`;
    }
}

/**
 * Calculates grid metrics and triggers the drawing of visible glyphs.
 */
function measureAndRender() {
    const { nodes, data } = glyphViewerState;
    if (!nodes.container) return;

    const metrics = {};
    metrics.itemWidth = 80;
    metrics.itemHeight = 80;
    const containerWidth = nodes.container.clientWidth;

    metrics.itemsPerRow = Math.max(1, Math.floor((containerWidth - 2 * GLYPH_CARD_GAP) / (metrics.itemWidth + GLYPH_CARD_GAP)));
    metrics.rowHeight = metrics.itemHeight + GLYPH_CARD_GAP;

    const totalRows = Math.ceil(data.length / metrics.itemsPerRow);
    nodes.sizer.style.height = `${totalRows * metrics.rowHeight}px`;

    const scrollTop = nodes.container.scrollTop;
    const firstVisibleRow = Math.floor(scrollTop / metrics.rowHeight);
    const visibleRows = Math.ceil(nodes.container.clientHeight / metrics.rowHeight);

    const firstPoolRow = Math.max(0, firstVisibleRow - BUFFER_ROWS);
    const lastPoolRow = Math.min(totalRows, firstVisibleRow + visibleRows + BUFFER_ROWS);

    renderPool(firstPoolRow, lastPoolRow, metrics);
}

/**
 * Renders the pool of glyph cards for the visible and buffered rows.
 */
function renderPool(firstRow, lastRow, metrics) {
    const { nodes, data } = glyphViewerState;
    nodes.poolContainer.innerHTML = '';

    for (let i = firstRow; i < lastRow; i++) {
        for (let j = 0; j < metrics.itemsPerRow; j++) {
            const dataIndex = (i * metrics.itemsPerRow) + j;
            if (dataIndex >= data.length) break;

            const itemData = data[dataIndex];
            const card = document.createElement('div');
            card.className = 'glyph-card';
            card.style.position = 'absolute';
            card.style.top = `${i * metrics.rowHeight}px`;
            card.style.left = `${j * (metrics.itemWidth + GLYPH_CARD_GAP) + GLYPH_CARD_GAP}px`;

            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 64;
            const charSpan = document.createElement('span');
            charSpan.className = 'glyph-char';
            charSpan.textContent = itemData.char;

            card.appendChild(canvas);
            card.appendChild(charSpan);

            card.onclick = () => glyphViewerState.onGlyphClick(itemData.char);

            nodes.poolContainer.appendChild(card);

            requestAnimationFrame(() => {
                if (document.body.contains(canvas)) {
                    drawGlyphOnCanvas(canvas, itemData.data, itemData.fontBoundingBox);
                }
            });
        }
    }
}

/**
 * Draws a single glyph's outline onto a 2D canvas.
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
        const transform = (px, py) => ({ x: px * scale + offsetX, y: -py * scale + offsetY });

        switch (command) {
            case 'm':
                {
                    const p = transform(parseFloat(pathCommands[i++]), parseFloat(pathCommands[i++]));
                    ctx.moveTo(p.x, p.y);
                    break;
                }
            case 'l':
                {
                    const p = transform(parseFloat(pathCommands[i++]), parseFloat(pathCommands[i++]));
                    ctx.lineTo(p.x, p.y);
                    break;
                }
            case 'q':
                {
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


export { render };