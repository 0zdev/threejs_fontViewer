/**
 * Project: Three.js JSON Font Editor
 * File: editor/js/workers/glyph-sorter.js
 * Created: 2025-08-29
 * Author: @lewopxd
 *
 * Description:
 * A dedicated web worker to categorize and sort font glyph keys without
 * blocking the main UI thread. It returns a structured, categorized map.
 */

self.onmessage = function(e) {
    const { fontKey, glyphs } = e.data;
    if (!glyphs) {
        self.postMessage({ fontKey, error: 'No glyphs provided.' });
        return;
    }

    const originalOrder = Object.keys(glyphs);

    // Define character sets and their display names
    const sets = {
        uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        lowercase: "abcdefghijklmnopqrstuvwxyz",
        digits: "0123456789",
        punctuation: `.,;:!?-_"'()[]{}`,
        symbols: `@#$%^&*+=<>|/\\~`
    };
    const categoryDisplayNames = {
        uppercase: 'Uppercase A-Z',
        lowercase: 'Lowercase a-z',
        digits: 'Digits 0-9',
        punctuation: 'Punctuation',
        symbols: 'Common Symbols',
        other: 'Other Glyphs'
    };
    const categoryOrder = ['uppercase', 'lowercase', 'digits', 'punctuation', 'symbols', 'other'];

    const categorized = {
        uppercase: [],
        lowercase: [],
        digits: [],
        punctuation: [],
        symbols: [],
        other: []
    };

    // Categorize each glyph key
    for (const char of originalOrder) {
        let found = false;
        for (const category in sets) {
            if (sets[category].includes(char)) {
                categorized[category].push(char);
                found = true;
                break;
            }
        }
        if (!found) {
            categorized.other.push(char);
        }
    }

    // Build the hierarchical categorizedOrder array
    const categorizedOrder = [];
    for (const categoryKey of categoryOrder) {
        // Sort characters within each category alphabetically/numerically
        categorized[categoryKey].sort();

        // Only add the category if it contains glyphs
        if (categorized[categoryKey].length > 0) {
            categorizedOrder.push({
                name: categoryDisplayNames[categoryKey],
                keys: categorized[categoryKey]
            });
        }
    }

    const glyphMap = {
        originalOrder,
        categorizedOrder // This is now a hierarchical array of objects
    };

    self.postMessage({ fontKey, glyphMap });
};