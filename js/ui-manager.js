/**
 * Project: Three.js JSON Font Editor
 * File: editor/js/ui-manager.js
 * Created: 2025-08-29
 * Author: [Tu Nombre/Apodo]
 *
 * Description:
 * Manages the initialization, events, and state updates for all UI
 * components, including panels, buttons, modals, and the tab system.
 */

import { initSmartTooltips, makeDraggable, setupModalResize, bringToFront, positionModal } from './utils.js';

//-------------------------------------------------------------
//--------------------[   MODULE STATE   ]---------------------
//-------------------------------------------------------------

/**
 * @var {object|null} colorPicker - The iro.js color picker instance.
 * @var {number|null} fontListHideTimeout - Timeout ID for the font list hide timer.
 */
let colorPicker = null;
let fontListHideTimeout;

// Callbacks to be set by the main module
let onThemeChangeCallback = () => {};
let onTabSwitchCallback = () => {};
//----------------------------------------> END [MODULE STATE]


//-------------------------------------------------------------
//--------------------[   INITIALIZATION   ]-------------------
//-------------------------------------------------------------

 /**
 * Initializes all UI components and sets up event listeners.
 * This is the main entry point for this module.
 * @param {object} callbacks - An object containing callback functions to decouple logic.
 */
function initUIManager(callbacks) {
    onThemeChangeCallback = callbacks.onThemeChange || (() => {});
    onTabSwitchCallback = callbacks.onTabSwitch || (() => {});
    const onColorChange = callbacks.onColorChange || (() => {});
    const onMaterialSelect = callbacks.onMaterialSelect || (() => {});

    setupResizers();
    // Pasamos los callbacks a las funciones que los necesitan
    initColorPicker(onColorChange);
    populateMaterialModal(onMaterialSelect);
    initSmartTooltips();
    initDraggableModals();
    initUIEventListeners();
}

/**
 * Sets up the resizers for the main panel and the console.
 * This is the definitive, robust version that correctly handles mouse events and the iframe for BOTH resizers.
 */
function setupResizers() {
    const container = document.querySelector('.container');
    const resizer = document.getElementById('resizer');
    const sidebar = document.querySelector('.sidebar');
    const editorPanel = document.querySelector('.editor-panel');
    const viewerPanel = document.querySelector('.viewer-panel');
    const viewerIframe = document.getElementById('viewer-iframe');
    let isResizing = false;
    let initialStableContainerWidth = 0;

    const MIN_WIDTH_LEFT = 300;
    const MIN_WIDTH_RIGHT = 100;
    const MIN_VISIBLE_RIGHT = 10;

    const startResize = (e) => {
        isResizing = true;
        initialStableContainerWidth = container.clientWidth - sidebar.offsetWidth;
        if (viewerIframe) viewerIframe.style.pointerEvents = 'none';
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'ew-resize';
        document.addEventListener('mousemove', handleResize);
        window.addEventListener('mouseup', stopResize);
    };

    const handleResize = (e) => {
        if (!isResizing) return;
        const containerRect = container.getBoundingClientRect();
        const mouseX = e.clientX - containerRect.left - sidebar.offsetWidth;
        const resizerWidth = resizer.offsetWidth;
        const containerWidth = initialStableContainerWidth;
        const minResizerX = MIN_WIDTH_LEFT;
        const maxResizerX = containerWidth - MIN_VISIBLE_RIGHT - resizerWidth;
        const clampedResizerX = Math.max(minResizerX, Math.min(mouseX, maxResizerX));
        const newLeftWidth = clampedResizerX;
        let newRightWidth;
        const slideThresholdX = containerWidth - MIN_WIDTH_RIGHT - resizerWidth;
        if (clampedResizerX < slideThresholdX) {
            newRightWidth = containerWidth - newLeftWidth - resizerWidth;
        } else {
            newRightWidth = MIN_WIDTH_RIGHT;
        }
        editorPanel.style.setProperty('flex', `0 0 ${newLeftWidth}px`, 'important');
        viewerPanel.style.setProperty('flex', `0 0 ${newRightWidth}px`, 'important');
    };

    const stopResize = () => {
        if (!isResizing) return;
        isResizing = false;
        if (viewerIframe) viewerIframe.style.pointerEvents = 'auto';
        document.body.style.userSelect = 'auto';
        document.body.style.cursor = 'default';
        document.removeEventListener('mousemove', handleResize);
        window.removeEventListener('mouseup', stopResize);
    };

    resizer.addEventListener('mousedown', startResize);

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
    
    consoleResizer.addEventListener('mousedown', startConsoleResize);
}



/**
 * Initializes all draggable modal windows.
 * @returns {void}
 */
function initDraggableModals() {
    makeDraggable(document.getElementById('versionModal'));
    makeDraggable(document.getElementById('colorPickerModal'));
    makeDraggable(document.getElementById('materialModal'));
    makeDraggable(document.getElementById('urlModal'));
    setupModalResize(document.getElementById('versionModal'));
}

/**
 * Centralized setup for various UI event listeners.
 * @returns {void}
 */
