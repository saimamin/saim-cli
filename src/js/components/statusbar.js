/**
 * Saim CLI - status bar
 */
window.Saim = window.Saim || {};

(function (Saim) {
    "use strict";

    function set(id, text) {
        const node = document.getElementById(id);
        if (node) node.textContent = text;
    }

    async function refreshGit() {
        const info = await Saim.bridge.gitInfo(Saim.state.cwd);
        if (!info) return;
        Saim.state.git = info;
        const node = document.getElementById("st-branch");
        if (!node) return;
        node.classList.remove("is-off", "is-dirty");
        if (!info.repo) {
            node.textContent = "no repo";
            node.classList.add("is-off");
            node.title = "Not a git repository";
            return;
        }
        node.textContent = `⎇ ${info.branch}${info.dirty ? " *" : ""}`;
        if (info.dirty) node.classList.add("is-dirty");
        node.title = info.dirty ? `${info.changes} uncommitted change(s)` : "Clean working tree";
    }

    function tick() {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, "0");
        const mm = String(now.getMinutes()).padStart(2, "0");
        set("st-clock", `${hh}:${mm}`);
    }

    function init() {
        tick();
        setInterval(tick, 10000);

        Saim.bus.on("cwd:changed", dir => {
            set("st-cwd", dir || "");
            refreshGit();
        });

        Saim.bus.on("process:changed", proc => set("st-process", proc || ""));

        Saim.bus.on("system:updated", info => {
            const memUsed = info.mem.total - info.mem.free;
            const memPct = info.mem.total ? (memUsed / info.mem.total) * 100 : 0;
            set("st-cpu", `cpu ${info.cpu.usage.toFixed(0)}%`);
            set("st-mem", `mem ${memPct.toFixed(0)}%`);
            set("st-net", `↓${Math.round(info.net.rx || 0)} ↑${Math.round(info.net.tx || 0)}`);
        });

        Saim.bus.on("opencode:status", ({ text }) => {
            set("st-opencode", `saim: ${text}`);
        });

        const branch = document.getElementById("st-branch");
        if (branch) {
            branch.classList.add("is-clickable");
            branch.addEventListener("click", () => Saim.commands.run("git:refresh"));
        }

        refreshGit();
        setInterval(refreshGit, 15000);
    }

    Saim.statusbar = { init, refreshGit };
})(window.Saim);
