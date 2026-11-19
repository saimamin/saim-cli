/**
 * Saim CLI - application bootstrap
 * Wires the interface together and owns the global keyboard handling.
 */
window.Saim = window.Saim || {};

(function (Saim) {
    "use strict";

    const H = Saim.helpers;

    const VIEW_LABELS = {
        home: "Home",
        session: "Session",
        file: "Open file",
        terminal: "Terminal",
        review: "Review",
        browser: "Browser",
        github: "GitHub",
        hosting: "Hosting",
        context: "Context",
        r2: "R2 Backup",
        preferences: "Preferences"
    };
    const WORKSPACE_VIEWS = ["file", "terminal", "review", "browser"];
    const COMPACT = () => window.matchMedia("(max-width: 1024px)").matches;

    /* ------------------------------------------------------------------ */
    /* Layout helpers                                                       */
    /* ------------------------------------------------------------------ */

    function applySidebarClasses() {
        const app = document.getElementById("app");
        if (!app) return;
        const open = Saim.state.sidebarOpen !== false;
        app.classList.toggle("sidebar-open", open);
        app.classList.toggle("sidebar-hidden", !COMPACT() && !open);
        const btn = document.getElementById("btn-sessions");
        if (btn) btn.classList.toggle("is-active", open);
    }

    function setSidebar(open) {
        Saim.state.sidebarOpen = open;
        applySidebarClasses();
        const btn = document.getElementById("btn-sessions");
        if (btn) btn.classList.toggle("is-active", open);
        syncOverlayState();
        setTimeout(() => Saim.terminals.fitAll(), 220);
    }

    function setPanel(open) {
        Saim.state.panelOpen = open;
        const app = document.getElementById("app");
        if (!app) return;
        if (COMPACT()) {
            app.classList.toggle("panel-open", open);
        } else {
            app.classList.toggle("panel-hidden", !open);
        }
        const btn = document.getElementById("btn-panel");
        if (btn) btn.classList.toggle("is-active", open);
        syncOverlayState();
        setTimeout(() => Saim.terminals.fitAll(), 220);
    }

    function togglePanel() {
        if (COMPACT()) setPanel(!Saim.state.panelOpen);
        else setPanel(document.getElementById("app").classList.contains("panel-hidden"));
    }

    function syncOverlayState() {
        const app = document.getElementById("app");
        if (!app) return;
        const scrim = document.getElementById("scrim");
        if (!scrim) return;
        const compact = COMPACT();
        const open = compact && (app.classList.contains("sidebar-open") || app.classList.contains("panel-open"));
        scrim.hidden = !open;
    }

    function closeOverlays() {
        const app = document.getElementById("app");
        if (!app) return;
        app.classList.remove("panel-open");
        app.classList.remove("sidebar-open");
        Saim.state.panelOpen = false;
        if (COMPACT()) Saim.state.sidebarOpen = false;
        applySidebarClasses();
        syncOverlayState();
    }

    /* ------------------------------------------------------------------ */
    /* Navigation                                                          */
    /* ------------------------------------------------------------------ */

    function renderTabs() {
        const host = document.getElementById("ws-tabs");
        if (!host) return;
        H.clear(host);

        const state = (Saim.opencode && Saim.opencode.state) || {};
        const active = (state.sessions || []).find(session => session.id === state.activeSessionId);
        const defs = [
            { view: "session", label: active ? (active.title || "Session") : "Session" },
            { view: "context", label: "Context" },
            { view: "r2", label: "R2 Backup" },
            { view: "home", label: "Home" },
            { view: "review", label: "Review" },
            { view: "browser", label: "Browser" },
            { view: "file", label: "Open file" },
            { view: "terminal", label: "Terminal" }
        ];

        defs.forEach(def => {
            const btn = H.el("button", `sptab${Saim.state.view === def.view ? " is-active" : ""}`);
            btn.type = "button";
            btn.appendChild(H.el("span", null, def.label));
            btn.title = def.label;
            btn.addEventListener("click", () => go(def.view));
            host.appendChild(btn);
        });
    }

    function updateTitle() {
        const view = Saim.state.view;
        const title = document.getElementById("tb-title");
        if (!title) return;
        if (view === "session") {
            const state = (Saim.opencode && Saim.opencode.state) || {};
            const active = (state.sessions || []).find(session => session.id === state.activeSessionId);
            title.textContent = active
                ? `${H.basename(Saim.state.cwd) || "saim"} — ${active.title || "Session"}`
                : "Saim CLI";
            if (Saim.home) Saim.home.renderSessionHeader();
            return;
        }
        title.textContent = view === "home" ? "Saim CLI" : (VIEW_LABELS[view] || "Saim CLI");
    }

    /**
     * The single navigation entry point. Every pane lives in the stage; the
     * sidebar links, panel rows, tabs and keyboard shortcuts all call this.
     */
    function go(view, opts) {
        opts = opts || {};
        const PANEL_VIEWS = ["context"]; // views that live in the right panel, not the stage
        const panes = Array.from(document.querySelectorAll(".stage > .pane"));
        if (!PANEL_VIEWS.includes(view) && !panes.some(pane => pane.dataset.pane === view)) view = "home";
        Saim.state.view = view;

        // Context is a right-panel view: leave the session showing in the stage.
        const stagePane = PANEL_VIEWS.includes(view) ? "session" : view;
        panes.forEach(pane => pane.classList.toggle("is-active", pane.dataset.pane === stagePane));

        document.querySelectorAll(".sb__link[data-nav], .sb__tool[data-nav]").forEach(el => {
            el.classList.toggle("is-active", el.dataset.nav === view);
        });
        document.querySelectorAll(".sp__row").forEach(el => {
            const target = el.dataset.ws || el.dataset.nav;
            el.classList.toggle("is-active", target === view && target !== "session");
        });
        const ctxBody = document.getElementById("context-body");
        const rowsEl = document.getElementById("ws-rows");
        if (ctxBody) ctxBody.hidden = view !== "context";
        if (rowsEl) rowsEl.hidden = view === "context";
        document.querySelectorAll(".sptab").forEach(el => {
            const target = el.dataset.view;
            if (target) el.classList.toggle("is-active", target === view);
        });

        // Home and Preferences are full-width pages in the reference layout.
        if (!COMPACT()) {
            const app = document.getElementById("app");
            const wantsPanel = view !== "home" && view !== "preferences";
            if (app) app.classList.toggle("panel-hidden", !wantsPanel);
            if (app && wantsPanel) app.classList.remove("panel-hidden");
        }

        if (view === "home" && Saim.home) Saim.home.render();
        if (view === "github" && Saim.github) Saim.github.render();
        if (view === "hosting" && Saim.hosting) Saim.hosting.render();
        if (view === "r2" && Saim.r2) Saim.r2.render();
        if (view === "preferences" && Saim.prefs) Saim.prefs.sync();

        if (!opts.skipWorkspace && WORKSPACE_VIEWS.includes(view) && Saim.workspace) {
            Saim.workspace.show(view, { fromNav: true, keepChat: true });
        }

        // On compact widths the panel is a sheet. Context lives in that panel,
        // so open it there; other stage views tuck the sheet away.
        if (COMPACT()) {
            const app = document.getElementById("app");
            if (view === "context") {
                if (app) app.classList.add("panel-open");
                Saim.state.panelOpen = true;
            } else if (opts.skipWorkspace || !WORKSPACE_VIEWS.includes(view)) {
                if (app) app.classList.remove("panel-open");
                Saim.state.panelOpen = false;
            }
            syncOverlayState();
        }

        updateTitle();
        renderTabs();
        Saim.bus.emit("nav:changed", view);
    }

    /** Legacy helper kept for commands / menus. */
    function setSidebarView(view) {
        const map = {
            explorer: "file",
            files: "file",
            github: "github",
            hosting: "hosting",
            r2: "r2",
            sessions: "session",
            bookmarks: "home",
            home: "home",
            preferences: "preferences"
        };
        go(map[view] || view || "home");
    }

    function setStatusbar(visible) {
        const bar = document.getElementById("statusbar");
        if (!bar) return;
        bar.hidden = !visible;
        document.documentElement.style.setProperty("--statusbar-h", visible ? "26px" : "0px");
    }

    /* ------------------------------------------------------------------ */
    /* Settings                                                            */
    /* ------------------------------------------------------------------ */

    function applySettings(settings) {
        Saim.state.settings = settings || {};

        Saim.themes.apply(Saim.state.settings.theme || "saim-cli");

        const accent = Saim.state.settings.accent;
        if (accent) {
            document.documentElement.style.setProperty("--accent", accent);
            document.documentElement.style.setProperty("--accent-dim", hexToRgba(accent, 0.14));
            document.documentElement.style.setProperty("--accent-line", hexToRgba(accent, 0.42));
        }
        if (Saim.state.settings.uiFont) {
            document.documentElement.style.setProperty("--font-ui", `"${Saim.state.settings.uiFont}", system-ui, sans-serif`);
        }
        document.documentElement.style.setProperty("--ui-scale", String((Saim.state.settings.uiScale || 100) / 100));

        setStatusbar(Saim.state.settings.showStatusbar === true);

        if (Saim.state.bootComplete && Saim.home) Saim.home.render();
        if (Saim.state.bootComplete && Saim.prefs) Saim.prefs.sync();
    }

    function hexToRgba(hex, alpha) {
        const clean = (hex || "#4c8dff").replace("#", "");
        const full = clean.length === 3 ? clean.split("").map(c => c + c).join("") : clean;
        const num = parseInt(full, 16);
        return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
    }

    /* ------------------------------------------------------------------ */
    /* Keyboard                                                            */
    /* ------------------------------------------------------------------ */

    function isTerminalKey(event, combo) {
        const parts = combo.toLowerCase().split("+");
        const needCtrl = parts.includes("ctrl");
        const needShift = parts.includes("shift");
        const needAlt = parts.includes("alt");
        const key = parts[parts.length - 1];
        if (Boolean(event.ctrlKey) !== needCtrl) return false;
        if (Boolean(event.shiftKey) !== needShift) return false;
        if (Boolean(event.altKey) !== needAlt) return false;
        return event.key.toLowerCase() === key;
    }

    function onKeyDown(event) {
        if (Saim.palette.isOpen() || Saim.modal.isOpen()) return;

        // Saim CLI view shortcuts
        if (event.ctrlKey && event.altKey && !event.shiftKey) {
            const key = event.key.toLowerCase();
            const map = { r: "review", b: "browser", p: "file", t: "terminal", n: "session", h: "home" };
            if (map[key]) {
                go(map[key]);
                if (key === "n" && Saim.home) Saim.home.newSession();
                event.preventDefault();
                return;
            }
            if (key === "," || key === "s") {
                go("preferences");
                event.preventDefault();
                return;
            }
        }

        if (event.key === "Escape") {
            const scrim = document.getElementById("scrim");
            if (scrim && !scrim.hidden) {
                closeOverlays();
                return;
            }
            if (Saim.editor && Saim.editor.current) {
                Saim.editor.hide();
                return;
            }
        }

        if (isTerminalKey(event, "ctrl+b")) {
            setSidebar(!Saim.state.sidebarOpen);
            event.preventDefault();
            return;
        }

        if (isTerminalKey(event, "ctrl+shift+v")) {
            Saim.bridge.clipboardRead().then(text => {
                if (!text) return;
                const tab = Saim.terminals.active();
                if (tab) Saim.bridge.writeTerminal(tab.id, text);
            });
            event.preventDefault();
            return;
        }

        if (isTerminalKey(event, "ctrl+shift+c")) {
            const tab = Saim.terminals.active();
            if (tab) {
                const selection = window.getSelection ? window.getSelection().toString() : "";
                if (selection) Saim.bridge.clipboardWrite(selection);
            }
            event.preventDefault();
            return;
        }

        if (isTerminalKey(event, "f11")) {
            Saim.bridge.windowAction("fullscreen");
            event.preventDefault();
        }
    }

    /* ------------------------------------------------------------------ */
    /* Boot                                                                */
    /* ------------------------------------------------------------------ */

    async function boot() {
        const settings = await Saim.bridge.getSettings();
        const info = await Saim.bridge.appInfo();
        Saim.state.info = info || {};
        applySettings(settings || {});

        const version = document.getElementById("brand-version");
        if (version && info && info.version) version.textContent = `v${info.version}`;

        // Components
        Saim.terminals.init();
        Saim.explorer.init();
        Saim.editor.init();
        Saim.workspace.init();
        Saim.github.init();
        Saim.hosting.init();
        Saim.opencode.init();
        Saim.monitors.init();
        Saim.dock.init();
        Saim.statusbar.init();
        Saim.home.init();
        Saim.context.init();
        Saim.r2.init();
        Saim.prefs.init();
        Saim.bus.on("opencode:render", updateTitle);
        Saim.palette.init();
        Saim.modal.init();

        // Compact layouts start with the side panels tucked away.
        Saim.state.sidebarOpen = !COMPACT();
        Saim.state.panelOpen = !COMPACT();
        applySidebarClasses();
        syncOverlayState();
        const panelBtn = document.getElementById("btn-panel");
        if (panelBtn) panelBtn.classList.toggle("is-active", !COMPACT());

        // Navigation (delegated: sidebar links, panel rows, tabs, wireframes)
        document.addEventListener("click", event => {
            const navTarget = event.target.closest("[data-nav]");
            if (navTarget && navTarget.dataset.nav) {
                go(navTarget.dataset.nav);
                return;
            }
            const wsTarget = event.target.closest("[data-ws]");
            if (wsTarget && wsTarget.dataset.ws) {
                go(wsTarget.dataset.ws);
            }
        });

        document.getElementById("btn-sessions").addEventListener("click", () => setSidebar(!Saim.state.sidebarOpen));
        document.getElementById("btn-panel").addEventListener("click", togglePanel);

        const scrim = document.getElementById("scrim");
        if (scrim) scrim.addEventListener("click", closeOverlays);

        window.addEventListener("resize", () => {
            if (!COMPACT()) {
                document.getElementById("app").classList.remove("panel-open");
                document.getElementById("app").classList.remove("sidebar-open");
                syncOverlayState();
            }
            setTimeout(() => Saim.terminals.fitAll(), 120);
        });

        // Title bar actions
        document.getElementById("btn-palette").addEventListener("click", () => Saim.palette.open());
        document.getElementById("btn-settings").addEventListener("click", () => go("preferences"));

        Saim.bridge.on("app:command", payload => {
            const map = {
                "tab:new": "tab:new",
                "tab:close": "tab:close",
                "tab:next": "tab:next",
                "tab:previous": "tab:previous",
                "tab:rename": "tab:rename",
                "folder:open": "folder:choose",
                "file:open": "file:open",
                "file:save": "file:save",
                "app:reload": "app:reload",
                "settings:open": "settings:open",
                "palette:open": "palette:open",
                "sidebar:toggle": "sidebar:toggle",
                "dock:toggle": "dock:toggle",
                "statusbar:toggle": "statusbar:toggle",
                "app:devtools": "app:devtools",
                "opencode:open": "opencode:open",
                "opencode:restart": "opencode:restart",
                "monitor:open": "monitor:open",
                "terminal:clear": "terminal:clear",
                "terminal:split": "tab:new",
                "help:shortcuts": "help:shortcuts",
                "help:about": "help:about"
            };
            const id = map[payload.command];
            if (id) Saim.commands.run(id, payload.payload);
            if (payload.command === "window:fullscreen") Saim.bridge.windowAction("fullscreen");
        });

        Saim.bridge.on("settings:changed", next => applySettings(next));

        [
            "terminal:data", "terminal:exit", "terminal:cwd", "terminal:process",
            "opencode:data", "opencode:exit"
        ].forEach(channel => {
            Saim.bridge.on(channel, payload => Saim.bus.emit(channel, payload));
        });

        Saim.bridge.on("window:state", ({ maximized }) => {
            const btn = document.getElementById("win-max");
            if (btn) btn.title = maximized ? "Restore" : "Maximize";
        });

        Saim.bus.on("terminal:key", event => {
            if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "v") {
                Saim.bridge.clipboardRead().then(text => {
                    const tab = Saim.terminals.active();
                    if (text && tab) Saim.bridge.writeTerminal(tab.id, text);
                });
                return true;
            }
            if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "c") {
                const selection = window.getSelection ? window.getSelection().toString() : "";
                if (selection) Saim.bridge.clipboardWrite(selection);
                return true;
            }
            return false;
        });

        document.addEventListener("keydown", onKeyDown);

        // Drag & drop folders or files onto the window.
        document.addEventListener("dragover", event => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
        });
        document.addEventListener("drop", async event => {
            event.preventDefault();
            const file = event.dataTransfer.files && event.dataTransfer.files[0];
            if (!file) return;
            const droppedPath = window.saim.getPathForFile(file);
            if (!droppedPath) return;
            const stat = await Saim.bridge.stat(droppedPath);
            if (!stat) return;
            if (stat.dir) {
                await Saim.commands.run("folder:set", { path: droppedPath });
                const tab = Saim.terminals.create({ cwd: droppedPath, title: H.basename(droppedPath) });
                Saim.terminals.activate(tab.id);
            } else {
                Saim.editor.open(droppedPath);
            }
        });

        // Workspace
        Saim.state.cwd = (settings && settings.cwd) || Saim.state.cwd;
        setStatusbar(settings.showStatusbar === true);

        // Restore the previous session
        const saved = await Saim.bridge.getState();
        if (saved && saved.bookmarks) {
            Saim.state.bookmarks = saved.bookmarks;
        }
        const restore = settings.restoreTabs !== false && saved && Array.isArray(saved.tabs) && saved.tabs.length;
        if (restore) {
            saved.tabs.forEach(tab => {
                Saim.terminals.create({ cwd: tab.cwd, title: tab.title });
            });
        } else {
            Saim.terminals.create({ cwd: Saim.state.cwd, title: "Terminal" });
        }

        Saim.bus.on("terminals:changed", () => {
            Saim.bridge.saveState({
                tabs: Saim.terminals.tabs().map(tab => ({ cwd: tab.cwd, title: tab.title }))
            });
        });

        // Start on the AI session view: the composer is the main screen.
        go("session");

        Saim.state.bootComplete = true;
        Saim.bus.emit("app:ready");
        Saim.toast("Saim CLI ready", "ok");
    }

    Saim.app = {
        boot,
        go,
        setSidebar,
        setSidebarView,
        setPanel,
        togglePanel,
        setStatusbar,
        applySettings
    };
    Saim.nav = { go, setSidebarView, togglePanel };
    Saim.layout = { sync: syncOverlayState, close: closeOverlays };

    document.addEventListener("DOMContentLoaded", () => {
        boot().catch(err => {
            console.error("[saim] boot failed:", err);
            Saim.toast("Saim CLI failed to start - see the console", "error");
        });
    });
})(window.Saim);
