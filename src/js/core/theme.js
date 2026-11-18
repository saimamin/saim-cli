/**
 * Saim CLI - theming
 * Every theme carries the UI palette (CSS variables) and the xterm palette.
 */
window.Saim = window.Saim || {};

(function (Saim) {
    "use strict";

    const THEMES = {
        "saim-dark": {
            label: "Saim Dark",
            mode: "dark",
            ui: {
                "--bg-0": "#070a0f", "--bg-1": "#0a0e14", "--bg-2": "#0e141d", "--bg-3": "#131b26",
                "--bg-4": "#18222f", "--line": "#1e2a38", "--line-soft": "#17212c",
                "--fg-0": "#e6edf5", "--fg-1": "#a9b6c6", "--fg-2": "#6f7f92", "--fg-3": "#4a5768",
                "--accent": "#31e0c6", "--accent-2": "#4aa8ff",
                "--accent-dim": "rgba(49,224,198,0.14)", "--accent-line": "rgba(49,224,198,0.42)",
                "--danger": "#ff5f6d", "--warn": "#ffc857", "--ok": "#5ee08a",
                "--radius": "18px", "--radius-sm": "12px",
                "--font-ui": "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"SF Pro Display\", \"Helvetica Neue\", \"Segoe UI\", Roboto, Ubuntu, sans-serif",
                "--font-mono": "ui-monospace, \"SF Mono\", SFMono-Regular, Menlo, Consolas, monospace",
                "--shadow-lg": "0 24px 70px rgba(0,0,0,0.65)", "--shadow-md": "0 10px 30px rgba(0,0,0,0.45)",
                "--shadow-sm": "0 4px 14px rgba(0,0,0,0.45)",
                "--glass-bg": "rgba(7,10,15,0.72)", "--glass-bg-strong": "rgba(10,14,20,0.78)", "--glass-border": "rgba(49,224,198,0.14)"
            },
            term: {
                foreground: "#d5e2f0", background: "#070a0f", cursor: "#31e0c6", cursorAccent: "#04120f",
                selection: "rgba(49,224,198,0.28)",
                black: "#0b1119", red: "#ff5f6d", green: "#5ee08a", yellow: "#ffc857",
                blue: "#4aa8ff", magenta: "#c792ea", cyan: "#31e0c6", white: "#c8d5e2",
                brightBlack: "#4a5768", brightRed: "#ff818c", brightGreen: "#8ff0b0",
                brightYellow: "#ffdc8c", brightBlue: "#84c2ff", brightMagenta: "#dcb4ff",
                brightCyan: "#6ff2de", brightWhite: "#f2f8ff"
            }
        },
        "saim-midnight": {
            label: "Saim Midnight",
            mode: "dark",
            ui: {
                "--bg-0": "#08080f", "--bg-1": "#0b0b14", "--bg-2": "#10101c", "--bg-3": "#161628",
                "--bg-4": "#1d1d33", "--line": "#262642", "--line-soft": "#1c1c31",
                "--fg-0": "#e8e6f7", "--fg-1": "#b0acd0", "--fg-2": "#767197", "--fg-3": "#514c73",
                "--accent": "#a78bfa", "--accent-2": "#f472b6",
                "--accent-dim": "rgba(167,139,250,0.16)", "--accent-line": "rgba(167,139,250,0.45)",
                "--danger": "#f76d8b", "--warn": "#f5d16c", "--ok": "#6ee7a8",
                "--radius": "18px", "--radius-sm": "12px",
                "--font-ui": "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"SF Pro Display\", \"Helvetica Neue\", \"Segoe UI\", Roboto, Ubuntu, sans-serif",
                "--font-mono": "ui-monospace, \"SF Mono\", SFMono-Regular, Menlo, Consolas, monospace",
                "--shadow-lg": "0 24px 70px rgba(0,0,0,0.65)", "--shadow-md": "0 10px 30px rgba(0,0,0,0.55)",
                "--shadow-sm": "0 4px 14px rgba(0,0,0,0.55)",
                "--glass-bg": "rgba(8,8,15,0.72)", "--glass-bg-strong": "rgba(11,11,20,0.78)", "--glass-border": "rgba(167,139,250,0.16)"
            },
            term: {
                foreground: "#dcd9f5", background: "#08080f", cursor: "#a78bfa", cursorAccent: "#0b0b14",
                selection: "rgba(167,139,250,0.3)",
                black: "#12121f", red: "#f76d8b", green: "#6ee7a8", yellow: "#f5d16c",
                blue: "#6ea8fe", magenta: "#c4a2fc", cyan: "#67e8f9", white: "#c3c0e0",
                brightBlack: "#5b5780", brightRed: "#ff92a8", brightGreen: "#96f2c0",
                brightYellow: "#ffe08a", brightBlue: "#92c4ff", brightMagenta: "#dcc0ff",
                brightCyan: "#8df1ff", brightWhite: "#f4f2ff"
            }
        },
        "saim-amber": {
            label: "Saim Amber",
            mode: "dark",
            ui: {
                "--bg-0": "#0d0904", "--bg-1": "#120d06", "--bg-2": "#181108", "--bg-3": "#20170c",
                "--bg-4": "#2a1f11", "--line": "#3a2c18", "--line-soft": "#2b2011",
                "--fg-0": "#f7e9d0", "--fg-1": "#c9b18c", "--fg-2": "#93795a", "--fg-3": "#6b5539",
                "--accent": "#ffb454", "--accent-2": "#ff8a3d",
                "--accent-dim": "rgba(255,180,84,0.15)", "--accent-line": "rgba(255,180,84,0.45)",
                "--danger": "#ff7a5c", "--warn": "#ffb454", "--ok": "#b6d07a",
                "--radius": "18px", "--radius-sm": "12px",
                "--font-ui": "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"SF Pro Display\", \"Helvetica Neue\", \"Segoe UI\", Roboto, Ubuntu, sans-serif",
                "--font-mono": "ui-monospace, \"SF Mono\", SFMono-Regular, Menlo, Consolas, monospace",
                "--shadow-lg": "0 24px 70px rgba(0,0,0,0.65)", "--shadow-md": "0 10px 30px rgba(0,0,0,0.55)",
                "--shadow-sm": "0 4px 14px rgba(0,0,0,0.55)",
                "--glass-bg": "rgba(13,9,4,0.72)", "--glass-bg-strong": "rgba(18,13,6,0.78)", "--glass-border": "rgba(255,180,84,0.16)"
            },
            term: {
                foreground: "#ffca85", background: "#0d0904", cursor: "#ffb454", cursorAccent: "#120d06",
                selection: "rgba(255,180,84,0.28)",
                black: "#1b1409", red: "#ff7a5c", green: "#b6d07a", yellow: "#ffb454",
                blue: "#7fb4d9", magenta: "#d59ad6", cyan: "#7fd8c8", white: "#e6cfa8",
                brightBlack: "#7a6448", brightRed: "#ff9d85", brightGreen: "#cfe8a0",
                brightYellow: "#ffd08f", brightBlue: "#a5d1ee", brightMagenta: "#e9bce9",
                brightCyan: "#a6ece0", brightWhite: "#fff3dc"
            }
        },
        "saim-light": {
            label: "Saim Light",
            mode: "light",
            ui: {
                "--bg-0": "#f4f7fa", "--bg-1": "#eaeff5", "--bg-2": "#ffffff", "--bg-3": "#f0f4f8",
                "--bg-4": "#e3eaf1", "--line": "#d3dde7", "--line-soft": "#e4ebf2",
                "--fg-0": "#16212c", "--fg-1": "#3d4c5c", "--fg-2": "#66768a", "--fg-3": "#8c9aab",
                "--accent": "#0f9b86", "--accent-2": "#2f6fd0",
                "--accent-dim": "rgba(15,155,134,0.12)", "--accent-line": "rgba(15,155,134,0.4)",
                "--danger": "#d64550", "--warn": "#b3820f", "--ok": "#2f9e5c",
                "--radius": "18px", "--radius-sm": "12px",
                "--font-ui": "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"SF Pro Display\", \"Helvetica Neue\", \"Segoe UI\", Roboto, Ubuntu, sans-serif",
                "--font-mono": "ui-monospace, \"SF Mono\", SFMono-Regular, Menlo, Consolas, monospace",
                "--shadow-lg": "0 24px 70px rgba(0,0,0,0.16)", "--shadow-md": "0 10px 30px rgba(0,0,0,0.10)",
                "--shadow-sm": "0 4px 14px rgba(0,0,0,0.08)",
                "--glass-bg": "rgba(244,247,250,0.72)", "--glass-bg-strong": "rgba(234,239,245,0.78)", "--glass-border": "rgba(22,33,44,0.08)"
            },
            term: {
                foreground: "#22303c", background: "#f7fafc", cursor: "#0f9b86", cursorAccent: "#ffffff",
                selection: "rgba(15,155,134,0.22)",
                black: "#20303c", red: "#d64550", green: "#2f9e5c", yellow: "#b3820f",
                blue: "#2f6fd0", magenta: "#8b4fbf", cyan: "#0f9b86", white: "#c7d3dd",
                brightBlack: "#66768a", brightRed: "#ef6b74", brightGreen: "#49bd74",
                brightYellow: "#d9a52c", brightBlue: "#4f8ce8", brightMagenta: "#a86fd6",
                brightCyan: "#31b7a2", brightWhite: "#eef4f9"
            }
        },
        "saim-cli": {
            label: "Saim CLI Dark",
            mode: "dark",
            ui: {
                "--bg-0": "#08080a", "--bg-1": "#0b0b0d", "--bg-2": "#141416", "--bg-3": "#17171a",
                "--bg-4": "#202025", "--line": "#26262b", "--line-soft": "#1c1c20",
                "--fg-0": "#e9e9ee", "--fg-1": "#a7a7b0", "--fg-2": "#7d7d87", "--fg-3": "#55555f",
                "--accent": "#4c8dff", "--accent-2": "#7aa7ff",
                "--accent-dim": "rgba(76,141,255,0.14)", "--accent-line": "rgba(76,141,255,0.45)",
                "--danger": "#ff6b6b", "--warn": "#e3b341", "--ok": "#58c97a",
                "--radius": "14px", "--radius-sm": "10px",
                "--font-ui": "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"SF Pro Display\", \"Inter\", \"Helvetica Neue\", \"Segoe UI\", Roboto, Ubuntu, sans-serif",
                "--font-mono": "ui-monospace, \"SF Mono\", SFMono-Regular, Menlo, Consolas, monospace",
                "--shadow-lg": "0 28px 80px rgba(0,0,0,0.72)", "--shadow-md": "0 12px 34px rgba(0,0,0,0.55)",
                "--shadow-sm": "0 4px 16px rgba(0,0,0,0.45)",
                "--glass-bg": "rgba(8,8,10,0.78)", "--glass-bg-strong": "rgba(11,11,13,0.86)", "--glass-border": "rgba(255,255,255,0.06)"
            },
            term: {
                foreground: "#d7d7de", background: "#0b0b0d", cursor: "#4c8dff", cursorAccent: "#08080a",
                selection: "rgba(76,141,255,0.26)",
                black: "#141416", red: "#ff6b6b", green: "#58c97a", yellow: "#e3b341",
                blue: "#4c8dff", magenta: "#b48bff", cyan: "#56c8d8", white: "#c9c9d1",
                brightBlack: "#5c5c66", brightRed: "#ff8c8c", brightGreen: "#7fdb9c",
                brightYellow: "#f0cb66", brightBlue: "#7aa7ff", brightMagenta: "#c9aaff",
                brightCyan: "#84e0ec", brightWhite: "#f2f2f6"
            }
        },
        "apple": {
            label: "Apple",
            mode: "light",
            ui: {
                "--bg-0": "#f5f5f7",
                "--bg-1": "#ffffff",
                "--bg-2": "#f5f5f7",
                "--bg-3": "#eaeaef",
                "--bg-4": "#e2e2e8",
                "--line": "rgba(0,0,0,0.12)",
                "--line-soft": "rgba(0,0,0,0.07)",
                "--fg-0": "#1d1d1f",
                "--fg-1": "#3a3a3c",
                "--fg-2": "#6e6e73",
                "--fg-3": "#86868b",
                "--accent": "#0071e3",
                "--accent-2": "#0a84ff",
                "--accent-dim": "rgba(0,113,227,0.10)",
                "--accent-line": "rgba(0,113,227,0.35)",
                "--danger": "#ff3b30",
                "--warn": "#ff9500",
                "--ok": "#34c759",
                "--radius": "18px",
                "--radius-sm": "12px",
                "--font-ui": "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"SF Pro Display\", \"Helvetica Neue\", \"Segoe UI\", Roboto, Ubuntu, sans-serif",
                "--font-mono": "ui-monospace, \"SF Mono\", SFMono-Regular, Menlo, Consolas, monospace",
                "--shadow-lg": "0 24px 70px rgba(0,0,0,0.16)",
                "--shadow-md": "0 10px 30px rgba(0,0,0,0.10)",
                "--shadow-sm": "0 4px 14px rgba(0,0,0,0.08)",
                "--glass-bg": "rgba(245,245,247,0.72)",
                "--glass-bg-strong": "rgba(255,255,255,0.78)",
                "--glass-border": "rgba(0,0,0,0.08)"
            },
            term: {
                foreground: "#1d1d1f", background: "#ffffff", cursor: "#0071e3", cursorAccent: "#ffffff",
                selection: "rgba(0,113,227,0.22)",
                black: "#3a3a3c", red: "#ff3b30", green: "#34c759", yellow: "#ff9500",
                blue: "#0071e3", magenta: "#bf5af2", cyan: "#32ade6", white: "#1d1d1f",
                brightBlack: "#86868b", brightRed: "#ff453a", brightGreen: "#28c840", brightYellow: "#ff9f0a",
                brightBlue: "#409cff", brightMagenta: "#da70d6", brightCyan: "#40c8e0", brightWhite: "#3a3a3c"
            }
        },
        "tron": {
            label: "TRON",
            mode: "dark",
            ui: {
                "--bg-0": "#031316", "--bg-1": "#041a1e", "--bg-2": "#062329", "--bg-3": "#082e35",
                "--bg-4": "#0b3a42", "--line": "#0e4a53", "--line-soft": "#0a353d",
                "--fg-0": "#d7f8f5", "--fg-1": "#8ecfd0", "--fg-2": "#5a9ea3", "--fg-3": "#3d7076",
                "--accent": "#00e5ff", "--accent-2": "#ff9d00",
                "--accent-dim": "rgba(0,229,255,0.14)", "--accent-line": "rgba(0,229,255,0.45)",
                "--danger": "#ff5f6d", "--warn": "#ff9d00", "--ok": "#3ce8a0",
                "--radius": "18px", "--radius-sm": "12px",
                "--font-ui": "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"SF Pro Display\", \"Helvetica Neue\", \"Segoe UI\", Roboto, Ubuntu, sans-serif",
                "--font-mono": "ui-monospace, \"SF Mono\", SFMono-Regular, Menlo, Consolas, monospace",
                "--shadow-lg": "0 24px 70px rgba(0,0,0,0.65)", "--shadow-md": "0 10px 30px rgba(0,0,0,0.55)",
                "--shadow-sm": "0 4px 14px rgba(0,0,0,0.55)",
                "--glass-bg": "rgba(3,19,22,0.72)", "--glass-bg-strong": "rgba(4,26,30,0.78)", "--glass-border": "rgba(0,229,255,0.14)"
            },
            term: {
                foreground: "#c9f7f5", background: "#031316", cursor: "#00e5ff", cursorAccent: "#031316",
                selection: "rgba(0,229,255,0.28)",
                black: "#062329", red: "#ff5f6d", green: "#3ce8a0", yellow: "#ff9d00",
                blue: "#00b7ff", magenta: "#c56bff", cyan: "#00e5ff", white: "#c9f7f5",
                brightBlack: "#3d7076", brightRed: "#ff8b95", brightGreen: "#6ff3bd",
                brightYellow: "#ffbc4d", brightBlue: "#54d4ff", brightMagenta: "#d99bff",
                brightCyan: "#6ff4ff", brightWhite: "#eaffff"
            }
        },
        "nova-dark": {
            label: "Nova Dark",
            mode: "dark",
            ui: {
                "--bg-0": "#0b0d12", "--bg-1": "#11141b", "--bg-2": "#161a22", "--bg-3": "#1c212c",
                "--bg-4": "#232838", "--line": "#2a3040", "--line-soft": "#222838",
                "--fg-0": "#e8ecf4", "--fg-1": "#a8b2c2", "--fg-2": "#77818f", "--fg-3": "#4f5766",
                "--accent": "#7c8cff", "--accent-2": "#38d6c0",
                "--accent-dim": "rgba(124,140,255,0.14)", "--accent-line": "rgba(124,140,255,0.42)",
                "--danger": "#ff6b81", "--warn": "#ffb454", "--ok": "#4ade80",
                "--radius": "18px", "--radius-sm": "12px",
                "--font-ui": "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"SF Pro Display\", \"Helvetica Neue\", \"Segoe UI\", Roboto, Ubuntu, sans-serif",
                "--font-mono": "ui-monospace, \"SF Mono\", SFMono-Regular, Menlo, Consolas, monospace",
                "--shadow-lg": "0 24px 70px rgba(0,0,0,0.65)", "--shadow-md": "0 10px 30px rgba(0,0,0,0.55)",
                "--shadow-sm": "0 4px 14px rgba(0,0,0,0.55)",
                "--glass-bg": "rgba(11,13,18,0.72)", "--glass-bg-strong": "rgba(17,20,27,0.78)", "--glass-border": "rgba(124,140,255,0.14)"
            },
            term: {
                foreground: "#dfe6f2", background: "#0b0d12", cursor: "#7c8cff", cursorAccent: "#0b0d12",
                selection: "rgba(124,140,255,0.28)",
                black: "#161a22", red: "#ff6b81", green: "#4ade80", yellow: "#ffb454",
                blue: "#7c8cff", magenta: "#b48cf2", cyan: "#38d6c0", white: "#e8ecf4",
                brightBlack: "#4f5766", brightRed: "#ff8494", brightGreen: "#6ee89a",
                brightYellow: "#ffc87a", brightBlue: "#93a6ff", brightMagenta: "#c6a6f2",
                brightCyan: "#55dfc4", brightWhite: "#f2f5fc"
            }
        },
        "nova-light": {
            label: "Nova Light",
            mode: "light",
            ui: {
                "--bg-0": "#f6f7f9", "--bg-1": "#ffffff", "--bg-2": "#f1f2f5", "--bg-3": "#e9ebf0",
                "--bg-4": "#e2e4ea", "--line": "#d8dbe3", "--line-soft": "#e6e8ee",
                "--fg-0": "#171c26", "--fg-1": "#414a5a", "--fg-2": "#68738f", "--fg-3": "#8b93a6",
                "--accent": "#5b6cff", "--accent-2": "#0ea5a5",
                "--accent-dim": "rgba(91,108,255,0.10)", "--accent-line": "rgba(91,108,255,0.38)",
                "--danger": "#e5484d", "--warn": "#e8930c", "--ok": "#2f9e5c",
                "--radius": "18px", "--radius-sm": "12px",
                "--font-ui": "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"SF Pro Display\", \"Helvetica Neue\", \"Segoe UI\", Roboto, Ubuntu, sans-serif",
                "--font-mono": "ui-monospace, \"SF Mono\", SFMono-Regular, Menlo, Consolas, monospace",
                "--shadow-lg": "0 24px 70px rgba(23,28,38,0.16)", "--shadow-md": "0 10px 30px rgba(23,28,38,0.10)",
                "--shadow-sm": "0 4px 14px rgba(23,28,38,0.08)",
                "--glass-bg": "rgba(246,247,249,0.72)", "--glass-bg-strong": "rgba(255,255,255,0.78)", "--glass-border": "rgba(23,28,38,0.08)"
            },
            term: {
                foreground: "#232a38", background: "#ffffff", cursor: "#5b6cff", cursorAccent: "#ffffff",
                selection: "rgba(91,108,255,0.22)",
                black: "#3a4254", red: "#e5484d", green: "#2f9e5c", yellow: "#e8930c",
                blue: "#5b6cff", magenta: "#9358d6", cyan: "#0ea5a5", white: "#232a38",
                brightBlack: "#8b93a6", brightRed: "#ef6b72", brightGreen: "#49bd74",
                brightYellow: "#e8a53c", brightBlue: "#7a8cff", brightMagenta: "#ad82d8",
                brightCyan: "#2fb8b0", brightWhite: "#3a4254"
            }
        }
    };

    Saim.themes = {
        list: () => Object.keys(THEMES).map(key => ({ key, label: THEMES[key].label })),
        get: key => THEMES[key] || THEMES["saim-cli"],
        current: () => Saim.state.settings.theme || "saim-cli",

        apply(key) {
            const theme = THEMES[key] || THEMES["saim-cli"];
            const root = document.documentElement;
            Object.keys(theme.ui).forEach(name => root.style.setProperty(name, theme.ui[name]));
            root.style.setProperty("--ui-scale", String((Saim.state.settings.uiScale || 100) / 100));
            root.style.colorScheme = theme.mode === "light" ? "light" : "dark";
            Saim.state.settings.theme = key;
            // Persist so a reload doesn't resurrect a stale saved theme.
            if (Saim.bridge && Saim.bridge.saveSettings) Saim.bridge.saveSettings({ theme: key });
            Saim.bus.emit("theme:changed", key);
            return theme;
        },

        terminalTheme: key => {
            const theme = THEMES[key] || THEMES["saim-cli"];
            return Object.assign({}, theme.term);
        }
    };
})(window.Saim);