function initUIEventListeners() {
    // Accordion for info view & view more/less links
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

    // Hide font list logic
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

    // Handle window resizing for font list position
    window.addEventListener('resize', () => {
        if (fontSelectorModal.classList.contains('show')) {
            const subheaderRect = subheader.getBoundingClientRect();
            fontSelectorModal.style.left = `${subheaderRect.left}px`;
            fontSelectorModal.style.top = `${subheaderRect.bottom}px`;
            fontSelectorModal.style.width = `${subheaderRect.width}px`;
        }
    });
}
//----------------------------------------> END [INITIALIZATION]


//-------------------------------------------------------------
//----------------[   THEME & GENERAL UI STATE   ]-------------
//-------------------------------------------------------------

/**
 * Toggles the color theme between 'dark' and 'light'.
 * @param {object} editor - The CodeMirror editor instance.
 * @returns {void}
 */
function toggleTheme(editor) {
    const body = document.body;
    const newTheme = body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    body.setAttribute('data-theme', newTheme);
    editor.setOption('theme', newTheme === 'dark' ? 'material-darker' : 'default');
    
    // Notify main module that a theme change occurred
    onThemeChangeCallback(newTheme);
}

/**
 * Synchronizes the 'active' state of toolbar buttons with application state.
 * @param {object} state - An object containing the current state of the application.
 * @returns {void}
 */
function initButtonStates(state) {
    document.getElementById('panBtn').classList.toggle('active', state.panEnabled);
    document.getElementById('zoomBtn').classList.toggle('active', state.zoomEnabled);
    document.getElementById('modeBtn').classList.toggle('active', state.is3D);
    document.getElementById('gridBtn').classList.toggle('active', state.gridVisible);
    document.getElementById('playPauseBtn').classList.toggle('active', state.rotationEnabled);
    document.getElementById('rotateObjBtn').classList.toggle('active', state.rotateObjectEnabled);
    document.getElementById('moveObjBtn').classList.toggle('active', state.moveObjectEnabled);
    document.getElementById('rotateCamBtn').classList.toggle('active', state.rotateCameraEnabled);
    document.getElementById('playIcon').style.display = state.rotationEnabled ? 'none' : 'block';
    document.getElementById('pauseIcon').style.display = state.rotationEnabled ? 'block' : 'none';
    document.getElementById('editToggleBtn').classList.toggle('active', !state.isEditorLocked);
}
//----------------------------------------> END [THEME & GENERAL UI STATE]


//-------------------------------------------------------------
//-----------------[   TAB & VIEW MANAGEMENT   ]---------------
//-------------------------------------------------------------

/**
 * Shows a specific tab panel and hides others.
 * @param {string} tabName - The name of the tab to show ('editor', 'glyphs', 'info').
 * @returns {void}
 */
function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(button => button.classList.remove('active'));

    document.getElementById(tabName + '-view')?.classList.add('active');
    document.querySelector(`.tab-btn[onclick="showTab('${tabName}')"]`)?.classList.add('active');

    onTabSwitchCallback(tabName);
}
//----------------------------------------> END [TAB & VIEW MANAGEMENT]


//-------------------------------------------------------------
//--------------[   MODAL & POPOVER MANAGEMENT   ]-------------
//-------------------------------------------------------------

/**
 * Toggles the visibility of the font selector dropdown.
 * @returns {void}
 */
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

/**
 * Shows/hides the color picker modal.
 * @returns {void}
 */
function toggleColorPicker() {
    const modal = document.getElementById('colorPickerModal');
    const trigger = document.getElementById('colorBtn');
    if (modal.style.display === 'block') {
        modal.style.display = 'none';
    } else {
        positionModal(modal, trigger); // <-- LÍNEA CORREGIDA Y FUNCIONAL
        bringToFront(modal);
        modal.style.display = 'block';
    }
}

/**
 * Shows/hides the material selector modal.
 * @returns {void}
 */
function toggleMaterialModal() {
    const modal = document.getElementById('materialModal');
    const trigger = document.getElementById('materialBtn');
    if (modal.style.display === 'block') {
        modal.style.display = 'none';
    } else {
        positionModal(modal, trigger); // <-- LÍNEA CORREGIDA Y FUNCIONAL
        bringToFront(modal);
        modal.style.display = 'block';
    }
}

/**
 * Toggles the 'Add Font' context menu.
 * @param {MouseEvent} event - The click event.
 * @returns {void}
 */
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
 * Shows the modal for loading a font from a URL.
 * @returns {void}
 */
function showUrlModal() {
    document.getElementById('modalOverlay').style.display = 'block';
    document.getElementById('urlModal').style.display = 'flex';
    document.getElementById('fontUrlInput').focus();
    document.getElementById('addFontContextMenu').style.display = 'none';
}

/**
 * Hides the modal for loading a font from a URL.
 * @returns {void}
 */
function hideUrlModal() {
    document.getElementById('modalOverlay').style.display = 'none';
    document.getElementById('urlModal').style.display = 'none';
    document.getElementById('fontUrlInput').value = '';
}
//----------------------------------------> END [MODAL & POPOVER MANAGEMENT]


