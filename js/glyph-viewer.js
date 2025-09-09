/**
 * Project: Three.js JSON Font Editor
 * File: editor/js/glyph-viewer.js
 * Created: 2025-08-29
 * Author: @lewopxd
 *
 * Description:
 * Advanced virtualized grid renderer for font glyphs, supporting
 * variable height items and collapsible sections.
 */

// --- CONSTANTES DE DISEÑO ---
const GLYPH_CARD_WIDTH = 80;
const GLYPH_CARD_HEIGHT = 80;
const GLYPH_CARD_GAP = 12;
const SECTION_HEADER_HEIGHT = 30;
const BUFFER_ROWS = 3; // Filas de buffer para renderizado suave

// --- ESTADO DEL MÓDULO ---
let glyphViewerState = {
    // Nodos del DOM
    nodes: {},
    // Datos de la fuente y estado de la UI
    fontData: null,
    glyphMap: null,
    isSortActive: false,
    // Callbacks
    onGlyphClick: () => {},
    onCategoryToggle: () => {},
    // Lista plana de todos los elementos a mostrar (headers y glifos)
    displayList: [],
    // Mapa de posiciones pre-calculadas para la virtualización
    layoutMap: {
        items: [],
        totalHeight: 0,
        itemsPerRow: 1
    }
};

// --- LÓGICA PRINCIPAL ---

/**
 * Punto de entrada principal para renderizar la cuadrícula de glifos.
 */
function render(fontData, glyphMap, isSortActive, onGlyphClick, onCategoryToggle) {
    // 1. Inicializar estado y nodos del DOM
    glyphViewerState.nodes.container = document.getElementById('glyphGridsContainer');
    if (!glyphViewerState.nodes.container || !fontData) return;

    glyphViewerState.nodes.sizer = document.getElementById('glyphSizer');
    glyphViewerState.nodes.poolContainer = document.getElementById('glyphPoolContainer');
    
    // Almacenar datos y callbacks
    glyphViewerState.fontData = fontData;
    glyphViewerState.glyphMap = glyphMap;
    glyphViewerState.isSortActive = isSortActive;
    glyphViewerState.onGlyphClick = onGlyphClick;
    glyphViewerState.onCategoryToggle = onCategoryToggle;

    try {
        // 2. Construir la lista de visualización a partir de los datos jerárquicos
        buildDisplayList();
        
        // 3. Calcular el layout (posiciones y altura total)
        calculateLayout();

        // 4. Asignar el evento de scroll y renderizar la vista inicial
        glyphViewerState.nodes.container.onscroll = updateVisiblePool;
        updateVisiblePool();
    } catch (error) {
        console.error("Error preparing glyph viewer data:", error);
        document.getElementById('glyphCount').textContent = `Error loading glyphs`;
    }
}

/**
 * Construye una lista plana (displayList) a partir del glyphMap jerárquico.
 * Esta lista contiene tanto objetos de encabezado como de glifos.
 */
function buildDisplayList() {
    const { glyphMap, isSortActive, fontData } = glyphViewerState;
    const glyphs = fontData.glyphs || {};
    glyphViewerState.displayList = [];

    let keysToShow = [];
    if (isSortActive && glyphMap && glyphMap.categorizedOrder) {
        // Modo Ordenado: Recorrer las categorías
        glyphMap.categorizedOrder.forEach(category => {
            glyphViewerState.displayList.push({
                isHeader: true,
                name: category.name,
                isCollapsed: category.isCollapsed,
                count: category.keys.length
            });
            if (!category.isCollapsed) {
                category.keys.forEach(key => {
                    glyphViewerState.displayList.push({ isHeader: false, char: key, data: glyphs[key] });
                });
            }
        });
    } else {
        // Modo Original: Simplemente añadir todos los glifos
        keysToShow = (glyphMap && glyphMap.originalOrder) ? glyphMap.originalOrder : Object.keys(glyphs);
        keysToShow.forEach(key => {
            glyphViewerState.displayList.push({ isHeader: false, char: key, data: glyphs[key] });
        });
    }
    document.getElementById('glyphCount').textContent = `${Object.keys(glyphs).length} Glyphs`;
}

/**
 * Pre-calcula la altura total y la posición 'top' de cada fila en la cuadrícula.
 */
function calculateLayout() {
    const { nodes, displayList } = glyphViewerState;
    if (!nodes.container) return;
    const containerWidth = nodes.container.clientWidth;
    
    const itemsPerRow = Math.max(1, Math.floor(containerWidth / (GLYPH_CARD_WIDTH + GLYPH_CARD_GAP)));
    const rowHeight = GLYPH_CARD_HEIGHT + GLYPH_CARD_GAP;
    
    const totalContentWidth = (itemsPerRow * (GLYPH_CARD_WIDTH + GLYPH_CARD_GAP)) - GLYPH_CARD_GAP;
    const horizontalOffset = Math.max(GLYPH_CARD_GAP / 2, (containerWidth - totalContentWidth) / 2);

    let totalHeight = 0;
    const layoutItems = [];
    let glyphsInCurrentRow = 0;

    displayList.forEach((item, index) => {
        if (item.isHeader) {
            if (glyphsInCurrentRow > 0) {
                totalHeight += rowHeight;
                glyphsInCurrentRow = 0;
            }
            layoutItems.push({ top: totalHeight, height: SECTION_HEADER_HEIGHT, index: index });
            totalHeight += SECTION_HEADER_HEIGHT;
        } else {
            if (glyphsInCurrentRow === 0) {
                layoutItems.push({ top: totalHeight, height: rowHeight, index: index });
            }
            glyphsInCurrentRow++;
            if (glyphsInCurrentRow === itemsPerRow) {
                totalHeight += rowHeight;
                glyphsInCurrentRow = 0;
            }
        }
    });

    if (glyphsInCurrentRow > 0) {
        totalHeight += rowHeight;
    }

    glyphViewerState.layoutMap = {
        items: layoutItems,
        totalHeight: totalHeight,
        itemsPerRow: itemsPerRow,
        horizontalOffset: horizontalOffset
    };

    nodes.sizer.style.height = `${totalHeight}px`;
}

