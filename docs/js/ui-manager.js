/**
 * Project: Three.js JSON Font Editor
 * File: editor/js/ui-manager.js
 * Created: 2025-08-29
 * Author: @lewopxd
 *
 * Description:
 * Manages the initialization, events, and state-driven updates for all UI
 * components. This module is the single source of truth for DOM manipulation.
 */

import { initSmartTooltips, makeDraggable, setupModalResize, bringToFront, positionModal, formatBytes, formatLabelKey, linkify, truncateText, truncateUrl } from './utils.js';
//-------------------------------------------------------------
//--------------------[   MODULE STATE   ]---------------------
//-------------------------------------------------------------

let colorPicker = null;
let fontListHideTimeout;
let previewCache = {};
let intersectionObserver = null;

// Callbacks and dependencies injected from main.js
let dependencies = {
    stateManager: null,
    onThemeChange: () => {},
    onTabSwitch: () => {},
    onResizeEnd: () => {},
    onColorChange: () => {},
    onMaterialSelect: () => {},
    fontPreviewer: null,
    glyphViewer: null
};

//----------------------------------------> END [MODULE STATE]


//-------------------------------------------------------------
//--------------------[   INITIALIZATION   ]-------------------
//-------------------------------------------------------------

/**
 * Initializes all UI components and sets up event listeners.
 * @param {object} callbacks - An object containing callback functions and module dependencies.
 */
function initUIManager(callbacks) {
    dependencies.stateManager = callbacks.stateManager;
    dependencies.onThemeChange = callbacks.onThemeChange || (() => {});
    dependencies.onTabSwitch = callbacks.onTabSwitch || (() => {});
    dependencies.onResizeEnd = callbacks.onResizeEnd || (() => {});
    dependencies.onColorChange = callbacks.onColorChange || (() => {});
    dependencies.onMaterialSelect = callbacks.onMaterialSelect || (() => {});
    dependencies.fontPreviewer = callbacks.fontPreviewer;
    dependencies.glyphViewer = callbacks.glyphViewer;
    dependencies.onCopyFontUrl = callbacks.onCopyFontUrl || (() => {});
    dependencies.onDeleteUserFont = callbacks.onDeleteUserFont || (() => {});
    dependencies.utils = callbacks.utils || {};  
    initColorPicker(dependencies.onColorChange);
    populateMaterialModal(dependencies.onMaterialSelect);
    initSmartTooltips();
    initDraggableModals();
    initUIEventListeners();
    _initFontListListener(); 
     setupResizers();
}

/**
 * Sets up a single, delegated event listener for the font list container.
 * This handles clicks on list items, copy buttons, and delete buttons efficiently.
 */
function _initFontListListener() {
    const list = document.getElementById('fontList');
    if (!list) return;

    list.addEventListener('click', (e) => {
        const li = e.target.closest('li[data-font-key]');
        if (!li) return;

        const fontId = li.dataset.fontKey;
        const copyBtn = e.target.closest('.font-action-copy');
        const deleteBtn = e.target.closest('.font-action-delete');

        if (copyBtn) {
            // Handle copy action
            dependencies.onCopyFontUrl(e, copyBtn.dataset.url);
        } else if (deleteBtn) {
            // Handle delete action
            dependencies.onDeleteUserFont(e, deleteBtn.dataset.fontId);
        } else {
            // Handle font selection
            dependencies.stateManager.selectFont(fontId);
        }
    });
}

/**
 * [MODIFIED] Sets up the resizable functionality for the main editor/viewer panels
 * and the console window. Now includes throttled live-rendering for the glyph viewer
 * during panel resize.
 */
