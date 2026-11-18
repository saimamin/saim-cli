/**
 * Saim CLI - command palette
 * Fuzzy search over registered commands and over the files of the workspace.
 */
window.Saim = window.Saim || {};

(function (Saim) {
    "use strict";

    const H = Saim.helpers;

    let overlay = null;
    let input = null;
    let listEl = null;
    let modeEl = null;
    let items = [];
    let cursor = 0;
    let mode = "commands";
    let fileIndex = [];

    /**
     * Simple fuzzy matcher.
     * Returns { score, indices } or null when the needle does not match.
     */
    function fuzzy(needle, haystack) {
        if (!needle) return { score: 0, indices: [] };
        const lowerNeedle = needle.toLowerCase();
        const lowerHay = haystack.toLowerCase();
        let score = 0;
        let hi = 0;
        let streak = 0;
        const indices = [];
        let boundaryBonus = 0;

        for (let ni = 0; ni < lowerNeedle.length; ni++) {
            const ch = lowerNeedle[ni];
            if (ch === " ") continue;
            const found = lowerHay.indexOf(ch, hi);
            if (found === -1) return null;
            const isBoundary = found === 0 || /[\s\-_./]/.test(lowerHay[found - 1]);
            if (isBoundary) boundaryBonus += 6;
            streak = found === hi ? streak + 1 : 0;
            score += 10 + streak * 4 + (isBoundary ? 6 : 0);
            if (haystack[found] === ch) score += 2;
            indices.push(found);
            hi = found + 1;
        }
        score -= haystack.length * 0.08;
        return { score: score + boundaryBonus, indices };
    }

    function highlight(text, indices) {
        const frag = document.createDocumentFragment();
        let index = 0;
        indices.forEach(pos => {
            if (pos > index) frag.appendChild(document.createTextNode(text.substring(index, pos)));
            const mark = document.createElement("mark");
            mark.textContent = text[pos];
            frag.appendChild(mark);
            index = pos + 1;
        });
        if (index < text.length) frag.appendChild(document.createTextNode(text.substring(index)));
        return frag;
    }

    function commandItems() {
        return Saim.commands.all().map(cmd => ({
            kind: "command",
            title: cmd.title,
            hint: cmd.hint || cmd.shortcut || "",
            label: cmd.title,
            search: `${cmd.title} ${cmd.keywords || ""}`,
            run: () => Saim.commands.run(cmd.id, cmd.payload)
        }));
    }

    function fileItems() {
        return fileIndex.map(file => ({
            kind: "file",
            title: file.name,
            hint: file.path,
            label: file.path,
            search: file.path,
            run: () => {
                if (file.dir) Saim.commands.run("folder:set", { path: file.path });
                else Saim.editor.open(file.path);
            }
        }));
    }

    async function buildFileIndex() {
        const root = Saim.state.sidebarRoot || Saim.state.cwd;
        const found = [];
        const walk = async (dir, depth) => {
            if (depth > 6 || found.length > 5000) return;
            const entries = await Saim.bridge.list(dir);
            if (!entries) return;
            for (const entry of entries) {
                if (entry.hidden) continue;
                if (entry.name === "node_modules" || entry.name === ".git") continue;
                found.push(entry);
                if (entry.dir) await walk(entry.path, depth + 1);
            }
        };
        await walk(root, 0);
        fileIndex = found;
    }

    function compute(query) {
        const source = mode === "commands" ? commandItems() : fileItems();
        if (!query) {
            items = source.slice(0, 60);
        } else {
            const scored = [];
            source.forEach(item => {
                const match = fuzzy(query, item.search);
                if (match) scored.push({ item, score: match.score, indices: match.indices });
            });
            scored.sort((a, b) => b.score - a.score);
            items = scored.slice(0, 60).map(entry => Object.assign({}, entry.item, { indices: entry.indices }));
        }
        cursor = 0;
        render();
    }

    function render() {
        H.clear(listEl);
        if (!items.length) {
            listEl.appendChild(H.el("li", "palette__empty", "No matches."));
            return;
        }
        items.forEach((item, index) => {
            const node = H.el("li", `palette__item${index === cursor ? " is-active" : ""}`);
            node.appendChild(H.el("span", "palette__icon-slot", item.kind === "file" ? "▪" : "›"));
            const title = H.el("span", "palette__title");
            if (item.indices && item.indices.length) {
                title.appendChild(highlight(item.label, item.indices));
            } else {
                title.textContent = item.label;
            }
            node.appendChild(title);
            if (item.hint) node.appendChild(H.el("span", "palette__hint", item.hint));
            node.appendChild(H.el("span", "palette__kind", item.kind === "file" ? "file" : "cmd"));
            node.addEventListener("click", () => { cursor = index; execute(); });
            node.addEventListener("mousemove", () => {
                if (cursor === index) return;
                cursor = index;
                render();
            });
            listEl.appendChild(node);
        });
    }

    function execute() {
        const item = items[cursor];
        close();
        if (item && item.run) {
            setTimeout(() => item.run(), 10);
        }
    }

    function move(delta) {
        if (!items.length) return;
        cursor = (cursor + delta + items.length) % items.length;
        render();
        const active = listEl.querySelector(".is-active");
        if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest" });
    }

    function setMode(next) {
        mode = next;
        modeEl.textContent = next === "commands" ? "commands" : "files";
        input.placeholder = next === "commands"
            ? "Type a command…"
            : "Search files in the workspace…";
        if (next === "files") {
            buildFileIndex().then(() => compute(input.value));
        } else {
            compute(input.value);
        }
    }

    async function open() {
        overlay.hidden = false;
        setMode(mode);
        input.value = "";
        input.focus();
        if (mode === "files") await buildFileIndex();
        compute("");
    }

    function close() {
        overlay.hidden = true;
        const active = Saim.terminals.active();
        if (active) Saim.terminals.activate(active.id);
    }

    function isOpen() {
        return !overlay.hidden;
    }

    function init() {
        overlay = document.getElementById("palette-overlay");
        input = document.getElementById("palette-input");
        listEl = document.getElementById("palette-list");
        modeEl = document.getElementById("palette-mode");

        input.addEventListener("input", () => compute(input.value));

        input.addEventListener("keydown", event => {
            switch (event.key) {
                case "ArrowDown": event.preventDefault(); move(1); break;
                case "ArrowUp": event.preventDefault(); move(-1); break;
                case "Enter": event.preventDefault(); execute(); break;
                case "Escape": event.preventDefault(); close(); break;
                case "Tab":
                    event.preventDefault();
                    setMode(mode === "commands" ? "files" : "commands");
                    break;
                default: break;
            }
        });

        overlay.addEventListener("click", event => {
            if (event.target === overlay) close();
        });

        document.getElementById("btn-palette").addEventListener("click", () => open());
    }

    Saim.palette = { init, open, close, isOpen, setMode };
})(window.Saim);