/**
 * Se ejecuta en cada evento de scroll. Determina qué elementos son visibles y llama a renderPool.
 */
function updateVisiblePool() {
    const { nodes, layoutMap } = glyphViewerState;
    if(!nodes.container) return;
    const scrollTop = nodes.container.scrollTop;
    
    let firstVisibleIndex = 0;
    for (let i = 0; i < layoutMap.items.length; i++) {
        if (layoutMap.items[i].top + layoutMap.items[i].height >= scrollTop) {
            firstVisibleIndex = i;
            break;
        }
    }

    firstVisibleIndex = Math.max(0, firstVisibleIndex - BUFFER_ROWS);
    renderPool(firstVisibleIndex);
}

/**
 * Renderiza en el DOM solo los elementos (encabezados y glifos) que están en el área visible.
 */
function renderPool(firstItemIndex) {
    const { nodes, displayList, layoutMap, fontData, onGlyphClick, onCategoryToggle } = glyphViewerState;
    nodes.poolContainer.innerHTML = '';
    
    const scrollTop = nodes.container.scrollTop;
    const containerHeight = nodes.container.clientHeight;

    let currentItem = layoutMap.items[firstItemIndex];
    let currentIndexInLayout = firstItemIndex;

    while (currentItem && currentItem.top < scrollTop + containerHeight + (BUFFER_ROWS * GLYPH_CARD_HEIGHT)) {
        const displayItem = displayList[currentItem.index];
        if(!displayItem) {
             currentIndexInLayout++;
             currentItem = layoutMap.items[currentIndexInLayout];
             continue;
        }

        if (displayItem.isHeader) {
            const header = document.createElement('div');
            header.className = `glyph-section-header ${displayItem.isCollapsed ? 'is-collapsed' : ''}`;
            header.style.top = `${currentItem.top}px`;
            header.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none"><path d="m6 9 6 6 6-6"></path></svg>
                <span>${displayItem.name} (${displayItem.count})</span>
            `;
            
            // **LA CORRECCIÓN CLAVE ESTÁ AQUÍ**
            // Se añade una comprobación para asegurar que onCategoryToggle es una función antes de asignarla.
            if (typeof onCategoryToggle === 'function') {
                header.onclick = () => onCategoryToggle(displayItem.name);
            }
            nodes.poolContainer.appendChild(header);

        } else {
            const rowIndex = currentItem.index;
            for (let j = 0; j < layoutMap.itemsPerRow; j++) {
                const dataIndex = rowIndex + j;
                if (dataIndex >= displayList.length || displayList[dataIndex].isHeader) break;
                
                const itemData = displayList[dataIndex];
                const card = document.createElement('div');
                card.className = 'glyph-card';
                card.style.top = `${currentItem.top}px`;
                card.style.left = `${layoutMap.horizontalOffset + (j * (GLYPH_CARD_WIDTH + GLYPH_CARD_GAP))}px`;

                const canvas = document.createElement('canvas');
                canvas.width = 64;
                canvas.height = 64;
                const charSpan = document.createElement('span');
                charSpan.className = 'glyph-char';
                charSpan.textContent = itemData.char;

                card.appendChild(canvas);
                card.appendChild(charSpan);
                if (typeof onGlyphClick === 'function') {
                    card.onclick = () => onGlyphClick(itemData.char);
                }
                nodes.poolContainer.appendChild(card);
                drawGlyphOnCanvas(canvas, itemData.data, fontData.boundingBox);
            }
        }
        
        currentIndexInLayout++;
        currentItem = layoutMap.items[currentIndexInLayout];
    }
}

/**
 * Función pública llamada cuando el panel es redimensionado.
 */
function measureAndRender() {
    if (!glyphViewerState.nodes.container) return;
    calculateLayout();
    updateVisiblePool();
}

/**
 * Dibuja un solo glifo en un canvas 2D. (Sin cambios)
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
            case 'm': { const p = transform(parseFloat(pathCommands[i++]), parseFloat(pathCommands[i++])); ctx.moveTo(p.x, p.y); break; }
            case 'l': { const p = transform(parseFloat(pathCommands[i++]), parseFloat(pathCommands[i++])); ctx.lineTo(p.x, p.y); break; }
            case 'q': { const p1 = transform(parseFloat(pathCommands[i++]), parseFloat(pathCommands[i++])); const p2 = transform(parseFloat(pathCommands[i++]), parseFloat(pathCommands[i++])); ctx.quadraticCurveTo(p2.x, p2.y, p1.x, p1.y); break; }
        }
    }
    const currentTheme = document.body.getAttribute('data-theme');
    ctx.fillStyle = (currentTheme === 'dark') ? '#ffffff' : '#2d2d2d';
    ctx.fill();
}

export { render, measureAndRender };