function setupResizers() {
    const container = document.querySelector('.container');
    const resizer = document.getElementById('resizer');
    const editorPanel = document.querySelector('.editor-panel');
    const viewerIframe = document.getElementById('viewer-iframe');
    const fontSelectorModal = document.getElementById('fontSelectorModal');
    const subheader = document.getElementById('subheader');
    let isResizing = false;

    // --- Throttling variables for live glyph rendering ---
    let throttleTimeout = null;
    const throttleDelay = 50; // ms, limits rendering to max 20fps

    const startResize = (e) => {
        isResizing = true;
        if (viewerIframe) viewerIframe.style.pointerEvents = 'none';
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'ew-resize';
        document.addEventListener('mousemove', handleResize);
        window.addEventListener('mouseup', stopResize);
    };

    const handleResize = (e) => {
        if (!isResizing) return;

        const containerRect = container.getBoundingClientRect();
        const sidebarWidth = document.querySelector('.sidebar').offsetWidth;
        const newLeftWidth = e.clientX - containerRect.left - sidebarWidth;
        const minWidth = 150;

        if (newLeftWidth > minWidth && containerRect.width - newLeftWidth > minWidth) {
            editorPanel.style.width = `${newLeftWidth}px`;
            if (fontSelectorModal.classList.contains('show')) {
                fontSelectorModal.style.width = `${subheader.clientWidth}px`;
            }
        }
        
        // [NEW LOGIC] Live-render glyphs if the tab is active, using throttling.
        if (!throttleTimeout) {
            throttleTimeout = setTimeout(() => {
                throttleTimeout = null; // Clear the timeout ID
                if (document.getElementById('glyphs-view')?.classList.contains('active')) {
                    dependencies.glyphViewer.measureAndRender();
                }
            }, throttleDelay);
        }
    };

    const stopResize = () => {
        if (!isResizing) return;
        isResizing = false;

        // Clear any pending throttled render to avoid a final delayed execution
        clearTimeout(throttleTimeout);
        throttleTimeout = null;

        if (viewerIframe) viewerIframe.style.pointerEvents = 'auto';
        document.body.style.userSelect = 'auto';
        document.body.style.cursor = 'default';
        document.removeEventListener('mousemove', handleResize);
        window.removeEventListener('mouseup', stopResize);
        dependencies.onResizeEnd(); // This will trigger a final, precise render
    };
    
    if (resizer) {
        resizer.addEventListener('mousedown', startResize);
    }

    // Console resizer logic remains unchanged
    const consoleResizer = document.getElementById('consoleResizer');
    const consoleWindow = document.getElementById('consoleWindow');
    let isConsoleResizing = false;
    const startConsoleResize = (e) => {
        isConsoleResizing = true;
        if (viewerIframe) viewerIframe.style.pointerEvents = 'none';
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', handleConsoleResize);
        window.addEventListener('mouseup', stopConsoleResize);
    };
    const handleConsoleResize = (e) => {
        if (!isConsoleResizing) return;
        const newHeight = window.innerHeight - e.clientY;
        if (newHeight > 100 && newHeight < window.innerHeight - 100) {
            consoleWindow.style.height = `${newHeight}px`;
        }
    };
    const stopConsoleResize = () => {
        if (!isConsoleResizing) return;
        isConsoleResizing = false;
        if (viewerIframe) viewerIframe.style.pointerEvents = 'auto';
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
        document.removeEventListener('mousemove', handleConsoleResize);
        window.removeEventListener('mouseup', stopConsoleResize);
    };
    if (consoleResizer) {
        consoleResizer.addEventListener('mousedown', startConsoleResize);
    }
}
/**
 * Makes modal elements draggable by their header.
 * @returns {void}
 */
function initDraggableModals() {
    makeDraggable(document.getElementById('versionModal'));
    makeDraggable(document.getElementById('colorPickerModal'));
    makeDraggable(document.getElementById('materialModal'));
    makeDraggable(document.getElementById('urlModal'));
    makeDraggable(document.getElementById('infoModal'));  
}

/**
 * Initializes general UI event listeners for the application.
  */
