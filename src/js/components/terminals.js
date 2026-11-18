/**
 * Saim CLI - terminal tab manager
 * Owns every shell tab: the xterm instance, the pty wiring and the tab strip.
 */
window.Saim = window.Saim || {};

(function (Saim) {
    "use strict";

    const H = Saim.helpers;
    let host = null;
    let tabstrip = null;
    const panes = new Map();     // tabId -> { pane, head, cwdEl, host, fit }
    const instances = new Map(); // tabId -> xterm Terminal

    function makeTermOptions() {
        const settings = Saim.state.settings;
        const theme = Saim.themes.terminalTheme(Saim.themes.current());
        return {
            fontFamily: settings.fontFamily || "Fira Code",
            fontSize: settings.termFontSize || 14,
            cursorBlink: settings.cursorBlink !== false,
            cursorStyle: settings.cursorStyle || "block",
            allowTransparency: false,
            scrollback: settings.termScrollback || 5000,
            theme: theme,
            macOptionIsMeta: true,
            convertEol: false,
            drawBoldTextInBrightColors: true,
            minimumContrastRatio: 1
        };
    }

    function buildPane(tab) {
        const pane = H.el("div", "term-pane");
        pane.dataset.id = tab.id;

        const head = H.el("div", "term-pane__head");
        const dot = H.el("span", "dot");
        const cwdEl = H.el("span", "cwd", tab.cwd || "");
        head.appendChild(dot);
        head.appendChild(cwdEl);

        const termHost = H.el("div", "term-pane__host");
        pane.appendChild(head);
        pane.appendChild(termHost);

        host.appendChild(pane);
        panes.set(tab.id, { pane, head, cwdEl, host: termHost, fit: null });
        return panes.get(tab.id);
    }

    function createTab(opts) {
        opts = opts || {};
        const id = `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        const tab = {
            id: id,
            title: opts.title || "Terminal",
            cwd: opts.cwd || Saim.state.cwd,
            kind: "shell",
            proc: ""
        };

        const view = buildPane(tab);
        const term = new window.Terminal(makeTermOptions());
        instances.set(id, term);

        let fitAddon = null;
        try {
            if (window.FitAddon) {
                fitAddon = new window.FitAddon.FitAddon();
                term.loadAddon(fitAddon);
            }
        } catch (e) { /* addon unavailable */ }

        try {
            if (window.WebglAddon && window.WebglAddon.WebglAddon) {
                term.loadAddon(new window.WebglAddon.WebglAddon());
            }
        } catch (e) { /* software rendering fallback */ }

        try {
            if (window.LigaturesAddon && window.LigaturesAddon.LigaturesAddon) {
                term.loadAddon(new window.LigaturesAddon.LigaturesAddon());
            }
        } catch (e) { /* ligatures are optional */ }
        term.open(view.host);
        view.fit = fitAddon;

        term.onData(data => {
            Saim.bridge.writeTerminal(id, data);
        });

        term.onResize(size => {
            Saim.bridge.resizeTerminal(id, size.cols, size.rows);
        });

        term.attachCustomKeyEventHandler(event => {
            if (event.type !== "keydown") return true;
            const handled = Saim.bus.emit("terminal:key", event);
            return handled !== true;
        });

        // Right click inside the terminal gives a proper desktop menu.
        view.host.addEventListener("contextmenu", event => {
            event.preventDefault();
            const selection = term.getSelection();
            Saim.modal.contextMenu([
                {
                    label: selection ? `Copy (${selection.length} chars)` : "Copy",
                    icon: "⧉",
                    action: () => {
                        if (selection) Saim.bridge.clipboardWrite(selection);
                    }
                },
                {
                    label: "Paste",
                    icon: "📋",
                    action: async () => {
                        const text = await Saim.bridge.clipboardRead();
                        if (text) Saim.bridge.writeTerminal(id, text);
                    }
                },
                { separator: true },
                { label: "Clear terminal", icon: "⌫", action: () => term.clear() },
                { label: "New tab here", icon: "＋", action: () => createTab({ cwd: tab.cwd }) },
                { label: "Rename tab", icon: "✎", action: async () => {
                    const name = await Saim.modal.prompt("Tab title", tab.title);
                    if (name) { tab.title = name; renderTabs(); }
                } },
                { separator: true },
                { label: "Close tab", icon: "✕", danger: true, action: () => close(id) }
            ], event.clientX, event.clientY);
        });

        Saim.state.tabs.push(tab);
        Saim.state.activeTabId = id;

        Saim.bridge.createTerminal({
            id: id,
            cwd: tab.cwd,
            cols: term.cols,
            rows: term.rows
        }).then(res => {
            if (!res) {
                Saim.toast("Could not start the shell process", "error");
                return;
            }
            Saim.bridge.resizeTerminal(id, term.cols, term.rows);
        });

        activate(id);
        renderTabs();

        // Give xterm a moment to lay out, then sync the pty size.
        setTimeout(() => {
            try {
                if (fitAddon) {
                    fitAddon.fit();
                    Saim.bridge.resizeTerminal(id, term.cols, term.rows);
                }
            } catch (e) { /* pane not visible yet */ }
        }, 120);

        return tab;
    }

    function activate(id) {
        Saim.state.activeTabId = id;
        panes.forEach((view, key) => {
            view.pane.classList.toggle("is-active", key === id);
        });
        instances.forEach((term, key) => {
            if (key === id) setTimeout(() => { try { term.focus(); } catch (e) { /* noop */ } }, 30);
        });
        renderTabs();
        updateEmptyState();
        const tab = get(id);
        if (tab) {
            Saim.bus.emit("terminal:activated", tab);
        }
    }

    function close(id) {
        const index = Saim.state.tabs.findIndex(t => t.id === id);
        if (index === -1) return;
        Saim.bridge.killTerminal(id);
        const view = panes.get(id);
        if (view) {
            const term = instances.get(id);
            if (term) { try { term.dispose(); } catch (e) { /* noop */ } }
            view.pane.remove();
        }
        instances.delete(id);
        panes.delete(id);
        Saim.state.tabs.splice(index, 1);

        if (Saim.state.activeTabId === id) {
            const next = Saim.state.tabs[Math.min(index, Saim.state.tabs.length - 1)];
            Saim.state.activeTabId = next ? next.id : null;
            if (next) activate(next.id);
        }
        renderTabs();
        updateEmptyState();
        Saim.bus.emit("terminals:changed");
    }

    function get(id) {
        return Saim.state.tabs.find(t => t.id === id) || null;
    }

    function active() {
        return get(Saim.state.activeTabId);
    }

    function renderTabs() {
        if (!tabstrip) return;
        H.clear(tabstrip);
        Saim.state.tabs.forEach(tab => {
            const node = H.el("div", "tab");
            if (tab.id === Saim.state.activeTabId) node.classList.add("is-active");
            const label = H.el("span", "tab__label", tab.title);
            const closeBtn = H.el("span", "tab__close", "✕");
            closeBtn.addEventListener("click", event => {
                event.stopPropagation();
                close(tab.id);
            });
            node.appendChild(label);
            node.appendChild(closeBtn);
            node.addEventListener("click", () => activate(tab.id));
            node.addEventListener("contextmenu", event => {
                event.preventDefault();
                Saim.modal.contextMenu([
                    { label: "Rename tab", icon: "✎", action: async () => {
                        const name = await Saim.modal.prompt("Tab title", tab.title);
                        if (name) { tab.title = name; renderTabs(); }
                    } },
                    { label: "Duplicate tab", icon: "⧉", action: () => createTab({ cwd: tab.cwd }) },
                    { separator: true },
                    { label: "Close tab", icon: "✕", danger: true, action: () => close(tab.id) },
                    { label: "Close other tabs", icon: "✕", danger: true, action: () => {
                        Saim.state.tabs.filter(t => t.id !== tab.id).forEach(t => close(t.id));
                    } }
                ], event.clientX, event.clientY);
            });
            node.addEventListener("dblclick", async () => {
                const name = await Saim.modal.prompt("Tab title", tab.title);
                if (name) {
                    tab.title = name;
                    renderTabs();
                }
            });
            tabstrip.appendChild(node);
        });

        const add = H.el("button", "tab-add", "+");
        add.title = "New terminal (Ctrl+Shift+T)";
        add.addEventListener("click", () => createTab({ cwd: active() ? active().cwd : Saim.state.cwd }));
        tabstrip.appendChild(add);
    }

    function updateEmptyState() {
        const empty = document.getElementById("empty-state");
        if (!empty) return;
        empty.style.display = Saim.state.tabs.length ? "none" : "flex";
    }

    function fitAll() {
        instances.forEach(term => {
            try { term.options.fit && term.options.fit(); } catch (e) { /* noop */ }
        });
        panes.forEach(view => {
            if (!view.fit) return;
            try {
                view.fit.fit();
                if (view.pane.classList.contains("is-active")) {
                    const term = instances.get(view.pane.dataset.id);
                    if (term) Saim.bridge.resizeTerminal(view.pane.dataset.id, term.cols, term.rows);
                }
            } catch (e) { /* hidden pane */ }
        });
    }

    function write(id, data) {
        const term = instances.get(id);
        if (!term) return;
        term.write(data);
    }

    function clear() {
        const tab = active();
        if (!tab) return;
        const term = instances.get(tab.id);
        if (term) term.clear();
    }

    function setFontSize(size) {
        instances.forEach(term => { term.options.fontSize = size; });
    }

    function setFontFamily(family) {
        instances.forEach(term => { term.options.fontFamily = family; });
    }

    function refreshTheme() {
        const theme = Saim.themes.terminalTheme(Saim.themes.current());
        instances.forEach(term => { term.options.theme = theme; });
    }

    function setTitle(id, title) {
        const tab = get(id);
        if (!tab) return;
        tab.title = title;
        renderTabs();
    }

    function init() {
        host = document.getElementById("terminals");
        tabstrip = document.getElementById("tabstrip");

        window.addEventListener("resize", H.debounce(fitAll, 120));

        Saim.bus.on("terminal:data", payload => write(payload.id, payload.data));
        Saim.bus.on("terminal:exit", payload => {
            const tab = get(payload.id);
            if (tab) {
                Saim.toast(`Terminal "${tab.title}" exited (code ${payload.code})`, "warn");
            }
        });
        Saim.bus.on("terminal:cwd", payload => {
            const tab = get(payload.id);
            if (!tab) return;
            tab.cwd = payload.cwd;
            const view = panes.get(payload.id);
            if (view) view.cwdEl.textContent = payload.cwd;
            if (tab.id === Saim.state.activeTabId) {
                Saim.state.cwd = payload.cwd;
                Saim.bus.emit("cwd:changed", payload.cwd);
            }
        });
        Saim.bus.on("terminal:process", payload => {
            const tab = get(payload.id);
            if (tab) tab.proc = payload.process;
            if (tab && tab.id === Saim.state.activeTabId) {
                Saim.bus.emit("process:changed", payload.process);
            }
        });
        Saim.bus.on("theme:changed", () => refreshTheme());
        Saim.bus.on("terminals:changed", () => { renderTabs(); updateEmptyState(); });
    }

    Saim.terminals = {
        init,
        create: createTab,
        close,
        activate,
        get,
        active,
        tabs: () => Saim.state.tabs.slice(),
        renderTabs,
        fitAll,
        write,
        clear,
        refreshTheme,
        setFontSize,
        setFontFamily,
        setTitle,
        updateEmptyState
    };
})(window.Saim);
