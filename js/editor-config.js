/**
 * Project: Three.js JSON Font Editor
 * File: editor/js/editor-config.js
 * Created: 2025-08-29
 * Author: [Tu Nombre/Apodo]
 *
 * Description:
 * This module encapsulates all configuration and interaction logic
 * for the CodeMirror editor instance.
 */

//-------------------------------------------------------------
//-------------[   EDITOR INITIALIZATION & STATE   ]-----------
//-------------------------------------------------------------

/**
 * @var {object|null} cmEditor - Holds the CodeMirror instance.
 */
let cmEditor = null;

/**
 * @var {boolean} isEditorLocked - Tracks the read-only state of the editor.
 */
export let isEditorLocked = true;

/**
 * Initializes the CodeMirror editor instance from a textarea.
 * @param {string} elementId - The ID of the textarea element to replace.
 * @param {function} onChangeCallback - A callback function to execute when the editor content changes.
 * @returns {void}
 */
function initEditor(elementId, onChangeCallback) {
    if (cmEditor) return; // Prevent re-initialization

    cmEditor = CodeMirror.fromTextArea(document.getElementById(elementId), {
        lineNumbers: true,
        mode: { name: "javascript", json: true },
        theme: 'material-darker',
        lineWrapping: true,
        readOnly: isEditorLocked
    });

    document.getElementById('editor-view').style.visibility = 'visible';

    // Set an initial value to prevent a blank editor
    cmEditor.setValue('{\n  "message": "Editor initialized. Load a font to begin."\n}');

    // Attach the change event listener
    cmEditor.on('change', onChangeCallback);
}

/**
 * Toggles the read-only state of the CodeMirror editor.
 * Updates the lock button's UI accordingly.
 * @returns {void}
 */
function toggleEditorLock() {
    isEditorLocked = !isEditorLocked;
    cmEditor.setOption('readOnly', isEditorLocked);

    const btn = document.getElementById('editToggleBtn');
    btn.classList.toggle('active', !isEditorLocked);
    btn.setAttribute('data-tooltip', isEditorLocked ? 'edit file' : 'lock edition');
}

/**
 * Provides access to the CodeMirror instance.
 * @returns {object|null} The CodeMirror editor instance.
 */
function getEditorInstance() {
    return cmEditor;
}

 
 
//----------------------------------------> END [EDITOR INITIALIZATION & STATE]

export {
    initEditor,
    toggleEditorLock,
    getEditorInstance
};