function initUIEventListeners() {
    // General click listener for collapsible sections and view-more links
    document.addEventListener('click', function(e) {
        const header = e.target.closest('.info-section-header');
        if (header) {
            header.closest('.info-section-collapsible').classList.toggle('expanded');
            return;
        }
        if (e.target.matches('.view-more-link, .show-less-link')) {
            e.preventDefault();
            const parent = e.target.parentElement;
            const sibling = parent.style.display === 'none' ? parent.previousElementSibling : parent.nextElementSibling;
            if (sibling) {
                parent.style.display = 'none';
                sibling.style.display = 'inline';
            }
        }
    });

    // Font list hide-on-mouseleave logic
    const fontSelectorModal = document.getElementById('fontSelectorModal');
    const subheader = document.getElementById('subheader');
    fontSelectorModal.addEventListener('mouseleave', () => {
        fontListHideTimeout = setTimeout(() => {
            if (fontSelectorModal.classList.contains('show')) {
                toggleFontList();
            }
        }, 300);
    });
    fontSelectorModal.addEventListener('mouseenter', () => clearTimeout(fontListHideTimeout));
    subheader.addEventListener('mouseenter', () => clearTimeout(fontListHideTimeout));

    // Window resize handler for font list
    window.addEventListener('resize', () => {
        if (fontSelectorModal.classList.contains('show')) {
            const subheaderRect = subheader.getBoundingClientRect();
            fontSelectorModal.style.left = `${subheaderRect.left}px`;
            fontSelectorModal.style.top = `${subheaderRect.bottom}px`;
            fontSelectorModal.style.width = `${subheaderRect.width}px`;
        }
    });

     // Programmatically add event listeners for the info modal
    const infoModalOverlay = document.getElementById('info-modal-overlay');
    const infoModalCloseBtn = document.getElementById('info-modal-close-btn');
    const infoModalOkBtn = document.getElementById('info-modal-ok-btn');

    if (infoModalOverlay) infoModalOverlay.addEventListener('click', dependencies.utils.hideInfoModal);
     if (infoModalOkBtn) infoModalOkBtn.addEventListener('click', dependencies.utils.hideInfoModal);
 }
//----------------------------------------> END [INITIALIZATION]


//-------------------------------------------------------------
//-------------------[   CENTRAL UI UPDATER   ]----------------
//-------------------------------------------------------------

/**
 * The main intelligent UI update function. It orchestrates all DOM changes
 * based on a given application state event.
 * @param {string} state - The event triggering the update (e.g., 'fontSelected', 'themeChanged').
 * @param {object} payload - Data needed for the update, typically the AppState.
 */
function updateUI(state, payload) {
    const appState = payload?.appState;
    if (!appState) {
        console.warn("updateUI called without an appState in payload.");
        return;
    }
    const activeFont = appState.inAppFonts[appState.currentFontID];
    const color = _getCurrentPreviewColor();

    _initButtonStates(appState.viewerState, appState.isEditing, !appState.isEditing);

    switch (state) {
        case 'initialLoad':
        case 'fontAdded':
        case 'fontSaved':
            _repaintFontList(appState.inAppFonts, appState.currentFontID, color);
            if (activeFont) {
                _updateSubheader(activeFont);
                _renderInfoView(activeFont);
                _updateMainFontPreview(activeFont, color);
            }
            break;

        case 'fontSelected':
            _setActiveFontItem(appState.currentFontID);
            if (activeFont) {
                _updateSubheader(activeFont);
                _renderInfoView(activeFont);
                _updateMainFontPreview(activeFont, color);
            }
            break;

        case 'fontRemoved':
            _removeFontListItem(payload.removedFontID);
            // After removing, we might need to update the active item if it changed.
            _setActiveFontItem(appState.currentFontID);
            if(activeFont) {
                _updateSubheader(activeFont);
            }
            break;

        case 'themeChanged':
            _refreshPreviews(color, appState.inAppFonts, appState.currentFontID);
            if (activeFont) {
                _updateMainFontPreview(activeFont, color);
            }
            dependencies.glyphViewer.measureAndRender();
            break;
    }
}

/**
 * Removes a single font list item from the DOM without repainting the entire list.
 * @param {string} fontID - The ID of the font item to remove.
 */
