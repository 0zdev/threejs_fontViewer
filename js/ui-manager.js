/**
 * Project: Three.js JSON Font Editor
 * File: editor/js/ui-manager.js
 * Created: 2025-08-29
 * Author: @lewopxd
 *
 * Description:
 * Manages the initialization, events, and state updates for all UI
 * components, including panels, buttons, modals, and the tab system.
 */

import { initSmartTooltips, makeDraggable, setupModalResize, bringToFront, positionModal } from './utils.js';

//-------------------------------------------------------------
//--------------------[   MODULE STATE   ]---------------------
//-------------------------------------------------------------

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
 * @param {object} callbacks - An object containing callback functions to decouple logic.
 */
function initUIManager(callbacks) {
    onThemeChangeCallback = callbacks.onThemeChange || (() => {});
    onTabSwitchCallback = callbacks.onTabSwitch || (() => {});
    const onColorChange = callbacks.onColorChange || (() => {});
    const onMaterialSelect = callbacks.onMaterialSelect || (() => {});

    setupResizers();
    initColorPicker(onColorChange);
    populateMaterialModal(onMaterialSelect);
    initSmartTooltips();
    initDraggableModals();
    initUIEventListeners();
}

/**
 * Sets up the resizers for the main panel and the console.
 */
function setupResizers() {
    const container = document.querySelector('.container');
    const resizer = document.getElementById('resizer');
    const editorPanel = document.querySelector('.editor-panel');
    const viewerIframe = document.getElementById('viewer-iframe');
    let isResizing = false;

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
        }
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
 */
