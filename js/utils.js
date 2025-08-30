/**
 * Project: Three.js JSON Font Editor
 * File: editor/js/utils.js
 * Created: 2025-08-29
 * Author: [Tu Nombre/Apodo]
 *
 * Description:
 * This module serves as a toolbox of reusable, general-purpose helper
 * functions for DOM manipulation, data formatting, and UI components.
 */

//-------------------------------------------------------------
//--------------------[   UI COMPONENTS   ]--------------------
//-------------------------------------------------------------

/**
 * @var {number} zIndexCounter - Manages the z-index for floating windows to ensure the last-clicked one is on top.
 */
let zIndexCounter = 1001;

/**
 * Brings a modal element to the front by increasing its z-index.
 * @param {HTMLElement} modalElement - The modal element to bring to the front.
 * @returns {void}
 */
function bringToFront(modalElement) {
    modalElement.style.zIndex = ++zIndexCounter;
}

/**
 * Makes a modal element draggable by its header.
 * @param {HTMLElement} modalElement - The modal element to make draggable.
 * @returns {void}
 */
function makeDraggable(modalElement) {
    const header = modalElement.querySelector('.modal-header, .color-picker-header, .material-modal-header, .url-modal-header');
    const iframe = document.getElementById('viewer-iframe');
    if (!header) return;

    let isDragging = false;
    let offset = { x: 0, y: 0 };

    modalElement.addEventListener('mousedown', () => {
        bringToFront(modalElement);
    });

    header.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.classList.contains('close-button')) return;

        isDragging = true;
        modalElement.dataset.dragged = "true";
        offset.x = e.clientX - modalElement.offsetLeft;
        offset.y = e.clientY - modalElement.offsetTop;

        if (iframe) iframe.style.pointerEvents = 'none';
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', onStopDrag, { once: true });
    });

    function onDrag(e) {
        if (!isDragging) return;
        let newLeft = e.clientX - offset.x;
        let newTop = e.clientY - offset.y;
        const margin = 10;
        const minX = margin;
        const minY = margin;
        const maxX = window.innerWidth - modalElement.offsetWidth - margin;
        const maxY = window.innerHeight - modalElement.offsetHeight - margin;
        newLeft = Math.max(minX, Math.min(newLeft, maxX));
        newTop = Math.max(minY, Math.min(newTop, maxY));
        modalElement.style.left = `${newLeft}px`;
        modalElement.style.top = `${newTop}px`;
    }

    function onStopDrag() {
        isDragging = false;
        if (iframe) iframe.style.pointerEvents = 'auto';
        document.removeEventListener('mousemove', onDrag);
    }
}

/**
 * Enables resizing for a modal element using a handle.
 * @param {HTMLElement} modalElement - The modal element to make resizable.
 * @returns {void}
 */
function setupModalResize(modalElement) {
    const handle = modalElement.querySelector('.resizer-handle');
    const iframe = document.getElementById('viewer-iframe');
    if (!handle) return;

    let isResizing = false;
    let lastX, lastY, startWidth, startHeight;

    handle.addEventListener('mousedown', (e) => {
        isResizing = true;
        lastX = e.clientX;
        lastY = e.clientY;
        startWidth = parseInt(document.defaultView.getComputedStyle(modalElement).width, 10);
        startHeight = parseInt(document.defaultView.getComputedStyle(modalElement).height, 10);

        if (iframe) iframe.style.pointerEvents = 'none';
        document.addEventListener('mousemove', onResize);
        document.addEventListener('mouseup', onStopResize, { once: true });
    });

    function onResize(e) {
        if (!isResizing) return;

        let newWidth = startWidth + (e.clientX - lastX);
        let newHeight = startHeight + (e.clientY - lastY);
        const margin = 20;

        const minWidth = parseInt(getComputedStyle(modalElement).minWidth, 10) || 300;
        const maxWidth = window.innerWidth - modalElement.offsetLeft - margin;
        const maxHeight = window.innerHeight - modalElement.offsetTop - margin;

        newWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));
        newHeight = Math.max(200, Math.min(newHeight, maxHeight));

        modalElement.style.width = `${newWidth}px`;
        modalElement.style.height = `${newHeight}px`;
    }

    function onStopResize() {
        isResizing = false;
        if (iframe) iframe.style.pointerEvents = 'auto';
        document.removeEventListener('mousemove', onResize);
    }
}

/**
 * Calculates and sets the optimal initial position for a modal window.
 * It tries to position it relative to a trigger button or centers it.
 * @param {HTMLElement} modalElement - The modal to be positioned.
 * @param {HTMLElement} [triggerElement] - The element that opened the modal, for relative positioning.
 * @returns {void}
 */
