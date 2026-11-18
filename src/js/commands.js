/**
 * Saim CLI - command registry
 * Every command is reachable from the palette, the native menu and shortcuts.
 */
window.Saim = window.Saim || {};

(function (Saim) {
    "use strict";

    const registry = new Map();

    function register(id, definition) {
        registry.set(id, Object.assign({ id }, definition));
    }

    function all() {
        return Array.from(registry.values());
    }

    function get(id) {
        return registry.get(id) || null;
    }

    async function run(id, payload) {
        const cmd = registry.get(id);
        if (!cmd) {
            Saim.toast(`Unknown command: ${id}`, "error");
            return;
        }
        try {
            await cmd.run(payload || {});
        } catch (err) {
            console.error(`[saim] command ${id} failed:`, err);
            Saim.toast(`Command "${cmd.title}" failed`, "error");
        }
    }

    /* ------------------------------ terminal ----------------------------- */

    register("tab:new", {
        title: "New Terminal Tab",
        keywords: "shell console bash new tab",
        shortcut: "Ctrl+Shift+T",
        run: () => {
            const tab = Saim.terminals.create({ cwd: Saim.state.cwd });
            Saim.toast(`Started ${tab.title}`, "ok");
        }
    });

    register("tab:close", {
        title: "Close Current Terminal Tab",
        keywords: "kill quit close tab",
        shortcut: "Ctrl+W",
        run: () => {
            const tab = Saim.terminals.active();
            if (tab) Saim.terminals.close(tab.id);
        }
    });

    register("tab:next", {
        title: "Next Terminal Tab",
        keywords: "switch tab",
        shortcut: "Ctrl+Tab",
        run: () => {
            const tabs = Saim.terminals.tabs();
            if (tabs.length < 2) return;
            const index = tabs.findIndex(t => t.id === Saim.state.activeTabId);
            Saim.terminals.activate(tabs[(index + 1) % tabs.length].id);
        }
    });

    register("tab:previous", {
        title: "Previous Terminal Tab",
        keywords: "switch tab",
        shortcut: "Ctrl+Shift+Tab",
        run: () => {
            const tabs = Saim.terminals.tabs();
            if (tabs.length < 2) return;
            const index = tabs.findIndex(t => t.id === Saim.state.activeTabId);
            Saim.terminals.activate(tabs[(index - 1 + tabs.length) % tabs.length].id);
        }
    });

    register("tab:rename", {
        title: "Rename Current Tab",
        keywords: "label title tab",
        run: async () => {
            const tab = Saim.terminals.active();
            if (!tab) return;
            const name = await Saim.modal.prompt("Tab title", tab.title);
            if (name) Saim.terminals.setTitle(tab.id, name);
        }
    });

    register("terminal:clear", {
        title: "Clear Terminal",
        keywords: "reset clean wipe",
        shortcut: "Ctrl+Shift+K",
        run: () => Saim.terminals.clear()
    });

    register("terminal:run", {
        title: "Run Command in Terminal",
        keywords: "execute shell command",
        run: async (payload) => {
            const cmd = payload.cmd;
            if (!cmd) return;
            let tab = Saim.terminals.active();
            if (!tab) tab = Saim.terminals.create({ cwd: Saim.state.cwd });
            await Saim.bridge.writeTerminal(tab.id, `${cmd}\r`);
            Saim.terminals.activate(tab.id);
        }
    });

    /* ------------------------------- panels ------------------------------ */

    register("sidebar:toggle", {
        title: "Toggle Sidebar",
        keywords: "explorer hide panel",
        shortcut: "Ctrl+B",
        run: () => Saim.app.setSidebar(!Saim.state.sidebarOpen)
    });

    register("sidebar:explorer", {
        title: "Show Explorer",
        keywords: "files tree",
        run: () => {
            Saim.app.setSidebar(true);
            Saim.app.setSidebarView("explorer");
        }
    });

    register("sidebar:sessions", {
        title: "Show Session",
        keywords: "terminals list",
        run: () => {
            Saim.app.setSidebar(true);
            Saim.app.setSidebarView("sessions");
        }
    });

    register("sidebar:bookmarks", {
        title: "Show Bookmarks",
        keywords: "favourites saved folders",
        run: () => {
            Saim.app.setSidebar(true);
            Saim.app.setSidebarView("bookmarks");
        }
    });

    register("dock:toggle", {
        title: "Toggle Workspace Panel",
        keywords: "assistant side panel ai actions",
        shortcut: "Ctrl+Shift+O",
        run: () => Saim.app.togglePanel()
    });

    register("statusbar:toggle", {
        title: "Toggle Status Bar",
        keywords: "bottom bar hide",
        shortcut: "Ctrl+Shift+B",
        run: () => Saim.app.setStatusbar(document.getElementById("statusbar").hidden)
    });

    /* ------------------------------ opencode ----------------------------- */

    register("opencode:open", {
        title: "Open OpenCode Panel",
        keywords: "assistant agent ai",
        run: async () => {
            Saim.nav.go("session");
            if (!Saim.opencode.isRunning()) await Saim.opencode.start();
            else Saim.opencode.focus();
        }
    });

    register("opencode:start", {
        title: "Start OpenCode",
        keywords: "assistant agent ai run",
        run: async () => {
            Saim.nav.go("session");
            await Saim.opencode.start();
        }
    });

    register("opencode:restart", {
        title: "Restart OpenCode",
        keywords: "assistant agent restart",
        run: () => Saim.opencode.restart()
    });

    register("opencode:stop", {
        title: "Stop OpenCode",
        keywords: "assistant agent kill stop",
        run: () => Saim.opencode.stop()
    });

    register("opencode:new-session", {
        title: "OpenCode: New Chat Session",
        keywords: "opencode assistant chat create session",
        run: async () => {
            Saim.nav.go("session");
            if (Saim.opencode.setMode) Saim.opencode.setMode("native");
            await Saim.opencode.createSession();
        }
    });

    register("opencode:pair", {
        title: "OpenCode: Pair Mobile Device",
        keywords: "opencode pair mobile phone connect code",
        run: async () => {
            Saim.nav.go("session");
            if (Saim.opencode.setMode) Saim.opencode.setMode("native");
            Saim.opencode.state.activeTab = "pair";
            if (Saim.opencode.render) Saim.opencode.render();
            if (Saim.opencode.pair) await Saim.opencode.pair();
        }
    });

    register("opencode:refresh", {
        title: "OpenCode: Refresh Sessions / Models / MCP",
        keywords: "opencode reload agents models mcp plugins skills",
        run: () => Saim.opencode.refreshAll()
    });

    register("opencode:mode", {
        title: "OpenCode: Toggle Native / Terminal Mode",
        keywords: "opencode tui embedded native switch",
        run: () => Saim.opencode.setMode(Saim.opencode.state.mode === "native" ? "tui" : "native")
    });

    /* ------------------------------- files ------------------------------- */

    register("folder:set", {
        title: "Set Workspace Folder",
        keywords: "cwd directory root project",
        run: async (payload) => {
            const dir = payload.path;
            if (!dir) return;
            Saim.state.cwd = dir;
            Saim.state.sidebarRoot = dir;
            Saim.explorer.setRoot(dir);
            Saim.bridge.saveSettings({ cwd: dir });
            Saim.bus.emit("cwd:changed", dir);
            Saim.toast(`Workspace: ${dir}`, "ok");
        }
    });

    register("folder:choose", {
        title: "Open Folder…",
        keywords: "workspace project directory",
        shortcut: "Ctrl+O",
        run: async () => {
            const dir = await Saim.bridge.openDirectory(Saim.state.cwd);
            if (dir) await run("folder:set", { path: dir });
        }
    });

    register("file:open", {
        title: "Open File…",
        keywords: "editor view file",
        shortcut: "Ctrl+Shift+O",
        run: async () => {
            const file = await Saim.bridge.openFile(Saim.state.cwd);
            if (file) Saim.editor.open(file);
        }
    });

    register("file:save", {
        title: "Save Current File",
        keywords: "write editor",
        shortcut: "Ctrl+S",
        run: () => Saim.editor.save()
    });

    /* --------------------------- workspace views ------------------------- */

    register("workspace:file", {
        title: "Workspace: Open File",
        keywords: "workspace view editor file open",
        run: () => Saim.workspace.show("file")
    });

    register("workspace:terminal", {
        title: "Workspace: Terminal",
        keywords: "workspace view terminal shell",
        run: () => Saim.workspace.show("terminal")
    });

    register("workspace:review", {
        title: "Workspace: Review Changes",
        keywords: "workspace view review diff git status",
        run: () => Saim.workspace.show("review")
    });

    register("workspace:browser", {
        title: "Workspace: Browser",
        keywords: "workspace view browser web url preview",
        run: () => Saim.workspace.show("browser")
    });

    register("workspace:github", {
        title: "Show GitHub Panel",
        keywords: "github git pull push commits remote token",
        run: () => {
            Saim.nav.go("github");
        }
    });

    register("workspace:hosting", {
        title: "Show Hosting Panel",
        keywords: "hosting deploy vercel netlify",
        run: () => {
            Saim.nav.go("hosting");
        }
    });

    register("workspace:chat", {
        title: "Toggle AI Panel",
        keywords: "ai opencode chat assistant",
        run: () => Saim.workspace.toggleChat()
    });

    /* ------------------------------- system ------------------------------ */

    register("monitor:open", {
        title: "Open System Monitor",
        keywords: "cpu ram processes performance",
        run: () => {
            Saim.nav.go("preferences");
        }
    });

    register("git:refresh", {
        title: "Refresh Git Status",
        keywords: "branch repository",
        run: () => Saim.statusbar.refreshGit()
    });

    register("palette:open", {
        title: "Open Command Palette",
        keywords: "search commands quick",
        shortcut: "Ctrl+Shift+P",
        run: () => Saim.palette.open()
    });

    register("settings:open", {
        title: "Open Settings",
        keywords: "preferences configuration options",
        shortcut: "Ctrl+,",
        run: () => Saim.settings.open()
    });

    register("help:shortcuts", {
        title: "Keyboard Shortcuts",
        keywords: "keys bindings help",
        run: () => Saim.settings.open()
    });

    register("help:about", {
        title: "About Saim CLI",
        keywords: "version info credits",
        run: () => Saim.settings.open()
    });

    register("app:reload", {
        title: "Reload Window",
        keywords: "refresh restart renderer",
        shortcut: "Ctrl+R",
        run: () => window.location.reload()
    });

    register("app:devtools", {
        title: "Toggle Developer Tools",
        keywords: "debug console inspect",
        run: () => Saim.bridge.toggleDevtools()
    });

    register("app:quit", {
        title: "Quit Saim CLI",
        keywords: "exit close application",
        run: () => Saim.bridge.windowAction("close")
    });

    Saim.commands = { register, all, get, run };
})(window.Saim);
