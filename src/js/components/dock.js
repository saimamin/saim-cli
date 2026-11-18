/**
 * Saim CLI - dock compatibility shim
 * ---------------------------------------------------------------------------
 * The right-hand dock was replaced by the OpenCode action panel. The chat now
 * lives in the session pane, so legacy dock commands simply navigate there.
 */
window.Saim = window.Saim || {};

(function (Saim) {
    "use strict";

    function setOpen(open) {
        Saim.state.dockOpen = !!open;
        if (open) setPane("opencode");
    }

    function setPane(name) {
        Saim.state.dockTab = name;
        if (name === "opencode" && Saim.nav) Saim.nav.go("session");
        if (name === "monitor" && Saim.nav) Saim.nav.go("preferences");
    }

    function toggle() {
        if (Saim.app && Saim.app.togglePanel) Saim.app.togglePanel();
    }

    function init() {
        // Nothing to wire: the legacy dock markup is hidden.
    }

    Saim.dock = { init, setOpen, toggle, setPane };
})(window.Saim);
