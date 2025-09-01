/**
 * Project: Three.js JSON Font Editor
 * File: editor/js/editor-config.js
 * Created: 2025-08-29
 * Author:  @lewopxd
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
        readOnly: false // The editor is always editable; state is managed by AppState
    });

    document.getElementById('editor-view').style.visibility = 'visible';

    // Set an initial value to prevent a blank editor
    cmEditor.setValue('{\n  "message": "Editor initialized. Load a font to begin."\n}');

    // Attach the change event listener
    cmEditor.on('change', onChangeCallback);
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
    getEditorInstance
};