function initUIEventListeners() {
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
 */
function toggleTheme(editor) {
    const body = document.body;
    const newTheme = body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    body.setAttribute('data-theme', newTheme);
    editor.setOption('theme', newTheme === 'dark' ? 'material-darker' : 'default');
    
    onThemeChangeCallback(newTheme);
}

/**
 * Synchronizes the 'active' state of toolbar buttons with application state.
 * @param {object} viewerState - The AppState.viewerState object.
 * @param {boolean} isEditing - The AppState.isEditing flag.
 */
function initButtonStates(viewerState, isEditing) {
    // Viewer control buttons
    document.getElementById('panBtn').classList.toggle('active', viewerState.panEnabled);
    document.getElementById('zoomBtn').classList.toggle('active', viewerState.zoomEnabled);
    document.getElementById('modeBtn').classList.toggle('active', viewerState.is3D);
    document.getElementById('gridBtn').classList.toggle('active', viewerState.gridVisible);
    document.getElementById('playPauseBtn').classList.toggle('active', viewerState.rotationEnabled);
    document.getElementById('rotateObjBtn').classList.toggle('active', viewerState.rotateObjectEnabled);
    document.getElementById('moveObjBtn').classList.toggle('active', viewerState.moveObjectEnabled);
    document.getElementById('rotateCamBtn').classList.toggle('active', viewerState.rotateCameraEnabled);
    
    // --- LÍNEA AÑADIDA ---
    // Sincroniza el estado visual del botón de wireframe.
    const wireframeBtn = document.getElementById('wireframeModeBtn');
    if (wireframeBtn) {
        wireframeBtn.classList.toggle('active', viewerState.isWireframeModeActive);
    }
    // ----------------------

    document.getElementById('playIcon').style.display = viewerState.rotationEnabled ? 'none' : 'block';
    document.getElementById('pauseIcon').style.display = viewerState.rotationEnabled ? 'block' : 'none';

    // Editor action buttons
    const saveBtn = document.getElementById('saveChangesBtn');
    const discardBtn = document.getElementById('discardChangesBtn');
    if (saveBtn && discardBtn) {
        const displayStyle = isEditing ? 'flex' : 'none';
        saveBtn.style.display = displayStyle;
        discardBtn.style.display = displayStyle;
    }
}
//----------------------------------------> END [THEME & GENERAL UI STATE]


//-------------------------------------------------------------
//-----------------[   TAB & VIEW MANAGEMENT   ]---------------
//-------------------------------------------------------------

/**
 * Shows a specific tab panel and hides others.
 * @param {string} tabName - The name of the tab to show ('editor', 'glyphs', 'info').
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
 */
function toggleColorPicker() {
    const modal = document.getElementById('colorPickerModal');
    const trigger = document.getElementById('colorBtn');
    if (modal.style.display === 'block') {
        modal.style.display = 'none';
    } else {
        positionModal(modal, trigger);
        bringToFront(modal);
        modal.style.display = 'block';
    }
}

/**
 * Shows/hides the material selector modal.
 */
function toggleMaterialModal() {
    const modal = document.getElementById('materialModal');
    const trigger = document.getElementById('materialBtn');
    if (modal.style.display === 'block') {
        modal.style.display = 'none';
    } else {
        positionModal(modal, trigger);
        bringToFront(modal);
        modal.style.display = 'block';
    }
}

/**
 * Toggles the 'Add Font' context menu.
 * @param {MouseEvent} event - The click event.
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
 */
function showUrlModal() {
    document.getElementById('modalOverlay').style.display = 'block';
    document.getElementById('urlModal').style.display = 'flex';
    document.getElementById('fontUrlInput').focus();
    document.getElementById('addFontContextMenu').style.display = 'none';
}

/**
 * Hides the modal for loading a font from a URL.
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
 */
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

/**
 * Populates the material selector modal with available materials.
 * @param {function} onMaterialSelectCallback - Callback to execute when a material is selected.
 */
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

/**
 * Shows or hides the console window.
 * @param {boolean} show - True to show the console, false to hide.
 */
function toggleConsole(show) {
    document.getElementById('consoleContainer').classList.toggle('show', show);
}
 
/**
 * Renderizador recursivo principal. Construye el árbol HTML interactivo final.
 */
function createInteractiveNode(data, key = null) {
    const isArray = Array.isArray(data);
    const details = document.createElement('details');
    details.classList.add('log-object-details');

    // La línea visible y clickeable
    const summary = document.createElement('summary');
    summary.classList.add('log-object-summary');

    let summaryContent = '';
    // Si la función recibe una clave, la renderiza primero
    if (key) {
        summaryContent += `<span class="log-property-key">${key}: </span>`;
    }

    const constructorName = data._constructorName || (isArray ? `Array` : 'Object');
    const previewText = createObjectPreview(data);

    // Añade el constructor y el resumen
    if (constructorName === 'Object' || isArray) {
        summaryContent += `<span class="log-object-preview">${previewText}</span>`;
    } else {
        summaryContent += `<span class="log-constructor-name">${constructorName}</span> <span class="log-object-preview">${previewText}</span>`;
    }
    summary.innerHTML = summaryContent;
    details.appendChild(summary);

    // Contenedor para las propiedades internas
    const content = document.createElement('div');
    content.classList.add('log-object-content');

    for (const propKey in data) {
        if (!Object.prototype.hasOwnProperty.call(data, propKey) || propKey.startsWith('_')) continue;
        
        const value = data[propKey];
        const line = document.createElement('div');
        line.classList.add('log-property-line');

        if (typeof value === 'object' && value !== null) {
            // Si la propiedad es otro objeto, llamamos recursivamente pasándole su clave
            line.appendChild(createInteractiveNode(value, propKey));
        } else {
            // Si es un valor simple, lo mostramos con su clave
            const keyEl = document.createElement('span');
            keyEl.className = 'log-property-key';
            keyEl.textContent = `${propKey}: `;
            line.appendChild(keyEl);

            const valueEl = document.createElement('span');
            valueEl.className = `log-property-value type-${typeof value}`;
            valueEl.textContent = typeof value === 'string' ? `"${value}"` : String(value);
            line.appendChild(valueEl);
        }
        content.appendChild(line);
    }
    details.appendChild(content);
    return details;
}
 
function createObjectPreview(obj) {
    const MAX_PREVIEW_LENGTH = 100;

    if (Array.isArray(obj)) {
        let preview = `(${obj.length}) [`;
        for (let i = 0; i < obj.length; i++) {
            const item = obj[i];
            let itemPreview = '';
            if (typeof item === 'object' && item !== null) {
                itemPreview = item._constructorName || 'Object';
                if (itemPreview === 'Object') itemPreview = '{…}';
            } else if (typeof item === 'string') {
                itemPreview = `"${item}"`;
            } else {
                itemPreview = String(item);
            }
            // Comprueba la longitud antes de añadir el siguiente elemento
            if (preview.length + itemPreview.length > MAX_PREVIEW_LENGTH) {
                preview += '…';
                break;
            }
            preview += itemPreview;
            if (i < obj.length - 1) preview += ', ';
        }
        preview += ']';
        return preview;
    }

    let preview = "{ ";
    const keys = Object.keys(obj).filter(key => !key.startsWith('_'));
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const value = obj[key];
        let valuePreview = '';

        if (typeof value === 'object' && value !== null) {
            valuePreview = value._constructorName || (Array.isArray(value) ? `Array(${value.length})` : 'Object');
        } else {
             valuePreview = typeof value === 'string' ? `"${value}"` : String(value);
        }

        const pair = `${key}: ${valuePreview}`;
        if (preview.length + pair.length > MAX_PREVIEW_LENGTH && i > 0) {
             preview += '…';
             break;
        }
        preview += pair;
        if (i < keys.length - 1) preview += ', ';
    }
    preview += " }";
    return preview;
}
    
/**
 * Función principal que orquesta el log en la consola UI.
 */
