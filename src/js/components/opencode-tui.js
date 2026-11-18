/**
 * Saim CLI - OpenCode TUI mode
 * Runs the opencode CLI inside an embedded xterm (fallback / legacy mode).
 */
window.Saim = window.Saim || {};

(function (Saim) {
    "use strict";

    const H = Saim.helpers;
    let term = null;
    let fitAddon = null;
    let hostEl = null;
    let overlayEl = null;
    let statusEl = null;
    let sessionId = null;

    function setStatus(text, kind) {
        if (statusEl) statusEl.textContent = text;
        Saim.state.opencode.status = text;
        Saim.bus.emit("opencode:status", { text, kind });
    }

    function buildTerm() {
        if (term) return term;
        hostEl = hostEl || document.getElementById("ai-chat-host") || document.getElementById("opencode-terminal");
        const theme = Saim.themes.terminalTheme(Saim.themes.current());
        term = new window.Terminal({
            fontFamily: Saim.state.settings.fontFamily || "Fira Code",
            fontSize: Math.max(11, (Saim.state.settings.termFontSize || 14) - 1),
            cursorBlink: true,
            cursorStyle: "bar",
            allowTransparency: false,
            scrollback: 5000,
            theme: theme
        });
        try {
            if (window.FitAddon) {
                fitAddon = new window.FitAddon.FitAddon();
                term.loadAddon(fitAddon);
            }
        } catch (e) { /* noop */ }
        try {
            if (window.WebglAddon && window.WebglAddon.WebglAddon) {
                term.loadAddon(new window.WebglAddon.WebglAddon());
            }
        } catch (e) { /* software rendering fallback */ }
        term.open(hostEl);
        term.onData(data => {
            if (sessionId) Saim.bridge.writeOpencode(sessionId, data);
        });
        term.onResize(size => {
            if (sessionId) Saim.bridge.resizeOpencode(sessionId, size.cols, size.rows);
        });
        window.addEventListener("resize", H.debounce(() => fit(), 150));
        return term;
    }

    function fit() {
        if (!term || !fitAddon) return;
        try {
            fitAddon.fit();
            if (sessionId) Saim.bridge.resizeOpencode(sessionId, term.cols, term.rows);
        } catch (e) { /* hidden pane */ }
    }

    async function start() {
        buildTerm();
        if (Saim.state.opencode.running) {
            Saim.toast("OpenCode is already running", "warn");
            return;
        }
        setStatus("Starting OpenCode…");
        const res = await Saim.bridge.createOpencode({
            id: `oc-${Date.now().toString(36)}`,
            cwd: Saim.state.cwd,
            cols: term.cols,
            rows: term.rows
        });
        if (!res || !res.ok) {
            setStatus(res && res.error ? res.error : "Could not start OpenCode", "error");
            Saim.toast("OpenCode could not be started - is it installed?", "error");
            if (overlayEl) overlayEl.hidden = false;
            return;
        }
        sessionId = res.id;
        Saim.state.opencode.id = sessionId;
        Saim.state.opencode.running = true;
        Saim.state.opencode.path = res.path;
        setStatus("OpenCode running", "ok");
        if (overlayEl) overlayEl.hidden = true;
        setTimeout(fit, 120);
        Saim.bus.emit("opencode:state");
    }

    async function stop() {
        if (!sessionId) return;
        await Saim.bridge.killOpencode(sessionId);
        sessionId = null;
        Saim.state.opencode.running = false;
        Saim.state.opencode.id = null;
        setStatus("OpenCode stopped");
        if (term) term.reset();
        if (overlayEl) overlayEl.hidden = false;
        Saim.bus.emit("opencode:state");
    }

    async function restart() { await stop(); await start(); }

    function show() {
        const host = document.getElementById("ai-chat-host") || document.getElementById("opencode-terminal");
        if (host) host.hidden = false;
        const native = document.getElementById("opencode-native");
        if (native) native.hidden = true;
        overlayEl = document.getElementById("opencode-overlay");
        statusEl = document.getElementById("opencode-status");
        hostEl = host;
        buildTerm();
        setTimeout(fit, 120);
    }
    function hide() {
        const host = document.getElementById("ai-chat-host") || document.getElementById("opencode-terminal");
        if (host) host.hidden = true;
        const native = document.getElementById("opencode-native");
        if (native) native.hidden = false;
    }

    function init() {
        overlayEl = document.getElementById("opencode-overlay");
        statusEl = document.getElementById("opencode-status");
        hostEl = document.getElementById("ai-chat-host") || document.getElementById("opencode-terminal");

        const startBtn = document.getElementById("opencode-start");
        if (startBtn) startBtn.addEventListener("click", start);

        Saim.bus.on("opencode:data", payload => {
            if (payload.id !== sessionId) return;
            if (!term) buildTerm();
            term.write(payload.data);
        });
        Saim.bus.on("opencode:exit", payload => {
            if (payload.id !== sessionId) return;
            sessionId = null;
            Saim.state.opencode.running = false;
            setStatus(`OpenCode exited (code ${payload.code})`, "warn");
            if (overlayEl) overlayEl.hidden = false;
            Saim.bus.emit("opencode:state");
        });
        Saim.bus.on("theme:changed", () => {
            if (term) term.options.theme = Saim.themes.terminalTheme(Saim.themes.current());
        });
    }

    Saim.opencodeTui = { init, start, stop, restart, show, hide, fit, isRunning: () => Saim.state.opencode.running };
})(window.Saim);
