/**
 * Saim CLI - bookmarks (sidebar)
 */
window.Saim = window.Saim || {};

(function (Saim) {
    "use strict";

    const H = Saim.helpers;
    let container = null;

    function currentBookmarks() {
        return Saim.state.bookmarks || [];
    }

    function persist() {
        Saim.bridge.saveState({ bookmarks: currentBookmarks() });
    }

    function render() {
        if (!container) return;
        H.clear(container);
        const items = currentBookmarks();

        container.appendChild(H.el("div", "sidebar__section", `Bookmarks (${items.length})`));

        if (!items.length) {
            container.appendChild(H.el("div", "sidebar__empty",
                "No bookmarks yet.\nRight-click a folder in the Explorer to bookmark it."));
            return;
        }

        items.forEach((item, index) => {
            const row = H.el("div", "bookmark__row");
            row.appendChild(H.el("span", "tree__icon", "★"));

            const body = H.el("div", "sessrow__body");
            body.appendChild(H.el("div", "sessrow__title", item.name));
            body.appendChild(H.el("div", "bookmark__path", item.path));
            row.appendChild(body);

            const kill = H.el("span", "sessrow__kill", "✕");
            kill.addEventListener("click", event => {
                event.stopPropagation();
                Saim.state.bookmarks.splice(index, 1);
                persist();
                render();
            });
            row.appendChild(kill);

            row.addEventListener("click", async () => {
                await Saim.commands.run("folder:set", { path: item.path });
            });

            container.appendChild(row);
        });
    }

    function add(path, name) {
        const items = currentBookmarks();
        if (items.some(item => item.path === path)) return;
        items.push({ path: path, name: name || H.basename(path) });
        Saim.state.bookmarks = items;
        persist();
        render();
        Saim.toast(`Bookmarked ${name || H.basename(path)}`, "ok");
    }

    function init() {
        container = document.getElementById("sidebar-body");
        Saim.bus.on("explorer:context", ({ entry }) => {
            if (!entry.dir) return;
            add(entry.path, entry.name);
        });
    }

    Saim.bookmarks = { init, render, add };
})(window.Saim);
