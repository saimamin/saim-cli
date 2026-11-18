/**
 * Saim CLI - settings panel
 */
window.Saim = window.Saim || {};

(function (Saim) {
    "use strict";

    const H = Saim.helpers;

    const ACCENTS = ["#31e0c6", "#4aa8ff", "#a78bfa", "#ffb454", "#ff5f6d", "#5ee08a", "#f472b6"];

    function row(label, description, control) {
        const node = H.el("div", "setting");
        const left = H.el("div");
        left.appendChild(H.el("div", "setting__label", label));
        if (description) left.appendChild(H.el("div", "setting__desc", description));
        node.appendChild(left);
        const right = H.el("div", "setting__control");
        right.appendChild(control);
        node.appendChild(right);
        return node;
    }

    function switchControl(value, onChange) {
        const node = H.el("div", `switch${value ? " is-on" : ""}`);
        node.addEventListener("click", () => {
            const next = !node.classList.contains("is-on");
            node.classList.toggle("is-on", next);
            onChange(next);
        });
        return node;
    }

    function selectControl(options, value, onChange) {
        const node = H.el("select", "field");
        options.forEach(opt => {
            const option = H.el("option", null, opt.label);
            option.value = opt.value;
            if (opt.value === value) option.selected = true;
            node.appendChild(option);
        });
        node.addEventListener("change", () => onChange(node.value));
        return node;
    }

    function textControl(value, onChange, placeholder) {
        const node = H.el("input", "field");
        node.type = "text";
        node.value = value === undefined || value === null ? "" : value;
        if (placeholder) node.placeholder = placeholder;
        node.addEventListener("change", () => onChange(node.value));
        return node;
    }

    function rangeControl(value, min, max, step, onChange, format) {
        const wrap = H.el("div");
        wrap.style.display = "flex";
        wrap.style.alignItems = "center";
        wrap.style.gap = "10px";
        const node = H.el("input", "range");
        node.type = "range";
        node.min = min;
        node.max = max;
        node.step = step;
        node.value = value;
        const readout = H.el("span", "tag", format ? format(value) : String(value));
        node.addEventListener("input", () => {
            readout.textContent = format ? format(node.value) : node.value;
            onChange(Number(node.value));
        });
        wrap.appendChild(node);
        wrap.appendChild(readout);
        return wrap;
    }

    function swatchControl(current, onChange) {
        const wrap = H.el("div", "swatch");
        ACCENTS.forEach(color => {
            const btn = H.el("button");
            btn.style.background = color;
            if (color === current) btn.classList.add("is-active");
            btn.addEventListener("click", () => {
                wrap.querySelectorAll("button").forEach(b => b.classList.remove("is-active"));
                btn.classList.add("is-active");
                onChange(color);
            });
            wrap.appendChild(btn);
        });
        return wrap;
    }

    function buildAppearance(body) {
        const settings = Saim.state.settings;

        body.appendChild(row("Theme", "Overall colour scheme of the interface and terminals.",
            selectControl(Saim.themes.list(), settings.theme, value => {
                Saim.bridge.saveSettings({ theme: value });
                Saim.themes.apply(value);
                Saim.terminals.refreshTheme();
            })));

        body.appendChild(row("Accent colour", "Highlight colour used across the interface.",
            swatchControl(settings.accent, value => {
                document.documentElement.style.setProperty("--accent", value);
                document.documentElement.style.setProperty("--accent-dim", value.replace(")", ", 0.14)").replace("#", "rgba(") === value ? value : hexToRgba(value, 0.14));
                document.documentElement.style.setProperty("--accent-line", hexToRgba(value, 0.42));
                Saim.bridge.saveSettings({ accent: value });
            })));

        body.appendChild(row("Interface font", "Font used by the Saim CLI chrome.",
            selectControl([
                { value: "United Sans", label: "United Sans" },
                { value: "Ubuntu", label: "Ubuntu" },
                { value: "Segoe UI", label: "Segoe UI" },
                { value: "system-ui", label: "System UI" }
            ], settings.uiFont || "United Sans", value => {
                Saim.bridge.saveSettings({ uiFont: value });
                document.documentElement.style.setProperty("--font-ui", `"${value}", system-ui, sans-serif`);
            })));

        body.appendChild(row("Terminal font", "Typeface used inside the terminals.",
            selectControl([
                { value: "Fira Code", label: "Fira Code" },
                { value: "Fira Mono", label: "Fira Mono" },
                { value: "DejaVu Sans Mono", label: "DejaVu Sans Mono" },
                { value: "monospace", label: "System monospace" }
            ], settings.fontFamily || "Fira Code", value => {
                Saim.bridge.saveSettings({ fontFamily: value });
                Saim.terminals.setFontFamily(value);
            })));

        body.appendChild(row("Terminal font", "Size of the text rendered inside the terminals.",
            rangeControl(settings.termFontSize || 14, 8, 28, 1, value => {
                Saim.bridge.saveSettings({ termFontSize: value });
                Saim.terminals.setFontSize(value);
            }, value => `${value}px`)));

        body.appendChild(row("Interface scale", "Scales the whole interface up or down.",
            rangeControl(settings.uiScale || 100, 80, 140, 5, value => {
                Saim.bridge.saveSettings({ uiScale: value });
                document.documentElement.style.setProperty("--ui-scale", String(value / 100));
            }, value => `${value}%`)));
    }

    function hexToRgba(hex, alpha) {
        const clean = hex.replace("#", "");
        const full = clean.length === 3 ? clean.split("").map(c => c + c).join("") : clean;
        const num = parseInt(full, 16);
        const r = (num >> 16) & 255;
        const g = (num >> 8) & 255;
        const b = num & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function buildTerminal(body) {
        const settings = Saim.state.settings;

        const shellWrap = H.el("div");
        shellWrap.style.display = "flex";
        shellWrap.style.gap = "6px";
        const shellInput = textControl(settings.shell, value => {
            Saim.bridge.saveSettings({ shell: value });
            Saim.toast("Shell updated - new tabs will use it", "ok");
        });
        shellInput.style.flex = "1";
        const browse = H.el("button", "minibtn", "…");
        browse.addEventListener("click", async () => {
            const detected = await Saim.bridge.which(shellInput.value);
            if (detected) {
                shellInput.value = detected;
                Saim.bridge.saveSettings({ shell: detected });
            }
        });
        shellWrap.appendChild(shellInput);
        shellWrap.appendChild(browse);
        body.appendChild(row("Shell", "The shell used for new terminal sessions.", shellWrap));

        body.appendChild(row("Shell arguments", "Extra arguments passed to the shell on start.",
            textControl(settings.shellArgs, value => Saim.bridge.saveSettings({ shellArgs: value }), "--login")));

        const cwdWrap = H.el("div");
        cwdWrap.style.display = "flex";
        cwdWrap.style.gap = "6px";
        const cwdInput = textControl(settings.cwd, value => Saim.bridge.saveSettings({ cwd: value }));
        cwdInput.style.flex = "1";
        const cwdBrowse = H.el("button", "minibtn", "…");
        cwdBrowse.addEventListener("click", async () => {
            const dir = await Saim.bridge.openDirectory(settings.cwd);
            if (dir) {
                cwdInput.value = dir;
                Saim.bridge.saveSettings({ cwd: dir });
            }
        });
        cwdWrap.appendChild(cwdInput);
        cwdWrap.appendChild(cwdBrowse);
        body.appendChild(row("Working directory", "Folder new terminals and the explorer start in.", cwdWrap));

        body.appendChild(row("Cursor style", "Shape of the terminal cursor.",
            selectControl([
                { value: "block", label: "Block" },
                { value: "underline", label: "Underline" },
                { value: "bar", label: "Bar" }
            ], settings.cursorStyle, value => Saim.bridge.saveSettings({ cursorStyle: value }))));

        body.appendChild(row("Blinking cursor", "Turn the terminal cursor blinking on or off.",
            switchControl(settings.cursorBlink !== false, value => Saim.bridge.saveSettings({ cursorBlink: value }))));

        body.appendChild(row("Scrollback", "Number of lines kept in the terminal history.",
            rangeControl(settings.termScrollback || 5000, 500, 50000, 500, value =>
                Saim.bridge.saveSettings({ termScrollback: value }), value => `${value}`)));
    }

    function buildIntegrations(body) {
        const settings = Saim.state.settings;

        const wrap = H.el("div");
        wrap.style.display = "flex";
        wrap.style.gap = "6px";
        const input = textControl(settings.opencodePath, value => Saim.bridge.saveSettings({ opencodePath: value }));
        input.style.flex = "1";
        input.placeholder = "auto-detected";
        const detect = H.el("button", "minibtn", "Detect");
        detect.addEventListener("click", async () => {
            const path = await Saim.bridge.whichOpencode();
            if (path) {
                input.value = path;
                Saim.bridge.saveSettings({ opencodePath: path });
                Saim.toast(`Assistant found at ${path}`, "ok");
            } else {
                Saim.toast("Assistant was not found in PATH", "error");
            }
        });
        wrap.appendChild(input);
        wrap.appendChild(detect);
        body.appendChild(row("Assistant binary", "Path to the assistant executable used by the assistant panel.", wrap));

        body.appendChild(row("Start assistant", "Launch the assistant panel automatically on startup.",
            switchControl(!!settings.opencodeAutoStart, value => Saim.bridge.saveSettings({ opencodeAutoStart: value }))));

        const actions = H.el("div");
        actions.style.display = "flex";
        actions.style.gap = "6px";
        const openBtn = H.el("button", "ghostbtn", "Open panel");
        openBtn.addEventListener("click", () => {
            Saim.dock.setOpen(true);
            Saim.dock.setPane("opencode");
            Saim.opencode.start();
        });
        actions.appendChild(openBtn);
        body.appendChild(row("Assistant panel", "Run the assistant side by side with your terminal.", actions));
    }

    function buildWorkspace(body) {
        const settings = Saim.state.settings;

        body.appendChild(row("Show sessions", "Display the Home / Search / New session sidebar.",
            switchControl(settings.showSidebar !== false, value => {
                Saim.bridge.saveSettings({ showSidebar: value });
                Saim.app.setSidebar(value);
            })));

        body.appendChild(row("Show workspace panel", "Display the Review / Browser / Open file action panel.",
            switchControl(settings.showDock !== false, value => {
                Saim.bridge.saveSettings({ showDock: value });
                Saim.app.setPanel(value);
            })));

        body.appendChild(row("Show status bar", "Display the bottom status bar.",
            switchControl(settings.showStatusbar === true, value => {
                Saim.bridge.saveSettings({ showStatusbar: value });
                Saim.app.setStatusbar(value);
            })));

        body.appendChild(row("Restore sessions", "Reopen the previous tabs when Saim CLI starts.",
            switchControl(settings.restoreTabs !== false, value => Saim.bridge.saveSettings({ restoreTabs: value }))));
    }

    function buildShortcuts(body) {
        const table = H.el("table", "shortcut-table");
        const rows = [
            ["Command palette", "Ctrl+Shift+P"],
            ["New terminal tab", "Ctrl+Shift+T"],
            ["Close terminal tab", "Ctrl+W"],
            ["Next / previous tab", "Ctrl+Tab / Ctrl+Shift+Tab"],
            ["Toggle sidebar", "Ctrl+B"],
            ["Toggle OpenCode panel", "Ctrl+Shift+O"],
            ["Toggle status bar", "Ctrl+Shift+B"],
            ["Open settings", "Ctrl+,"],
            ["Open file", "Ctrl+O"],
            ["Open folder", "Ctrl+Shift+E"],
            ["Save file", "Ctrl+S"],
            ["Copy selection", "Ctrl+Shift+C"],
            ["Paste", "Ctrl+Shift+V"],
            ["Clear terminal", "Ctrl+Shift+K"],
            ["Fullscreen", "F11"],
            ["Reload window", "Ctrl+R"]
        ];
        rows.forEach(entry => {
            const row = H.el("tr");
            row.appendChild(H.el("td", null, entry[0]));
            row.appendChild(H.el("td", null, entry[1]));
            table.appendChild(row);
        });
        body.appendChild(table);
    }

    function buildAbout(body) {
        const info = Saim.state.info || {};
        const wrap = H.el("div", "about");
        wrap.appendChild(H.el("div", "about__logo"));
        wrap.appendChild(H.el("h2", null, "SAIM CLI"));
        wrap.appendChild(H.el("p", null, "A complete graphical desktop for the command line."));

        const meta = H.el("div", "about__meta");
        const rows = [
            ["Version", info.version || "-"],
            ["Electron", info.electron || "-"],
            ["Chromium", info.chrome || "-"],
            ["Node", info.node || "-"],
            ["Platform", `${info.platform || "-"} ${info.arch || ""}`],
            ["Home", info.home || "-"]
        ];
        rows.forEach(entry => {
            const node = H.el("div");
            node.appendChild(H.el("span", null, entry[0]));
            node.appendChild(H.el("span", null, entry[1]));
            meta.appendChild(node);
        });
        wrap.appendChild(meta);
        body.appendChild(wrap);
    }

    function buildIcons(body) {
        const settings = Saim.state.settings;

        body.appendChild(row("File icon style", "How files and folders are rendered in the explorer.",
            selectControl([
                { value: "unicode", label: "Unicode glyphs" },
                { value: "emoji", label: "Emoji" },
                { value: "nerd", label: "Nerd Font icons" },
                { value: "minimal", label: "Minimal (none)" }
            ], settings.iconStyle || "unicode", value => Saim.bridge.saveSettings({ iconStyle: value }))));

        body.appendChild(row("Show file icons", "Display an icon next to each file and folder in the explorer.",
            switchControl(settings.showFileIcons !== false, value => Saim.bridge.saveSettings({ showFileIcons: value }))));

        body.appendChild(row("Icon size", "Size of the icons in the explorer and tabs.",
            rangeControl(settings.iconSize || 13, 9, 20, 1, value => Saim.bridge.saveSettings({ iconSize: value }), value => `${value}px`)));

        body.appendChild(row("Show icons in tabs", "Display a small icon in each terminal tab.",
            switchControl(settings.showTabIcons !== false, value => Saim.bridge.saveSettings({ showTabIcons: value }))));

        body.appendChild(row("Show icons in status bar", "Display glyphs in the status bar items.",
            switchControl(settings.showStatusIcons !== false, value => Saim.bridge.saveSettings({ showStatusIcons: value }))));

        body.appendChild(row("App icon", "The Saim CLI application icon (used by the OS launcher).",
            textControl(settings.appIcon || "default", value => Saim.bridge.saveSettings({ appIcon: value }), "default")));
    }

    function buildOpencode(body) {
        const settings = Saim.state.settings;

        body.appendChild(row("Server URL", "URL of the assistant server Saim CLI connects to. Leave empty to auto-discover.",
            textControl(settings.opencodeServerUrl || "", value => Saim.bridge.saveSettings({ opencodeServerUrl: value }), "http://127.0.0.1:4096")));

        body.appendChild(row("Auto-connect", "Connect to the assistant automatically when Saim CLI starts.",
            switchControl(!!settings.opencodeAutoConnect, value => Saim.bridge.saveSettings({ opencodeAutoConnect: value }))));

        body.appendChild(row("Default mode", "How the assistant panel opens.",
            selectControl([
                { value: "native", label: "Native GUI (recommended)" },
                { value: "tui", label: "Embedded terminal (TUI)" }
            ], settings.opencodeMode || "native", value => Saim.bridge.saveSettings({ opencodeMode: value }))));

        body.appendChild(row("Show chat on startup", "Open the assistant panel when Saim CLI starts.",
            switchControl(!!settings.opencodeShowOnStart, value => Saim.bridge.saveSettings({ opencodeShowOnStart: value }))));

        const status = H.el("div", "setting__desc", stateLine());
        body.appendChild(row("Status", "Current connection state.", status));

        const actions = H.el("div");
        actions.style.display = "flex";
        actions.style.gap = "6px";
        const discover = H.el("button", "ghostbtn", "Discover server");
        discover.addEventListener("click", () => {
            if (Saim.opencode && Saim.opencode.discover) Saim.opencode.discover();
        });
        actions.appendChild(discover);
        const pair = H.el("button", "ghostbtn", "Pair a device");
        pair.addEventListener("click", () => {
            if (Saim.opencode && Saim.opencode.pair) Saim.opencode.pair();
            if (Saim.dock) { Saim.dock.setOpen(true); Saim.dock.setPane("opencode"); }
            if (Saim.opencode) Saim.opencode.setMode("native");
            Saim.opencode.state.activeTab = "pair";
            Saim.opencode.render && Saim.opencode.render();
        });
        actions.appendChild(pair);
        body.appendChild(row("Actions", "Manage the assistant connection.", actions));
    }

    function stateLine() {
        const oc = Saim.opencodeNative || (Saim.opencode && Saim.opencode.state);
        if (!oc) return "Not initialized";
        return oc.connected ? `Connected · ${oc.url} · v${oc.version || "?"}` : "Not connected";
    }

    function buildKeybindings(body) {
        const settings = Saim.state.settings;
        const table = H.el("table", "shortcut-table");
        const rows = [
            ["Command palette", "Ctrl+Shift+P", "palette:open"],
            ["New terminal tab", "Ctrl+Shift+T", "tab:new"],
            ["Close terminal tab", "Ctrl+W", "tab:close"],
            ["Next / previous tab", "Ctrl+Tab", "tab:next"],
            ["Toggle sidebar", "Ctrl+B", "sidebar:toggle"],
            ["Toggle assistant panel", "Ctrl+Shift+O", "dock:toggle"],
            ["Toggle status bar", "Ctrl+Shift+B", "statusbar:toggle"],
            ["Open settings", "Ctrl+,", "settings:open"],
            ["Open file", "Ctrl+O", "file:open"],
            ["Open folder", "Ctrl+Shift+E", "folder:choose"],
            ["Save file", "Ctrl+S", "file:save"],
            ["Copy selection", "Ctrl+Shift+C", "copy"],
            ["Paste", "Ctrl+Shift+V", "paste"],
            ["Clear terminal", "Ctrl+Shift+K", "terminal:clear"],
            ["Fullscreen", "F11", "window:fullscreen"],
            ["Reload window", "Ctrl+R", "app:reload"]
        ];
        const thead = H.el("tr");
        thead.appendChild(H.el("td", null, "Action"));
        thead.appendChild(H.el("td", null, "Binding"));
        table.appendChild(thead);
        rows.forEach(([action, binding, id]) => {
            const row = H.el("tr");
            row.appendChild(H.el("td", null, action));
            const cell = H.el("td", null, binding);
            cell.contentEditable = "true";
            cell.style.cursor = "text";
            cell.addEventListener("blur", () => {
                const value = cell.textContent.trim();
                const kb = Object.assign({}, settings.keybindings || {});
                kb[id] = value;
                Saim.bridge.saveSettings({ keybindings: kb });
                Saim.toast(`Bound ${action} to ${value}`, "ok");
            });
            row.appendChild(cell);
            table.appendChild(row);
        });
        body.appendChild(table);
        body.appendChild(H.el("div", "sidebar__hint", "Click a binding to edit it. Changes are saved automatically."));
    }

    const SECTIONS = [
        { id: "appearance", label: "Appearance", build: buildAppearance },
        { id: "icons", label: "Icons", build: buildIcons },
        { id: "terminal", label: "Terminal", build: buildTerminal },
        { id: "opencode", label: "Assistant", build: buildOpencode },
        { id: "integrations", label: "Integrations", build: buildIntegrations },
        { id: "workspace", label: "Workspace", build: buildWorkspace },
        { id: "shortcuts", label: "Shortcuts", build: buildShortcuts },
        { id: "keybindings", label: "Keybindings", build: buildKeybindings },
        { id: "about", label: "About", build: buildAbout }
    ];

    function open() {
        Saim.modal.open({
            title: "Settings",
            subtitle: "Everything is stored in your user profile and applied instantly.",
            body: (body) => {
                const nav = H.el("div", "settings-nav");
                const content = H.el("div");
                body.appendChild(nav);
                body.appendChild(content);

                const activate = id => {
                    nav.querySelectorAll("button").forEach(btn => {
                        btn.classList.toggle("is-active", btn.dataset.section === id);
                    });
                    H.clear(content);
                    const section = SECTIONS.find(s => s.id === id);
                    if (section) section.build(content);
                };

                SECTIONS.forEach(section => {
                    const btn = H.el("button", null, section.label);
                    btn.dataset.section = section.id;
                    btn.addEventListener("click", () => activate(section.id));
                    nav.appendChild(btn);
                });

                activate("appearance");
            },
            actions: [{ label: "Done", kind: "primary" }]
        });
    }

    Saim.settings = { init: () => {}, open };
})(window.Saim);