//-------------------------------------------------------------
//-------------[   COLOR PICKER & MATERIAL SETUP   ]-----------
//-------------------------------------------------------------

/**
 * Initializes the iro.js color picker.
 * @param {function} onColorChangeCallback - Callback to execute when the color changes.
 * @returns {void}
 */
function initColorPicker(onColorChangeCallback) {
    const hexInput = document.getElementById('hexInput');
    const rgbaInput = document.getElementById('rgbaInput');

    colorPicker = new iro.ColorPicker('#color-picker-container', {
        width: 180,
        color: '#0077fe', // Initial color
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

/**
 * Populates the material selector modal with available materials.
 * @param {function} onMaterialSelectCallback - Callback to execute when a material is selected.
 * @returns {void}
 */
function populateMaterialModal(onMaterialSelectCallback) {
    const materials = ['Normal', 'Basic', 'Lambert', 'Phong', 'Standard', 'Physical', 'Toon', 'Wireframe'];
    const list = document.getElementById('materialList');
    list.innerHTML = '';
    materials.forEach(name => {
        const li = document.createElement('li');
        li.textContent = name;
        li.onclick = (event) => {
            const listItems = document.querySelectorAll('#materialList li');
            listItems.forEach(item => item.classList.remove('active'));
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

/**
 * Shows or hides the console window.
 * @param {boolean} show - True to show the console, false to hide.
 * @returns {void}
 */
function toggleConsole(show) {
    document.getElementById('consoleContainer').classList.toggle('show', show);
}

/**
 * Logs a message to the UI console.
 * @param {string} message - The message to log.
 * @param {boolean} [isError=false] - If true, styles the message as an error.
 * @returns {void}
 */
function logToConsole(message, isError = false) {
    const output = document.getElementById('console-output');
    const logEntry = document.createElement('div');
    const timestamp = new Date().toLocaleTimeString();
    logEntry.textContent = `[${timestamp}] ${message}`;
    if (isError) {
        logEntry.classList.add('log-error');
    }
    output.appendChild(logEntry);
    output.scrollTop = output.scrollHeight;
}

/**
 * Clears all messages from the UI console.
 * @returns {void}
 */
function clearConsole() {
    document.getElementById('console-output').innerHTML = '';
}

/**
 * Removes the error indicator from the console toggle button.
 * @returns {void}
 */
function clearConsoleError() {
    document.getElementById('consoleToggle').classList.remove('has-error');
}

/**
 * Handles application errors by displaying them in the console and/or a toast.
 * @param {Error} error - The error object.
 * @param {object} [options={}] - Display options.
 * @returns {void}
 */
function handle_error(error, options = {}) {
    const config = {
        showInConsole: true,
        openConsole: false,
        showInAlert: false,
        alertPersistent: false,
        ...options
    };

    const errorMessage = error.stack || error.toString();
    const cleanMessage = error.message || errorMessage;
    
    if (config.showInConsole) {
        console.error(error);
        logToConsole(errorMessage, true);
        document.getElementById('consoleToggle').classList.add('has-error');
    }

    if (config.showInConsole && config.openConsole) {
        toggleConsole(true);
    }

    if (config.showInAlert) {
        const errorToast = document.getElementById('error-toast-message');
        errorToast.textContent = cleanMessage;
        errorToast.classList.add('show');

        if (!config.alertPersistent) {
            setTimeout(() => errorToast.classList.remove('show'), 3000);
        }
    }
}
//----------------------------------------> END [CONSOLE & ERROR HANDLING]


//-------------------------------------------------------------
//---------------------[   UI FEEDBACK   ]---------------------
//-------------------------------------------------------------

/**
 * Updates the width of the loading progress bar in the subheader.
 * @param {number} percentage - The completion percentage (0-100).
 * @returns {void}
 */
function updateProgressBar(percentage) {
    const subheader = document.getElementById('subheader');
    subheader.style.setProperty('--progress-opacity', '1');
    subheader.style.setProperty('--progress-width', `${percentage}%`);
}

/**
 * Completes and fades out the loading progress bar.
 * @returns {void}
 */
function finishLoadingProgress() {
    const subheader = document.getElementById('subheader');
    updateProgressBar(100);
    setTimeout(() => {
        subheader.style.setProperty('--progress-opacity', '0');
    }, 500);
}

/**
 * Hides and resets the loading progress bar, typically on error.
 * @returns {void}
 */
function resetLoadingProgressOnError() {
    const subheader = document.getElementById('subheader');
    subheader.style.setProperty('--progress-opacity', '0');
    setTimeout(() => updateProgressBar(0), 300);
}
//----------------------------------------> END [UI FEEDBACK]


//-------------------------------------------------------------
//--------------------[   END OF MODULE   ]--------------------
//-------------------------------------------------------------

export {
    initUIManager,
    toggleTheme,
    initButtonStates,
    showTab,
    toggleFontList,
    toggleColorPicker,
    toggleMaterialModal,
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
    initColorPicker,
    populateMaterialModal
};