function _removeFontListItem(fontID) {
    const list = document.getElementById('fontList');
    if (!list) return;

    const itemToRemove = list.querySelector(`li[data-font-key="${fontID}"]`);
    if (itemToRemove) {
        itemToRemove.remove();
    }
}
//----------------------------------------> END [CENTRAL UI UPDATER]


//-------------------------------------------------------------
//----------------[   INTERNAL RENDER HELPERS   ]--------------
//-------------------------------------------------------------

/**
 * Repaints the entire font list in the UI, including lazy-loading for previews.
 * @param {object} allFonts - The complete map of font objects in the application state.
 * @param {string} activeFontID - The ID of the currently selected font.
 * @param {string} color - The current preview color for the font SVGs.
 * @private
 */
function _repaintFontList(allFonts, activeFontID, color) {
    const list = document.getElementById('fontList');
    list.innerHTML = '';

    if (intersectionObserver) {
        intersectionObserver.disconnect();
    }

    // Conditional logic to add the official fonts separator
    const hasOfficialFonts = Object.keys(allFonts).some(key => !key.startsWith('user_'));
    if (hasOfficialFonts) {
        const separator = document.createElement('div');
        separator.className = 'font-list-separator';
        separator.innerHTML = '<span>--- official threejs examples ---</span>';
        list.appendChild(separator);
    }

    intersectionObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const li = entry.target;
                const fontKey = li.dataset.fontKey;
                const font = allFonts[fontKey];
                const previewContainer = li.querySelector('.font-preview-container');
                observer.unobserve(li);

                if (!font || !previewContainer) return;

                if (previewCache[fontKey] && previewCache[fontKey] !== 'error') {
                    previewContainer.innerHTML = `<img src="${previewCache[fontKey]}" />`;
                    return;
                }

                const svgString = dependencies.fontPreviewer.generatePreviewSVG({
                    fontData: font.data, text: font.fontName.split(' ')[0], color: color
                });

                if (svgString) {
                    const encodedSVG = btoa(svgString);
                    const dataUri = `data:image/svg+xml;base64,${encodedSVG}`;
                    previewCache[fontKey] = dataUri;
                    previewContainer.innerHTML = `<img src="${dataUri}" />`;
                } else {
                    previewCache[fontKey] = 'error';
                }
            }
        });
    }, { rootMargin: '200px 0px' });

    const createLi = (key, font) => {
        const li = document.createElement('li');
        li.dataset.fontKey = key;
        const isUserFont = key.startsWith('user_');
        const iconSVG = font.url && !font.isFallback ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.72"></path></svg>` : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;

        let actionsHTML = '';
        if (font.isFallback) {
            const tooltipText = `Using local font file.\n\nThe original source isn't available at: \n${font.url}`;
            actionsHTML = `<div class="font-action-info" data-tooltip="${tooltipText}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg></div>`;
        } else if (isUserFont) {
            actionsHTML = `<div class="font-action-delete" data-font-id="${key}" data-tooltip="Delete Font"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></div>`;
        } else if (font.url) {
            actionsHTML = `<div class="font-action-copy" data-url="${font.url}" data-tooltip="Copy URL"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></div>`;
        }

        const truncatedUrl = truncateUrl(font.url);

        li.innerHTML = `
            <div class="font-item-icon">${iconSVG}</div>
            <div class="font-item-type">(${font.type.toUpperCase()})</div>
            <div class="font-item-name" title="${font.fontName}">${font.fontName}</div>
            <div class="font-preview-container"></div>
            <div class="font-item-url" title="${font.url || ''}">${truncatedUrl}</div>
            <div class="font-item-actions">${actionsHTML}</div>`;

        if (key === activeFontID) li.classList.add('active');
        return li;
    };

    const sortedKeys = Object.keys(allFonts).sort((a, b) => {
        const aIsUser = a.startsWith('user_');
        const bIsUser = b.startsWith('user_');
        if (aIsUser && !bIsUser) return 1;
        if (!aIsUser && bIsUser) return -1;
        return a.localeCompare(b);
    });

    let hasAddedUserSeparator = false;
    for (const key of sortedKeys) {
        if (key.startsWith('user_') && !hasAddedUserSeparator) {
            const separator = document.createElement('div');
            separator.className = 'font-list-separator';
            separator.innerHTML = '<span>--- loaded fonts ---</span>';
            list.appendChild(separator);
            hasAddedUserSeparator = true;
        }
        const li = createLi(key, allFonts[key]);
        list.appendChild(li);
        intersectionObserver.observe(li);
    }

    initSmartTooltips();
}

