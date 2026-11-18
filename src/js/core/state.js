/**
 * Saim CLI - application state + tiny event bus
 */
window.Saim = window.Saim || {};

(function (Saim) {
    "use strict";

    const listeners = new Map();

    Saim.bus = {
        on(event, handler) {
            if (!listeners.has(event)) listeners.set(event, []);
            listeners.get(event).push(handler);
            return () => {
                const list = listeners.get(event) || [];
                const idx = list.indexOf(handler);
                if (idx !== -1) list.splice(idx, 1);
            };
        },
        emit(event, payload) {
            let handled = false;
            (listeners.get(event) || []).forEach(handler => {
                try {
                    if (handler(payload) === true) handled = true;
                } catch (e) { console.error(e); }
            });
            (listeners.get("*") || []).forEach(handler => {
                try { handler({ event, payload }); } catch (e) { console.error(e); }
            });
            return handled;
        }
    };

    Saim.state = {
        settings: {},
        info: {},

        tabs: [],                 // { id, title, kind, cwd, paneId }
        activeTabId: null,

        sidebarOpen: true,
        sidebarView: "explorer",
        sidebarRoot: null,

        dockOpen: false,
        dockTab: "opencode",

        opencode: { id: null, running: false, path: null },

        cwd: null,
        git: { repo: false, branch: "", dirty: false },

        bookmarks: [],
        system: null
    };

    Saim.helpers = {
        el: (tag, className, text) => {
            const node = document.createElement(tag);
            if (className) node.className = className;
            if (text !== undefined && text !== null) node.textContent = text;
            return node;
        },
        clear: node => { while (node && node.firstChild) node.removeChild(node.firstChild); },
        basename: p => (p || "").split("/").filter(Boolean).pop() || "/",
        dirname: p => {
            if (!p) return "/";
            const parts = p.split("/").filter(Boolean);
            parts.pop();
            return "/" + parts.join("/");
        },
        formatBytes: bytes => {
            if (!bytes) return "0 B";
            const units = ["B", "KB", "MB", "GB", "TB"];
            const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
            const value = bytes / Math.pow(1024, i);
            return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
        },
        debounce: (fn, wait) => {
            let timer = null;
            return (...args) => {
                clearTimeout(timer);
                timer = setTimeout(() => fn(...args), wait);
            };
        }
    };

    Saim.toast = (message, kind) => {
        const stack = document.getElementById("toast-stack");
        if (!stack) return;
        const toast = Saim.helpers.el("div", `toast${kind ? ` toast--${kind}` : ""}`, message);
        stack.appendChild(toast);
        setTimeout(() => {
            toast.style.transition = "opacity 0.25s ease, transform 0.25s ease";
            toast.style.opacity = "0";
            toast.style.transform = "translateX(12px)";
            setTimeout(() => toast.remove(), 260);
        }, 2600);
    };
})(window.Saim);