function positionModal(modalElement, triggerElement) {
    // Make the modal temporarily visible to measure it
    modalElement.style.visibility = 'hidden';
    modalElement.style.display = 'block';
    const modalRect = modalElement.getBoundingClientRect();
    modalElement.style.display = 'none';
    modalElement.style.visibility = 'visible';

    let top, left;

    if (modalElement.dataset.dragged) {
        // If dragged before, keep its last position
        return; 
    }
    
    if (triggerElement) {
        // Position relative to the button that opened it
        const triggerRect = triggerElement.getBoundingClientRect();
        top = triggerRect.bottom + 8;
        left = triggerRect.left;
    } else {
        // Default to the center of the screen
        top = (window.innerHeight / 2) - (modalRect.height / 2);
        left = (window.innerWidth / 2) - (modalRect.width / 2);
    }

    // Ensure it doesn't render off-screen
    const margin = 10;
    if (left + modalRect.width > window.innerWidth) {
        left = window.innerWidth - modalRect.width - margin;
    }
    if (top + modalRect.height > window.innerHeight) {
        top = window.innerHeight - modalRect.height - margin;
    }
    if (left < margin) left = margin;
    if (top < margin) top = margin;

    modalElement.style.top = `${top}px`;
    modalElement.style.left = `${left}px`;
}
//----------------------------------------> END [UI COMPONENTS]


//-------------------------------------------------------------
//-------------[   MODAL & TOAST NOTIFICATIONS   ]-------------
//-------------------------------------------------------------

/**
 * @var {number|null} toastTimeout - Timeout ID for the toast message timer.
 */
let toastTimeout;

/**
 * Displays a short-lived toast message at the bottom of the screen.
 * @param {string} message - The message to display in the toast.
 * @returns {void}
 */
function showToastMessage(message) {
    const toast = document.getElementById('toast-message');
    clearTimeout(toastTimeout);
    toast.textContent = message;
    toast.classList.add('show');
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

/**
 * Displays a confirmation modal with a custom title, text, and buttons.
 * @param {object} config - Configuration object for the modal.
 * @param {string} config.title - The title of the modal.
 * @param {string} config.text - The body text of the modal.
 * @param {Array<object>} config.buttons - Array of button configurations ({label, callback}).
 * @returns {void}
 */
function showConfirmationModal(config) {
    const { title, text, buttons } = config;
    const overlay = document.getElementById('confirmation-modal-overlay');
    const titleEl = document.getElementById('confirmation-title');
    const textEl = document.getElementById('confirmation-text');
    const buttonsEl = document.getElementById('confirmation-buttons');

    titleEl.textContent = title || 'Confirmation';
    textEl.textContent = text || 'Are you sure?';
    buttonsEl.innerHTML = '';

    if (buttons && buttons.length > 0) {
        buttons.forEach((btn, index) => {
            const button = document.createElement('button');
            button.textContent = btn.label;
            button.className = (index === buttons.length - 1) ? 'modal-btn modal-btn-primary' : 'modal-btn modal-btn-secondary';
            button.onclick = () => {
                if (btn.callback && typeof btn.callback === 'function') {
                    btn.callback();
                }
                hideConfirmationModal();
            };
            buttonsEl.appendChild(button);
        });
    }
    overlay.style.display = 'flex';
}

/**
 * Hides the confirmation modal.
 * @returns {void}
 */
function hideConfirmationModal() {
    const overlay = document.getElementById('confirmation-modal-overlay');
    overlay.style.display = 'none';
}
//----------------------------------------> END [MODAL & TOAST NOTIFICATIONS]


//-------------------------------------------------------------
//----------------[   DYNAMIC TOOLTIP SYSTEM   ]---------------
//-------------------------------------------------------------

/**
 * @var {HTMLElement|null} tooltipElement - The currently active tooltip element.
 * @var {number|null} hideTimeout - Timeout ID for hiding the tooltip.
 */
let tooltipElement;
let hideTimeout;

/**
 * Initializes tooltip functionality for all elements with a 'data-tooltip' attribute.
 * @returns {void}
 */
function initSmartTooltips() {
    const elementsWithTooltip = document.querySelectorAll('[data-tooltip]');
    elementsWithTooltip.forEach(el => {
        // Avoid adding duplicate listeners
        if (el.dataset.tooltipInitialized) return;
        el.addEventListener('mouseenter', showTooltip);
        el.addEventListener('mouseleave', hideTooltip);
        el.dataset.tooltipInitialized = true;
    });
}

/**
 * Event handler to display a tooltip.
 * @param {MouseEvent} event - The mouseenter event.
 * @returns {void}
 */
function showTooltip(event) {
    clearTimeout(hideTimeout);
    if (tooltipElement && tooltipElement.parentElement) {
        tooltipElement.parentElement.removeChild(tooltipElement);
    }
    const el = event.currentTarget;
    const tooltipText = el.getAttribute('data-tooltip');
    if (!tooltipText) return;

    tooltipElement = document.createElement('div');
    tooltipElement.className = 'dynamic-tooltip';
    tooltipElement.innerHTML = `${tooltipText}<div class="tooltip-arrow"></div>`;
    document.body.appendChild(tooltipElement);

    positionTooltip(el, tooltipElement);
    requestAnimationFrame(() => {
        if (tooltipElement) {
            tooltipElement.classList.add('show');
        }
    });
}

/**
 * Event handler to hide a tooltip.
 * @returns {void}
 */
function hideTooltip() {
    const currentTooltip = tooltipElement;
    if (currentTooltip) {
        currentTooltip.classList.remove('show');
        hideTimeout = setTimeout(() => {
            if (currentTooltip && currentTooltip.parentElement) {
                currentTooltip.parentElement.removeChild(currentTooltip);
            }
            if (tooltipElement === currentTooltip) {
                tooltipElement = null;
            }
        }, 200);
    }
}

/**
 * Calculates and sets the optimal position for a tooltip relative to its target element.
 * @param {HTMLElement} target - The element the tooltip is for.
 * @param {HTMLElement} tooltip - The tooltip element itself.
 * @returns {void}
 */
function positionTooltip(target, tooltip) {
    const targetRect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const gap = 8;
    let pos = 'top';

    // Default to top position
    let top = targetRect.top - tooltipRect.height - gap;
    let left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);

    // If not enough space on top, try bottom
    if (top < 0) {
        pos = 'bottom';
        top = targetRect.bottom + gap;
    }
    // If it goes off-screen vertically, try sides
    if (top + tooltipRect.height > window.innerHeight) {
        pos = 'right';
        top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
        left = targetRect.right + gap;
        // If not enough space on the right, try left
        if (left + tooltipRect.width > window.innerWidth) {
            pos = 'left';
            left = targetRect.left - tooltipRect.width - gap;
        }
    }

    // Prevent horizontal overflow
    if (pos === 'top' || pos === 'bottom') {
        if (left < 0) left = gap;
        if (left + tooltipRect.width > window.innerWidth) left = window.innerWidth - tooltipRect.width - gap;
    }
    
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
    tooltip.className = `dynamic-tooltip tooltip-${pos}`;
}
//----------------------------------------> END [DYNAMIC TOOLTIP SYSTEM]