function _setActiveFontItem(fontID) {
    const list = document.getElementById('fontList');
    if (!list) return;

    const currentActive = list.querySelector('li.active');
    if (currentActive) {
        currentActive.classList.remove('active');
    }

    const newActive = list.querySelector(`li[data-font-key="${fontID}"]`);
    if (newActive) {
        newActive.classList.add('active');
    }
}

function _updateSubheader(fontObject) {
    const fileInfoSpan = document.getElementById('fileInfo');
    if (fontObject.type === 'ttf') {
        fileInfoSpan.innerHTML = `<span class="subheader-format">(TTF)</span> <span>${fontObject.fontName}</span> <span style="margin: 0 4px; color: var(--color-text-light);">></span> <span>.json</span>`;
    } else {
        fileInfoSpan.innerHTML = `<span class="subheader-format">(JSON)</span> <span>${fontObject.fontName}</span>`;
    }
    _updateFontFileInfo(fontObject.data);
}

function _updateFontFileInfo(fontData) {
    const detailsSpan = document.getElementById('fontDetails');
    try {
        const fontJsonString = JSON.stringify(fontData);
        const sizeInBytes = new Blob([fontJsonString]).size;
        const charCount = Object.keys(fontData.glyphs || {}).length;
        detailsSpan.textContent = `${formatBytes(sizeInBytes)}, ${charCount} chars`;
    } catch (e) {
        detailsSpan.textContent = '';
    }
}

function _renderInfoView(fontObject) {
    if (!fontObject || !document.getElementById('info-view').classList.contains('active')) return;
    
    const techList = document.getElementById('tech-details-list');
    const metadataList = document.getElementById('metadata-list');
    const metadataFallback = document.getElementById('metadata-fallback');

    techList.innerHTML = '';
    metadataList.innerHTML = '';
    metadataFallback.style.display = 'none';

    try {
        const fontJsonString = JSON.stringify(fontObject.data);
        const fileSize = new Blob([fontJsonString]).size;
        const glyphCount = Object.keys(fontObject.data.glyphs || {}).length;

        const techData = {
            'File Name': fontObject.name,
            'File Type': `${fontObject.type.toUpperCase()}`,
            'File Size': formatBytes(fileSize),
            'Glyph Count': glyphCount.toLocaleString(),
        };

        for (const key in techData) {
            techList.innerHTML += `<dt>${key}</dt><dd>${techData[key]}</dd>`;
        }

        const metadata = fontObject.data.original_font_information;
        if (metadata && Object.keys(metadata).length > 0) {
            metadataList.style.display = '';
            metadataFallback.style.display = 'none';
            for (const key in metadata) {
                let value = metadata[key].en || metadata[key];
                if (value) {
                    const finalValue = truncateText(linkify(value));
                    metadataList.innerHTML += `<dt title="${key}">${formatLabelKey(key)}</dt><dd>${finalValue}</dd>`;
                }
            }
        } else {
            metadataList.style.display = 'none';
            metadataFallback.style.display = 'block';
        }
        initSmartTooltips();
    } catch (error) {
        console.error("Failed to render font info:", error);
    }
}

function _updateMainFontPreview(font, color) {
    const previewContainer = document.getElementById('fontPreviewContainer');
    if (!font || !previewContainer) {
        if (previewContainer) previewContainer.innerHTML = '';
        return;
    }

    const svgString = dependencies.fontPreviewer.generatePreviewSVG({
        fontData: font.data,
        text: font.fontName,
        color: color
    });

    if (svgString) {
        const encodedSVG = btoa(svgString);
        previewContainer.innerHTML = `<img src="data:image/svg+xml;base64,${encodedSVG}" alt="${font.fontName}" />`;
        previewContainer.setAttribute('title', font.fontName);
    } else {
        previewContainer.innerHTML = '';
        previewContainer.setAttribute('title', `${font.fontName} (Preview not available)`);
    }
}

