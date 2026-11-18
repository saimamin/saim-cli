/**
 * Saim CLI - file explorer (sidebar)
 */
window.Saim = window.Saim || {};

(function (Saim) {
    "use strict";

    const H = Saim.helpers;
    let container = null;
    let root = null;
    const openFolders = new Set();
    let selected = null;

    const ICONS = {
        dir: "▸",
        folder: "▪",
        file: "·",
        code: "‹›",
        image: "▣",
        archive: "▤",
        shell: "❯"
    };

    function iconFor(entry) {
        if (entry.dir) return ICONS.dir;
        const ext = (entry.name.split(".").pop() || "").toLowerCase();
        if (["js", "ts", "tsx", "jsx", "json", "py", "go", "rs", "sh", "html", "css"].includes(ext)) return ICONS.code;
        if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) return ICONS.image;
        if (["zip", "tar", "gz", "xz", "7z"].includes(ext)) return ICONS.archive;
        if (["sh", "bash", "zsh"].includes(ext)) return ICONS.shell;
        return ICONS.file;
    }

    function makeRow(entry, depth) {
        const row = H.el("div", "tree__row");
        row.style.paddingLeft = `${8 + depth * 13}px`;
        if (entry.dir) row.classList.add("is-dir");

        const twisty = H.el("span", "tree__twisty", entry.dir ? "▶" : "");
        if (entry.dir && openFolders.has(entry.path)) twisty.classList.add("is-open");
        const icon = H.el("span", "tree__icon", iconFor(entry));
        const name = H.el("span", "tree__name", entry.name);

        row.appendChild(twisty);
        row.appendChild(icon);
        row.appendChild(name);

        if (!entry.dir && entry.size) {
            row.appendChild(H.el("span", "tree__meta", H.formatBytes(entry.size)));
        }
        if (selected === entry.path) row.classList.add("is-selected");

        row.addEventListener("click", event => {
            event.stopPropagation();
            if (entry.dir) {
                if (openFolders.has(entry.path)) openFolders.delete(entry.path);
                else openFolders.add(entry.path);
                render();
            } else {
                selected = entry.path;
                Saim.editor.open(entry.path);
                render();
            }
        });

        row.addEventListener("contextmenu", event => {
            event.preventDefault();
            Saim.bus.emit("explorer:context", { entry, event });
        });

        return row;
    }

    async function renderDirectory(dir, depth, container) {
        const entries = await Saim.bridge.list(dir);
        if (!entries || !entries.length) return;
        for (const entry of entries) {
            // Keep the tree readable: heavy folders are opt-in.
            if (entry.dir && (entry.name === "node_modules" || entry.name === ".git")) {
                continue;
            }
            container.appendChild(makeRow(entry, depth));
            if (entry.dir && openFolders.has(entry.path)) {
                const childWrap = H.el("div", "tree__children is-open");
                await renderDirectory(entry.path, depth + 1, childWrap);
                container.appendChild(childWrap);
            }
        }
    }

    async function render() {
        if (!container) return;
        H.clear(container);
        const target = root || Saim.state.cwd;
        Saim.state.sidebarRoot = target;

        const head = H.el("div", "sidebar__section", target);
        container.appendChild(head);

        const list = H.el("div", "tree");
        await renderDirectory(target, 0, list);
        container.appendChild(list);

        if (!list.childElementCount) {
            container.appendChild(H.el("div", "sidebar__empty", "This directory is empty."));
        }
    }

    function setRoot(dir) {
        root = dir || null;
        render();
    }

    function init() {
        container = document.getElementById("explorer-host") || document.getElementById("sidebar-body");

        const refreshBtn = document.getElementById("explorer-refresh") || document.getElementById("sidebar-refresh");
        if (refreshBtn) {
            refreshBtn.addEventListener("click", () => {
                render();
                Saim.toast("Explorer refreshed", "ok");
            });
        }

        const openBtn = document.getElementById("explorer-openfolder") || document.getElementById("btn-openfolder");
        if (openBtn) {
            openBtn.addEventListener("click", async () => {
                const dir = await Saim.bridge.openDirectory(root || Saim.state.cwd);
                if (dir) {
                    setRoot(dir);
                    Saim.toast(`Root set to ${dir}`, "ok");
                }
            });
        }

        const newBtn = document.getElementById("explorer-newfolder") || document.getElementById("btn-newfolder");
        if (newBtn) {
            newBtn.addEventListener("click", async () => {
                const name = await Saim.modal.prompt("Name of the new folder");
                if (!name) return;
                const target = `${root || Saim.state.cwd}/${name}`;
                const res = await Saim.bridge.mkdir(target);
                if (res) {
                    openFolders.add(root || Saim.state.cwd);
                    render();
                    Saim.toast(`Created ${name}`, "ok");
                }
            });
        }

        Saim.bus.on("cwd:changed", dir => {
            if (!root) render();
        });

        Saim.bus.on("explorer:refresh", render);

        Saim.bus.on("explorer:context", ({ entry, event }) => {
            const items = [];
            if (entry.dir) {
                items.push({
                    label: "Open in new terminal",
                    icon: "❯",
                    action: () => {
                        const tab = Saim.terminals.create({ cwd: entry.path, title: entry.name });
                        Saim.terminals.activate(tab.id);
                    }
                });
                items.push({
                    label: "Set as workspace",
                    icon: "★",
                    action: () => Saim.commands.run("folder:set", { path: entry.path })
                });
                items.push({ separator: true });
            } else {
                items.push({
                    label: "Open in editor",
                    icon: "✎",
                    action: () => Saim.editor.open(entry.path)
                });
                items.push({
                    label: "Copy path",
                    icon: "⧉",
                    action: () => {
                        Saim.bridge.clipboardWrite(entry.path);
                        Saim.toast("Path copied", "ok");
                    }
                });
                items.push({ separator: true });
            }
            items.push({
                label: "Delete",
                icon: "✕",
                danger: true,
                action: async () => {
                    const ok = await Saim.modal.confirm(
                        `Delete ${entry.name}?`,
                        entry.dir ? "The folder and its contents will be removed." : "This cannot be undone."
                    );
                    if (!ok) return;
                    await Saim.bridge.remove(entry.path);
                    render();
                    Saim.toast(`Deleted ${entry.name}`, "ok");
                }
            });
            Saim.modal.contextMenu(items, event.clientX, event.clientY);
        });
    }

    Saim.explorer = { init, render, setRoot };
})(window.Saim);
