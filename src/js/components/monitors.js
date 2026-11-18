/**
 * Saim CLI - system monitors (dock tab)
 */
window.Saim = window.Saim || {};

(function (Saim) {
    "use strict";

    const H = Saim.helpers;
    let container = null;

    function card(title, valueHtml) {
        const node = H.el("div", "mon-card");
        const head = H.el("div", "mon-card__title");
        head.appendChild(H.el("span", null, title));
        const value = H.el("span", "mon-card__value", "");
        head.appendChild(value);
        node.appendChild(head);
        node.appendChild(valueHtml);
        node._value = value;
        return node;
    }

    function bar() {
        const wrap = H.el("div", "bar");
        const fill = H.el("div", "bar__fill");
        fill.style.width = "0%";
        wrap.appendChild(fill);
        wrap._fill = fill;
        return wrap;
    }

    function render(info) {
        if (!container) return;
        H.clear(container);

        // CPU
        const cpuCard = card("Processor", bar());
        cpuCard._value.textContent = `${info.cpu.usage.toFixed(0)}%`;
        cpuCard._fill = cpuCard.querySelector(".bar__fill");
        cpuCard._fill.style.width = `${Math.min(100, info.cpu.usage)}%`;
        if (info.cpu.usage > 85) cpuCard._fill.classList.add("is-hot");
        container.appendChild(cpuCard);

        // Memory
        const memUsed = info.mem.total - info.mem.free;
        const memPct = info.mem.total ? (memUsed / info.mem.total) * 100 : 0;
        const memCard = card("Memory", bar());
        memCard._value.textContent = `${memPct.toFixed(0)}%`;
        memCard._fill = memCard.querySelector(".bar__fill");
        memCard._fill.style.width = `${memPct}%`;
        if (memPct > 85) memCard._fill.classList.add("is-hot");
        container.appendChild(memCard);

        // Network
        const netCard = card("Network", H.el("div", "setting__desc",
            `↓ ${H.formatBytes(info.net.rx || 0)}/s   ↑ ${H.formatBytes(info.net.tx || 0)}/s`));
        netCard._value.textContent = info.net.iface || "n/a";
        container.appendChild(netCard);

        // Host
        const hostCard = card("Host", H.el("div", "setting__desc",
            `${info.host.hostname}<br>${info.host.platform}<br>uptime ${formatUptime(info.host.uptime)}`));
        hostCard._value.textContent = info.host.user;
        container.appendChild(hostCard);

        // Processes
        const procCard = card("Top processes", H.el("div"));
        const table = H.el("table", "proc-table");
        info.processes.slice(0, 14).forEach(proc => {
            const row = H.el("tr");
            row.appendChild(H.el("td", null, proc.name));
            row.appendChild(H.el("td", null, `cpu ${proc.cpu.toFixed(1)}%  mem ${proc.mem.toFixed(1)}%`));
            table.appendChild(row);
        });
        procCard.appendChild(table);
        container.appendChild(procCard);
    }

    function formatUptime(seconds) {
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (d) return `${d}d ${h}h`;
        if (h) return `${h}h ${m}m`;
        return `${m}m`;
    }

    async function refresh() {
        const info = await Saim.bridge.sysInfo();
        if (!info) return;
        Saim.state.system = info;
        render(info);
        Saim.bus.emit("system:updated", info);
    }

    function init() {
        container = document.getElementById("monitors");
        refresh();
        setInterval(refresh, 3000);
    }

    Saim.monitors = { init, refresh };
})(window.Saim);