function _refreshPreviews(newColor, allFonts, activeFontID) {
    previewCache = {};
    _repaintFontList(allFonts, activeFontID, newColor);
}

function _getCurrentPreviewColor() {
    return window.getComputedStyle(document.body).getPropertyValue('--color-text-preview').trim();
}


/**
 * [NEW] Updates the visual selection in the material modal UI.
 * @param {string} materialName - The name of the material to set as active.
 */
function updateActiveMaterial(materialName) {
    const list = document.getElementById('materialList');
    if (!list) return;

    // Remove 'active' class from any currently active item
    const currentActive = list.querySelector('li.active');
    if (currentActive) {
        currentActive.classList.remove('active');
    }

    // Find and activate the new item
    const items = list.querySelectorAll('li');
    for (const item of items) {
        if (item.textContent === materialName) {
            item.classList.add('active');
            break;
        }
    }
}

//----------------------------------------> END [INTERNAL RENDER HELPERS]


//-------------------------------------------------------------
//----------------[   THEME & GENERAL UI STATE   ]-------------
//-------------------------------------------------------------

function toggleTheme(editor) {
    const body = document.body;
    const newTheme = body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    body.setAttribute('data-theme', newTheme);
    editor.setOption('theme', newTheme === 'dark' ? 'material-darker' : 'default');
    
    dependencies.onThemeChange(newTheme);
}

function _initButtonStates(viewerState, isEditing, isEditorReadOnly) {
    document.getElementById('panBtn').classList.toggle('active', viewerState.panEnabled);
    document.getElementById('zoomBtn').classList.toggle('active', viewerState.zoomEnabled);
    document.getElementById('modeBtn').classList.toggle('active', viewerState.is3D);
    document.getElementById('gridBtn').classList.toggle('active', viewerState.gridVisible);
    document.getElementById('playPauseBtn').classList.toggle('active', viewerState.rotationEnabled);
    document.getElementById('rotateObjBtn').classList.toggle('active', viewerState.rotateObjectEnabled);
    document.getElementById('moveObjBtn').classList.toggle('active', viewerState.moveObjectEnabled);
    document.getElementById('rotateCamBtn').classList.toggle('active', viewerState.rotateCameraEnabled);
    
    document.getElementById('wireframeModeBtn')?.classList.toggle('active', viewerState.isWireframeModeActive);
    document.getElementById('boundingBoxBtn')?.classList.toggle('active', viewerState.isBoundingBoxVisible);

    document.getElementById('playIcon').style.display = viewerState.rotationEnabled ? 'none' : 'block';
    document.getElementById('pauseIcon').style.display = viewerState.rotationEnabled ? 'block' : 'none';

    const editBtn = document.getElementById('editBtn');
    const saveBtn = document.getElementById('saveChangesBtn');
    const discardBtn = document.getElementById('discardChangesBtn');

    if (editBtn && saveBtn && discardBtn) {
        editBtn.style.display = isEditorReadOnly ? 'flex' : 'none';
        saveBtn.style.display = isEditorReadOnly ? 'none' : 'flex';
        discardBtn.style.display = isEditorReadOnly ? 'none' : 'flex';
    }
}
//----------------------------------------> END [THEME & GENERAL UI STATE]


//-------------------------------------------------------------
//-----------------[   TAB & VIEW MANAGEMENT   ]---------------
//-------------------------------------------------------------

function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(button => button.classList.remove('active'));

    document.getElementById(tabName + '-view')?.classList.add('active');
    document.querySelector(`.tab-btn[onclick="showTab('${tabName}')"]`)?.classList.add('active');

    dependencies.onTabSwitch(tabName);
}
//----------------------------------------> END [TAB & VIEW MANAGEMENT]


//-------------------------------------------------------------
//--------------[   MODAL & POPOVER MANAGEMENT   ]-------------
//-------------------------------------------------------------

