/**
 * Saim CLI - session list (sidebar + dock)
 */
window.Saim = window.Saim || {};

(function (Saim) {
    "use strict";

    const H = Saim.helpers;

    function renderInto(container, { compact } = {}) {
        H.clear(container);
        const tabs = Saim.terminals.tabs();

        if (!tabs.length) {
            container.appendChild(H.el("div", "sidebar__empty", "No terminal sessions yet.\nPress Ctrl+Shift+T to start one."));
            return;
        }

        container.appendChild(H.el("div", "sidebar__section", `Sessions (${tabs.length})`));

        tabs.forEach(tab => {
            const row = H.el("div", "sessrow");
            if (tab.id === Saim.state.activeTabId) row.classList.add("is-active");

            row.appendChild(H.el("span", "sessrow__icon", "❯"));

            const body = H.el("div", "sessrow__body");
            body.appendChild(H.el("div", "sessrow__title", tab.title));
            body.appendChild(H.el("div", "sessrow__sub", tab.proc || tab.cwd || ""));
            row.appendChild(body);

            if (!compact) {
                const kill = H.el("span", "sessrow__kill", "✕");
                kill.title = "Terminate session";
                kill.addEventListener("click", event => {
                    event.stopPropagation();
                    Saim.terminals.close(tab.id);
                    render();
                });
                row.appendChild(kill);
            }

            row.addEventListener("click", () => {
                Saim.terminals.activate(tab.id);
                render();
            });

            container.appendChild(row);
        });
    }

    function init() {
        Saim.bus.on("terminals:changed", () => {
            const sidebar = document.getElementById("sidebar-body");
            if (sidebar && Saim.state.sidebarView === "sessions") renderInto(sidebar);
            const dock = document.getElementById("dock-sessions");
            if (dock) renderInto(dock, { compact: true });
        });
        Saim.bus.on("terminal:activated", () => {
            const sidebar = document.getElementById("sidebar-body");
            if (sidebar && Saim.state.sidebarView === "sessions") renderInto(sidebar);
            const dock = document.getElementById("dock-sessions");
            if (dock) renderInto(dock, { compact: true });
        });
    }

    Saim.sessions = { init, renderInto };
})(window.Saim);