function logToConsole(dataArray, isError = false) {
    const output = document.getElementById('console-output');
    const logEntry = document.createElement('div');
    const timestamp = new Date().toLocaleTimeString();

     document.getElementById('consoleToggle').classList.add('has-error');

    const timeEl = document.createElement('span');
    timeEl.className = 'log-timestamp';
    timeEl.textContent = `[${timestamp}] `;
    logEntry.appendChild(timeEl);

    if (isError) {
        logEntry.classList.add('log-error');
    }

    dataArray.forEach(data => {
         if (typeof data === 'object' && data !== null && data.message && data.stack && Array.isArray(data.stack)) {
            const msgEl = document.createElement('span');
            msgEl.textContent = data.message;
            logEntry.appendChild(msgEl);
            
             if (data.stack.length > 10) {
                const details = document.createElement('details');
                details.classList.add('log-object-details', 'log-stack-details');
                const summary = document.createElement('summary');
                summary.classList.add('log-object-summary', 'log-stack-summary');
                summary.innerHTML = `<span class="log-constructor-name">stack:</span> <span class="log-object-preview">Array(${data.stack.length})</span>`;
                details.appendChild(summary);
                
                const content = document.createElement('div');
                content.classList.add('log-object-content');
                data.stack.forEach((trace, index) => {
                    const line = document.createElement('div');
                    line.classList.add('log-property-line');
                    line.innerHTML = `<span class="log-property-key">${index}: </span><span class="log-property-value type-string">"${trace}"</span>`;
                    content.appendChild(line);
                });
                details.appendChild(content);
                logEntry.appendChild(details);
            } else {
                 const stackContainer = document.createElement('div');
                stackContainer.classList.add('log-stack-container-flat');
                 for (let i = 1; i < data.stack.length; i++) {
                    const line = document.createElement('div');
                    line.className = 'log-stack-line';
                    line.textContent = data.stack[i];
                    stackContainer.appendChild(line);
                }
                logEntry.appendChild(stackContainer);
            }

        } else if (typeof data === 'object' && data !== null) {
            logEntry.appendChild(createInteractiveNode(data));
        } else {
            const textEl = document.createElement('span');
            textEl.textContent = data + ' ';
            logEntry.appendChild(textEl);
        }
    });

    output.appendChild(logEntry);
    output.scrollTop = output.scrollHeight;
}

 

/**
 * Removes the error indicator from the console toggle button.
 */
function clearConsoleError() {
    document.getElementById('consoleToggle').classList.remove('has-error');
}

/**
 * Handles application errors by displaying them in the appropriate console.
 * @param {Error} error - The error object.
 * @param {object} [options={}] - Display options.
 */
function handle_error(error, options = {}) {
    const config = {
        showInDevConsole: true,  // <-- Vuelve a ser true por defecto para máxima visibilidad
        showInUiConsole: null,   // <-- null para detectar si el usuario la define explícitamente
        openUiConsole: false,
        type: 'generic',
        logData: null,
        ...options
    };

     
    let shouldShowInUi = (config.type === 'threejs');

    
    if (config.showInUiConsole !== null) {
        shouldShowInUi = config.showInUiConsole;
    }
    
    if (config.showInDevConsole) {
         const devError = new Error(error.message);
        devError.stack = Array.isArray(config.logData?.[0]?.stack) ? config.logData[0].stack.join('\n') : error.stack;
        console.error(`[App Error Handled | Type: ${config.type}]`, devError);
    }

    if (shouldShowInUi) {
        const dataToLog = config.logData || [error.stack || error.message];
        logToConsole(dataToLog, true);
        
        document.getElementById('consoleToggle').classList.add('has-error');
        if (config.openUiConsole) {
            toggleConsole(true);
        }
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
function clearConsole() {
    document.getElementById('console-output').innerHTML = '';
    document.getElementById('consoleToggle').classList.remove('has-error');
}

//----------------------------------------> END [CONSOLE & ERROR HANDLING]


//-------------------------------------------------------------
//---------------------[   UI FEEDBACK   ]---------------------
//-------------------------------------------------------------

/**
 * Updates the width of the loading progress bar in the subheader.
 * @param {number} percentage - The completion percentage (0-100).
 */
function updateProgressBar(percentage) {
    const subheader = document.getElementById('subheader');
    subheader.style.setProperty('--progress-opacity', '1');
    subheader.style.setProperty('--progress-width', `${percentage}%`);
}

/**
 * Completes and fades out the loading progress bar.
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
 */
function resetLoadingProgressOnError() {
    const subheader = document.getElementById('subheader');
    subheader.style.setProperty('--progress-opacity', '0');
    setTimeout(() => updateProgressBar(0), 300);
}
//----------------------------------------> END [UI FEEDBACK]


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