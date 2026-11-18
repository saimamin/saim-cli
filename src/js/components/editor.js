/**
 * Saim CLI - file viewer / editor
 */
window.Saim = window.Saim || {};

(function (Saim) {
    "use strict";

    let current = null;      // { path, content, dirty }
    let rootEl = null;
    let pathEl = null;
    let bodyEl = null;

    function show() {
        if (!rootEl) return;
        rootEl.hidden = false;
    }

    function hide() {
        if (!rootEl) return;
        rootEl.hidden = true;
        current = null;
    }

    async function open(path) {
        const res = await Saim.bridge.readFile(path);
        if (!res) return;
        if (res.binary) {
            Saim.toast("Binary file - opening in the terminal instead", "warn");
            Saim.commands.run("terminal:run", { cmd: `file "${path}"` });
            return;
        }
        current = { path: path, content: res.content, dirty: false };
        if (pathEl) pathEl.textContent = path;
        if (bodyEl) bodyEl.value = res.content;
        show();
        // Opening a file always brings the workspace's file view forward.
        if (Saim.workspace && Saim.workspace.show) Saim.workspace.show("file");
    }

    async function save() {
        if (!current) {
            Saim.toast("No file is open", "warn");
            return;
        }
        const res = await Saim.bridge.writeFile(current.path, bodyEl.value);
        if (res) {
            current.dirty = false;
            Saim.toast(`Saved ${H_basename(current.path)}`, "ok");
        }
    }

    function H_basename(p) {
        return (p || "").split("/").filter(Boolean).pop();
    }

    function init() {
        rootEl = document.getElementById("editor");
        pathEl = document.getElementById("editor-path");
        bodyEl = document.getElementById("editor-body");

        document.getElementById("editor-close").addEventListener("click", hide);
        document.getElementById("editor-save").addEventListener("click", save);

        bodyEl.addEventListener("keydown", event => {
            if (event.key === "Tab") {
                event.preventDefault();
                const start = bodyEl.selectionStart;
                const end = bodyEl.selectionEnd;
                bodyEl.value = bodyEl.value.substring(0, start) + "    " + bodyEl.value.substring(end);
                bodyEl.selectionStart = bodyEl.selectionEnd = start + 4;
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                save();
            }
        });
    }

    Saim.editor = { init, open, save, hide, get current() { return current; } };
})(window.Saim);
