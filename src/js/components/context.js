/**
 * Saim CLI - Context inspector
 * ---------------------------------------------------------------------------
 * Right-panel view showing real session statistics, token usage, cost and a
 * raw-message inspector with session export. All values come from the live
 * assistant client state — no placeholder data.
 */
window.Saim = window.Saim || {};

(function (Saim) {
    "use strict";

    const H = Saim.helpers;

    function oc() {
        return (Saim.opencode && Saim.opencode.state) || {};
    }

    function activeSession() {
        const state = oc();
        return (state.sessions || []).find(s => s.id === state.activeSessionId) || null;
    }

    function num(value) {
        return (typeof value === "number" && isFinite(value)) ? value : 0;
    }

    function fmt(value) {
        return num(value).toLocaleString("en-US");
    }

    function fmtDate(ts) {
        if (!ts) return "—";
        try {
            return new Date(ts).toLocaleString("en-US", {
                month: "short", day: "numeric", year: "numeric",
                hour: "numeric", minute: "2-digit"
            });
        } catch (e) { return "—"; }
    }

    /** Sum token counters across the active session (server-provided per message). */
    function totals() {
        const t = { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
        const state = oc();
        const session = activeSession();

        if (session && session.tokens) {
            t.input = num(session.tokens.input);
            t.output = num(session.tokens.output);
            t.reasoning = num(session.tokens.reasoning);
            t.cacheRead = num(session.tokens.cache && session.tokens.cache.read);
            t.cacheWrite = num(session.tokens.cache && session.tokens.cache.write);
            t.cost = num(session.cost);
            return t;
        }

        (state.messages || []).forEach(m => {
            const tk = m.tokens || {};
            t.input += num(tk.input);
            t.output += num(tk.output);
            t.reasoning += num(tk.reasoning);
            t.cacheRead += num(tk.cache && tk.cache.read);
            t.cacheWrite += num(tk.cache && tk.cache.write);
            t.cost += num(m.cost);
        });
        return t;
    }

    function contextLimit() {
        const state = oc();
        const m = state.models && state.models.find(x => (x.id || x) === state.activeModel);
        if (m && m.limit && m.limit.context) return num(m.limit.context);
        // Sample from any message model that carries a limit.
        for (const msg of (state.messages || [])) {
            if (msg.model && msg.model.limit && msg.model.limit.context) return num(msg.model.limit.context);
        }
        return 1048576; // OpenCode default context window
    }

    function stat(label, value) {
        const cell = H.el("div", "ctx__stat");
        cell.appendChild(H.el("span", "ctx__label", label));
        cell.appendChild(H.el("span", "ctx__value", value));
        return cell;
    }

    function render() {
        const body = document.getElementById("context-body");
        if (!body) return;
        H.clear(body);

        const state = oc();
        const session = activeSession();
        const messages = state.messages || [];
        const t = totals();
        const limit = contextLimit();
        const total = t.input + t.output + t.reasoning + t.cacheRead + t.cacheWrite;
        const usage = limit ? Math.min(100, (total / limit) * 100) : 0;
        const userCount = messages.filter(m => m.type === "user").length;
        const assistantCount = messages.filter(m => m.type === "assistant").length;

        // Header
        const head = H.el("div", "ctx__head");
        head.appendChild(H.el("h2", null, "Context"));
        head.appendChild(H.el("span", "ctx__head-sub", session ? (session.title || session.id) : "No active session"));
        body.appendChild(head);

        // Provider + model badge
        const badge = H.el("div", "ctx__badge");
        const provider = (state.activeModel && state.activeModel.includes("/"))
            ? state.activeModel.split("/")[0] : "Personal / OpenCode";
        badge.appendChild(H.el("span", "ctx__badge-provider", provider));
        badge.appendChild(H.el("span", "ctx__badge-model", state.activeModel || "—"));
        body.appendChild(badge);

        // Stat grid
        const grid = H.el("div", "ctx__grid");
        grid.appendChild(stat("Session", session ? (session.title || session.id) : "—"));
        grid.appendChild(stat("Messages", String(messages.length)));
        grid.appendChild(stat("Provider", provider));
        grid.appendChild(stat("Model", state.activeModel || "—"));
        grid.appendChild(stat("Context limit", fmt(limit)));
        grid.appendChild(stat("Total tokens", fmt(total)));
        grid.appendChild(stat("Usage", `${usage.toFixed(1)}%`));
        grid.appendChild(stat("Input tokens", fmt(t.input)));
        grid.appendChild(stat("Reasoning tokens", fmt(t.reasoning)));
        grid.appendChild(stat("Output tokens", fmt(t.output)));
        grid.appendChild(stat("Cache tokens (read/write)", `${fmt(t.cacheRead)} / ${fmt(t.cacheWrite)}`));
        grid.appendChild(stat("User messages", String(userCount)));
        grid.appendChild(stat("Assistant messages", String(assistantCount)));
        grid.appendChild(stat("Total cost", `$${t.cost.toFixed(2)}`));
        grid.appendChild(stat("Session created", fmtDate(session && session.time && session.time.created)));
        grid.appendChild(stat("Last activity", fmtDate(session && session.time && session.time.updated)));
        body.appendChild(grid);

        // Usage bar
        const usageWrap = H.el("div", "ctx__usage");
        const usageBar = H.el("div", "ctx__usage-track");
        const fill = H.el("div", "ctx__usage-fill");
        fill.style.width = `${Math.max(usage, 0.5)}%`;
        usageBar.appendChild(fill);
        usageWrap.appendChild(usageBar);
        usageWrap.appendChild(H.el("span", "ctx__usage-label", `${usage.toFixed(1)}% of context used`));
        body.appendChild(usageWrap);

        // Raw messages
        const raw = H.el("div", "ctx__raw");
        const rawHead = H.el("div", "ctx__raw-head");
        rawHead.appendChild(H.el("h3", null, "Raw messages"));
        const exportBtn = H.el("button", "ghostbtn", "Export session ↗");
        exportBtn.type = "button";
        exportBtn.addEventListener("click", exportSession);
        rawHead.appendChild(exportBtn);
        raw.appendChild(rawHead);

        const list = H.el("div", "ctx__raw-list");
        if (!messages.length) {
            list.appendChild(H.el("div", "ctx__empty", "No messages in this session."));
        } else {
            messages.forEach(msg => {
                const item = H.el("details", "ctx__msg");
                const summary = H.el("summary", "ctx__msg-summary");
                summary.appendChild(H.el("span", `ctx__msg-role ctx__msg-role--${msg.type}`, msg.type || "?"));
                summary.appendChild(H.el("span", "ctx__msg-id", msg.id || ""));
                summary.appendChild(H.el("span", "ctx__msg-time", fmtDate(msg.time && msg.time.created)));
                item.appendChild(summary);
                const pre = H.el("pre", "ctx__msg-json");
                try { pre.textContent = JSON.stringify(msg, null, 2); }
                catch (e) { pre.textContent = String(msg); }
                item.appendChild(pre);
                list.appendChild(item);
            });
        }
        raw.appendChild(list);
        body.appendChild(raw);
    }

    function exportSession() {
        const state = oc();
        const session = activeSession();
        const payload = {
            exportedAt: new Date().toISOString(),
            session: session || null,
            messages: state.messages || []
        };
        const text = JSON.stringify(payload, null, 2);
        const blob = new Blob([text], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `saim-session-${session ? session.id : "export"}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        Saim.toast("Session exported", "ok");
    }

    function init() {
        Saim.bus.on("opencode:render", render);
        Saim.bus.on("opencode:state", render);
        Saim.bus.on("nav:changed", view => {
            if (view === "context") render();
        });
    }

    Saim.context = { init, render };
})(window.Saim);