//-------------------------------------------------------------
//----------------[   TEXT & DATA FORMATTING   ]---------------
//-------------------------------------------------------------

/**
 * Formats a number of bytes into a human-readable string (KB, MB, etc.).
 * @param {number} bytes - The number of bytes.
 * @param {number} [decimals=2] - The number of decimal places to use.
 * @returns {string} The formatted file size string.
 */
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Converts a camelCase or snake_case string into a title-cased string.
 * e.g., "fontFamilyName" -> "Font Family Name"
 * @param {string} key - The input string.
 * @returns {string} The formatted title string.
 */
function formatLabelKey(key) {
    const result = key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ');
    return result.charAt(0).toUpperCase() + result.slice(1);
}

/**
 * Finds URLs in a string and wraps them in an anchor <a> tag.
 * @param {string} text - The text to process.
 * @returns {string} The text with HTML links.
 */
function linkify(text) {
    if (typeof text !== 'string') return text;
    const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    return text.replace(urlRegex, function(url) {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });
}

/**
 * Truncates a long string and adds "view more" / "show less" links.
 * @param {string} text - The text to truncate.
 * @param {number} [maxLength=150] - The maximum length before truncating.
 * @returns {string} The potentially truncated text with HTML for toggling.
 */
function truncateText(text, maxLength = 150) {
    if (typeof text !== 'string' || text.length <= maxLength) return text;

    const shortPart = text.substr(0, maxLength);
    const fullPart = text;

    return `
        <span class="truncated-text" style="display: inline;">
            ${shortPart}...
            <a href="#" class="view-more-link">view more</a>
        </span>
        <span class="full-text" style="display: none;">
            ${fullPart}
            <a href="#" class="show-less-link">show less</a>
        </span>`;
}
//----------------------------------------> END [TEXT & DATA FORMATTING]

 

export {
    bringToFront,
    makeDraggable,
    setupModalResize,
    showToastMessage,
    showConfirmationModal,
    hideConfirmationModal,
    initSmartTooltips,
    formatBytes,
    formatLabelKey,
    linkify,
    truncateText,
    positionModal
};