function toggleFontList() {
    const modal = document.getElementById('fontSelectorModal');
    const subheader = document.getElementById('subheader');
    const isVisible = modal.classList.contains('show');

    if (isVisible) {
        modal.classList.remove('show');
        subheader.classList.remove('expanded');
    } else {
        clearTimeout(fontListHideTimeout);
        const subheaderRect = subheader.getBoundingClientRect();
        modal.style.left = `${subheaderRect.left}px`;
        modal.style.top = `${subheaderRect.bottom}px`;
        modal.style.width = `${subheaderRect.width}px`;
        modal.classList.add('show');
        subheader.classList.add('expanded');
    }
}

function toggleColorPicker() {
    const modal = document.getElementById('colorPickerModal');
    const trigger = document.getElementById('colorBtn');
    if (modal.style.display === 'block') {
        modal.style.display = 'none';
    } else {
        positionModal(modal);
        bringToFront(modal);
        modal.style.display = 'block';
    }
}

function toggleMaterialModal() {
    const modal = document.getElementById('materialModal');
    const trigger = document.getElementById('materialBtn');
    if (modal.style.display === 'block') {
        modal.style.display = 'none';
    } else {
        positionModal(modal );
        bringToFront(modal);
        modal.style.display = 'block';
    }
}

function toggleAddFontMenu(event) {
    event.stopPropagation();
    const menu = document.getElementById('addFontContextMenu');
    const btn = document.getElementById('loadFontBtn');
    if (menu.style.display === 'block') {
        menu.style.display = 'none';
    } else {
        const btnRect = btn.getBoundingClientRect();
        menu.style.left = `${btnRect.left}px`;
        menu.style.top = `${btnRect.bottom + 4}px`;
        menu.style.display = 'block';
    }
}

/**
 * Displays the URL input modal.
 * [MODIFIED] Now uses positionModal to programmatically center itself.
 */
function showUrlModal() {
    const modal = document.getElementById('urlModal');
//    document.getElementById('modalOverlay').style.display = 'block';
    
    // Position the modal in the center of the screen before showing it.
    positionModal(modal, null, { centerX: true, centerY: true });
    
    modal.style.display = 'flex';
    document.getElementById('fontUrlInput').focus();
    document.getElementById('addFontContextMenu').style.display = 'none';
}

function hideUrlModal() {
    document.getElementById('modalOverlay').style.display = 'none';
    document.getElementById('urlModal').style.display = 'none';
    document.getElementById('fontUrlInput').value = '';
}
//----------------------------------------> END [MODAL & POPOVER MANAGEMENT]


//-------------------------------------------------------------
//-------------[   COLOR PICKER & MATERIAL SETUP   ]-----------
//-------------------------------------------------------------

function initColorPicker(onColorChangeCallback) {
    const hexInput = document.getElementById('hexInput');
    const rgbaInput = document.getElementById('rgbaInput');

    colorPicker = new iro.ColorPicker('#color-picker-container', {
        width: 180,
        color: '#0077fe',
        borderWidth: 1,
        borderColor: 'var(--color-border)',
        layout: [
            { component: iro.ui.Box },
            { component: iro.ui.Slider, options: { sliderType: 'hue' } },
            { component: iro.ui.Slider, options: { sliderType: 'alpha' } }
        ]
    });

    colorPicker.on('color:change', function(color) {
        hexInput.value = color.hex8String;
        rgbaInput.value = color.rgbaString;
        onColorChangeCallback(color.hexString, color.alpha);
    });

    hexInput.addEventListener('input', () => { try { colorPicker.color.set(hexInput.value); } catch (e) {} });
    rgbaInput.addEventListener('input', () => { try { colorPicker.color.set(rgbaInput.value); } catch (e) {} });
}

