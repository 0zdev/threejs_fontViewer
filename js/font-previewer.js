/**
 * Project: Three.js JSON Font Editor
 * File: editor/js/font-previewer.js
 * Created: 2025-08-29
 * Author: @lewopxd
 *
 * Description:
 * A dedicated module to dynamically generate SVG previews of a font name
 * using the font's own glyph data.
 */

/**
 * Converts Three.js font path commands to a valid SVG path data string.
 * This version correctly reorders the points for the quadratic curve 'q' command.
 * @param {string} commands - The Three.js path commands ('m', 'l', 'q').
 * @returns {string} The SVG path data string.
 */
function toSVGPath(commands) {
    if (!commands) return '';
    
    const tokens = commands.split(' ');
    let pathData = '';
    let i = 0;

    while (i < tokens.length) {
        const command = tokens[i++];
        switch (command) {
            case 'm':
                pathData += `M ${tokens[i++]} ${tokens[i++]} `;
                break;
            case 'l':
                pathData += `L ${tokens[i++]} ${tokens[i++]} `;
                break;
            case 'q':
                // Three.js format provides: endPoint, then controlPoint
                const endPointX = tokens[i++];
                const endPointY = tokens[i++];
                const controlPointX = tokens[i++];
                const controlPointY = tokens[i++];
                // SVG standard requires: controlPoint, then endPoint
                pathData += `Q ${controlPointX} ${controlPointY} ${endPointX} ${endPointY} `;
                break;
        }
    }
    return pathData.trim();
}

 
 
 
 
 
/**
 * Main function to generate an SVG preview for a given text using a specific font.
 * This definitive version calculates a tight bounding box and uses a normalized
 * viewBox and transform to ensure perfect vertical alignment.
 */
function generatePreviewSVG({ fontData, text, color }) {
    const glyphs = fontData.glyphs || {};

    // --- 1. Validación de Caracteres ---
    let missingChars = 0;
    let isFirstCharMissing = !glyphs[text[0]];
    for (const char of text) {
        if (!glyphs[char]) {
            missingChars++;
        }
    }
    if (isFirstCharMissing || missingChars > 1) {
        return null;
    }

    // --- 2. CÁLCULO PRECISO DEL BOUNDING BOX DEL TEXTO ---
    let text_yMin = Infinity;
    let text_yMax = -Infinity;
    let currentX = 0;
    const renderList = [];

    for (const char of text) {
        const glyph = glyphs[char];
        if (glyph) {
            renderList.push({ path: toSVGPath(glyph.o), x: currentX });
            
            if (glyph.o) {
                const tokens = glyph.o.split(' ');
                let i = 0;
                while (i < tokens.length) {
                    const command = tokens[i++];
                    switch (command) {
                        case 'm':
                        case 'l':
                            i++; // Omitir coordenada X
                            const y = parseFloat(tokens[i++]);
                            if (y < text_yMin) text_yMin = y;
                            if (y > text_yMax) text_yMax = y;
                            break;
                        case 'q':
                            i++; // Omitir endPointX
                            const endPointY = parseFloat(tokens[i++]);
                            i++; // Omitir controlPointX
                            const controlPointY = parseFloat(tokens[i++]);

                            if (endPointY < text_yMin) text_yMin = endPointY;
                            if (endPointY > text_yMax) text_yMax = endPointY;
                            if (controlPointY < text_yMin) text_yMin = controlPointY;
                            if (controlPointY > text_yMax) text_yMax = controlPointY;
                            break;
                    }
                }
            }
            currentX += glyph.ha;
        } else {
            currentX += fontData.resolution / 3;
        }
    }
    
    if (text_yMin === Infinity) {
        text_yMin = fontData.boundingBox.yMin || 0;
        text_yMax = fontData.boundingBox.yMax || 0;
    }
    
    const totalWidthInFontUnits = currentX;
    const totalHeightInFontUnits = text_yMax - text_yMin;

    if (totalWidthInFontUnits === 0 || totalHeightInFontUnits === 0) return null;

    // --- 3. Construcción del SVG Corregida ---
    const paths = renderList.map(item =>
        `<path transform="translate(${item.x}, 0)" d="${item.path}"></path>`
    ).join('');
    
    // **LA CORRECCIÓN**: Normalizamos el viewBox para que empiece en (0,0)
    const viewBox = `0 0 ${totalWidthInFontUnits} ${totalHeightInFontUnits}`;
    
    // **LA CORRECCIÓN**: La transformación ahora alinea el dibujo dentro de este nuevo viewBox (0,0)
    const transform = `translate(0, ${text_yMax}) scale(1, -1)`;

    const svgString = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="${color}">
            <g transform="${transform}">
                ${paths}
            </g>
        </svg>
    `;

    return svgString;
}
export { generatePreviewSVG };