function populateMaterialModal(onMaterialSelectCallback) {
    const materials = ['Normal', 'Basic', 'Lambert', 'Phong', 'Standard', 'Physical', 'Toon', 'Wireframe'];
    const list = document.getElementById('materialList');
    list.innerHTML = '';
    materials.forEach(name => {
        const li = document.createElement('li');
        li.textContent = name;
        li.onclick = (event) => {
            document.querySelectorAll('#materialList li').forEach(item => item.classList.remove('active'));
            event.currentTarget.classList.add('active');
            onMaterialSelectCallback(name);
        };
        if (name === 'Phong') {
            li.classList.add('active');
        }
        list.appendChild(li);
    });
}
//----------------------------------------> END [COLOR PICKER & MATERIAL SETUP]


//-------------------------------------------------------------
//---------------[   CONSOLE & ERROR HANDLING   ]--------------
//-------------------------------------------------------------

function toggleConsole(show) {
    document.getElementById('consoleContainer').classList.toggle('show', show);
}
 
function logToConsole(dataArray, isError = false) {
    const output = document.getElementById('console-output');
    const logEntry = document.createElement('div');
    const timestamp = new Date().toLocaleTimeString();

    if (isError) {
        logEntry.classList.add('log-error');
        document.getElementById('consoleToggle').classList.add('has-error');
    }

    const timeEl = document.createElement('span');
    timeEl.className = 'log-timestamp';
    timeEl.textContent = `[${timestamp}] `;
    logEntry.appendChild(timeEl);
    
    dataArray.forEach(data => {
        // Simplified logger for brevity. The original interactive logger would go here.
        const textEl = document.createElement('span');
        textEl.textContent = (typeof data === 'object') ? JSON.stringify(data) : data + ' ';
        logEntry.appendChild(textEl);
    });

    output.appendChild(logEntry);
    output.scrollTop = output.scrollHeight;
}

function clearConsole() {
    document.getElementById('console-output').innerHTML = '';
    document.getElementById('consoleToggle').classList.remove('has-error');
}

function clearConsoleError() {
    document.getElementById('consoleToggle').classList.remove('has-error');
}

function handle_error(error, options = {}) {
    const config = {
        showInDevConsole: true,
        openUiConsole: false,
        type: 'generic',
        logData: null,
        showInAlert: false,
        ...options
    };

    if (config.showInDevConsole) {
        console.error(`[App Error Handled | Type: ${config.type}]`, error);
    }
    
    logToConsole(config.logData || [error.message], true);
    
    if (config.openUiConsole) {
        toggleConsole(true);
    }

    if (config.showInAlert) {
        const errorToast = document.getElementById('error-toast-message');
        if (errorToast) {
            errorToast.textContent = error.message || 'An unexpected error occurred.';
            errorToast.classList.add('show');
            setTimeout(() => errorToast.classList.remove('show'), 4000);
        }
    }
}
//----------------------------------------> END [CONSOLE & ERROR HANDLING]


//-------------------------------------------------------------
//---------------------[   UI FEEDBACK   ]---------------------
//-------------------------------------------------------------

function updateProgressBar(percentage) {
    const subheader = document.getElementById('subheader');
    subheader.style.setProperty('--progress-opacity', '1');
    subheader.style.setProperty('--progress-width', `${percentage}%`);
}

function finishLoadingProgress() {
    const subheader = document.getElementById('subheader');
    updateProgressBar(100);
    setTimeout(() => {
        subheader.style.setProperty('--progress-opacity', '0');
    }, 500);
}

function resetLoadingProgressOnError() {
    const subheader = document.getElementById('subheader');
    subheader.style.setProperty('--progress-opacity', '0');
    setTimeout(() => updateProgressBar(0), 300);
}
//----------------------------------------> END [UI FEEDBACK]


export {
    initUIManager,
    updateUI,
    toggleTheme,
    showTab,
    toggleFontList,
    toggleColorPicker,
    toggleMaterialModal,
    updateActiveMaterial, 
    toggleAddFontMenu,
    showUrlModal,
    hideUrlModal,
    toggleConsole,
    logToConsole,
    clearConsole,
    clearConsoleError,
    handle_error,
    updateProgressBar,
    finishLoadingProgress,
    resetLoadingProgressOnError,
};