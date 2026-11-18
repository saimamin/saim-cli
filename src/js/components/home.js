/**
 * Saim CLI - Home, session list and session header
 * ---------------------------------------------------------------------------
 * The left sidebar mirrors the OpenCode desktop app: recent sessions, the
 * working set and the tool shortcuts. The Home page shows projects and the
 * sessions touched today.
 */
window.Saim = window.Saim || {};

(function (Saim) {
    "use strict";

    const H = Saim.helpers;

    let sessionListEl = null;
    let workingListEl = null;
    let workingHeadEl = null;
    let projectsEl = null;
    let todayEl = null;
    let searchEl = null;
    let query = "";

    /* ------------------------------------------------------------------ */
    /* helpers                                                             */
    /* ------------------------------------------------------------------ */

    function ocState() {
        return (Saim.opencode && Saim.opencode.state) || { sessions: [] };
    }

    function sessions() {
        const list = ocState().sessions;
        return Array.isArray(list) ? list.slice() : [];
    }

    function activeId() {
        return ocState().activeSessionId || null;
    }

    function projectOf(session) {
        const dir = session && (session.directory || session.path);
        if (dir) return H.basename(dir);
        return H.basename(Saim.state.cwd) || "saim";
    }

    function letterOf(text) {
        const clean = String(text || "").trim();
        return (clean[0] || "S").toUpperCase();
    }

    function timestamp(session) {
        const time = (session && session.time) || {};
        return time.updated || time.created || session.updatedAt || session.createdAt || 0;
    }

    function formatTime(ts) {
        if (!ts) return "";
        const diff = Date.now() - ts;
        if (diff < 60 * 1000) return "now";
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins}m`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h`;
        const days = Math.floor(hours / 24);
        if (days < 30) return `${days}d`;
        return `${Math.floor(days / 30)}mo`;
    }

    function matches(session) {
        if (!query) return true;
        const needle = query.toLowerCase();
        const title = String(session.title || "").toLowerCase();
        const project = projectOf(session).toLowerCase();
        return title.includes(needle) || project.includes(needle);
    }

    function sorted() {
        return sessions()
            .filter(matches)
            .sort((a, b) => timestamp(b) - timestamp(a));
    }

    function openSession(session) {
        if (!session) return;
        if (!Saim.opencode || !Saim.opencode.isRunning()) {
            Saim.toast("Connect to OpenCode to open sessions", "warn");
            Saim.nav.go("session");
            return;
        }
        Saim.opencode.openSession(session.id);
        Saim.nav.go("session");
    }

    function newSession() {
        Saim.nav.go("session");
        if (!Saim.opencode || !Saim.opencode.isRunning()) {
            Saim.toast("Connect to OpenCode to start a session", "warn");
            return;
        }
        Saim.opencode.createSession();
    }

    /* ------------------------------------------------------------------ */
    /* rendering                                                           */
    /* ------------------------------------------------------------------ */

    function sessionNode(session, opts) {
        opts = opts || {};
        const btn = H.el("button", "sitem");
        btn.type = "button";
        if (session.id === activeId()) btn.classList.add("is-active");

        const avatar = H.el("span", "sitem__avatar", letterOf(projectOf(session)));
        btn.appendChild(avatar);

        btn.appendChild(H.el("span", "sitem__title", session.title || "Untitled session"));

        const meta = H.el("span", "sitem__meta");
        meta.appendChild(H.el("span", null, opts.project || projectOf(session)));
        meta.appendChild(H.el("span", null, opts.time || formatTime(timestamp(session))));
        btn.appendChild(meta);

        btn.title = `${session.title || "Untitled session"} · ${projectOf(session)}`;
        btn.addEventListener("click", () => openSession(session));
        return btn;
    }

    function renderSidebar() {
        if (!sessionListEl) return;
        H.clear(sessionListEl);
        sorted().slice(0, 10).forEach(session => {
            sessionListEl.appendChild(sessionNode(session));
        });

        if (!workingListEl) return;
        H.clear(workingListEl);
        const list = sessions();
        const activeSession = list.find(session => session.id === activeId());
        const busy = Boolean(ocState().sending);
        if (activeSession) {
            workingListEl.appendChild(sessionNode(activeSession, {
                project: projectOf(activeSession),
                time: busy ? "working" : "idle"
            }));
        }
    }

    function projectNode(name, path, isActive) {
        const btn = H.el("button", "pitem" + (isActive ? " is-active" : ""));
        btn.type = "button";
        btn.appendChild(H.el("span", "pitem__avatar", letterOf(name)));
        btn.appendChild(H.el("span", "pitem__name", name));
        btn.title = path;
        btn.addEventListener("click", () => {
            if (path && path !== Saim.state.cwd) {
                Saim.commands.run("folder:set", { path });
            } else {
                Saim.nav.go("file");
            }
        });
        return btn;
    }

    function renderProjects() {
        if (!projectsEl) return;
        H.clear(projectsEl);
        const cwd = Saim.state.cwd || "";
        const name = H.basename(cwd) || "saim";
        projectsEl.appendChild(projectNode(name, cwd, true));
        if (cwd !== "/home/saim") {
            projectsEl.appendChild(projectNode("Default Project", "/home/saim", false));
        }
    }

    function renderToday() {
        if (!todayEl) return;
        H.clear(todayEl);
        const list = sorted().slice(0, 12);
        if (!list.length) {
            todayEl.appendChild(H.el("div", "home__empty", query
                ? "No sessions match your search."
                : "No sessions yet — start one from the composer or the New session button."));
            return;
        }
        list.forEach(session => {
            const btn = H.el("button", "pitem");
            btn.type = "button";
            btn.appendChild(H.el("span", "pitem__avatar", letterOf(projectOf(session))));
            const name = H.el("span", "pitem__name", session.title || "Untitled session");
            btn.appendChild(name);
            btn.appendChild(H.el("span", "pitem__proj", projectOf(session)));
            btn.title = `${session.title || "Untitled session"} · ${projectOf(session)}`;
            btn.addEventListener("click", () => openSession(session));
            todayEl.appendChild(btn);
        });
    }

    async function renderRecentDev() {
        const host = document.getElementById("home-recent-dev");
        if (!host) return;
        H.clear(host);
        const log = await Saim.bridge.gitLog({ cwd: Saim.state.cwd, limit: 8 });
        const commits = (log && log.commits) || [];
        if (!commits.length) {
            host.appendChild(H.el("div", "home__empty", "No git history in this folder."));
            return;
        }
        commits.forEach(c => {
            const btn = H.el("button", "pitem");
            btn.type = "button";
            btn.appendChild(H.el("span", "pitem__avatar", letterOf(c.message)));
            const name = H.el("span", "pitem__name", c.message || "(no message)");
            btn.appendChild(name);
            const meta = H.el("span", "pitem__proj");
            const parts = [];
            if (c.author) parts.push(c.author);
            if (c.time) parts.push(formatTime(c.time));
            meta.textContent = parts.join(" · ");
            btn.appendChild(meta);
            btn.title = `${c.message}\n${c.author || ""} · ${c.time || ""}`;
            btn.addEventListener("click", () => {
                if (c.file) Saim.commands.run("file:open", { path: c.file });
            });
            host.appendChild(btn);
        });
    }

    function renderSessionHeader() {
        const titleEl = document.getElementById("sess-title");
        const projectEl = document.getElementById("sess-project");
        const tokensEl = document.getElementById("sess-tokens");
        if (!titleEl) return;

        const state = ocState();
        const active = (state.sessions || []).find(session => session.id === activeId());
        titleEl.textContent = active ? (active.title || "Session") : "New session";
        if (projectEl) projectEl.textContent = H.basename(Saim.state.cwd) || "saim";

        if (tokensEl) {
            const messages = Array.isArray(state.messages) ? state.messages : [];
            let chars = 0;
            messages.forEach(msg => {
                const content = msg.content;
                if (typeof msg.text === "string") chars += msg.text.length;
                else if (msg.payload && typeof msg.payload.text === "string") chars += msg.payload.text.length;
                else if (typeof content === "string") chars += content.length;
                else if (Array.isArray(content)) {
                    content.forEach(part => { if (part && part.text) chars += String(part.text).length; });
                }
            });
            const tokens = Math.max(0, Math.round(chars / 4));
            tokensEl.textContent = tokens >= 1000
                ? `${(tokens / 1000).toFixed(tokens >= 10000 ? 0 : 1)}k tokens`
                : `${tokens} tokens`;
        }
    }

    function render() {
        renderSidebar();
        renderProjects();
        renderToday();
        renderRecentDev();
        renderSessionHeader();
    }

    /* ------------------------------------------------------------------ */
    /* init                                                                */
    /* ------------------------------------------------------------------ */

    function focusSearch() {
        if (!searchEl) return;
        Saim.nav.go("home");
        setTimeout(() => searchEl.focus(), 40);
    }

    function init() {
        sessionListEl = document.getElementById("session-list");
        workingListEl = document.getElementById("working-list");
        workingHeadEl = document.getElementById("working-head");
        projectsEl = document.getElementById("home-projects");
        todayEl = document.getElementById("home-today");
        searchEl = document.getElementById("home-search");

        const refreshDev = document.getElementById("home-refresh-dev");
        if (refreshDev) refreshDev.addEventListener("click", renderRecentDev);

        if (workingHeadEl) {
            workingHeadEl.addEventListener("click", () => {
                const open = workingHeadEl.getAttribute("aria-expanded") !== "false";
                workingHeadEl.setAttribute("aria-expanded", open ? "false" : "true");
                if (workingListEl) workingListEl.hidden = open;
            });
        }

        if (searchEl) {
            searchEl.addEventListener("input", () => {
                query = searchEl.value.trim();
                renderSidebar();
                renderToday();
            });
            searchEl.addEventListener("keydown", event => {
                if (event.key === "Escape") {
                    searchEl.value = "";
                    query = "";
                    render();
                    searchEl.blur();
                }
            });
        }

        const searchLink = document.getElementById("sb-search-link");
        if (searchLink) searchLink.addEventListener("click", focusSearch);

        const newBtn = document.getElementById("sb-new-session");
        if (newBtn) newBtn.addEventListener("click", newSession);
        const homeNew = document.getElementById("home-new-session");
        if (homeNew) homeNew.addEventListener("click", newSession);
        const newTab = document.getElementById("sp-new-tab");
        if (newTab) newTab.addEventListener("click", newSession);
        const newSessionRow = document.getElementById("sp-row-new-session");
        if (newSessionRow) newSessionRow.addEventListener("click", newSession);

        const openFolder = document.getElementById("home-openfolder");
        if (openFolder) openFolder.addEventListener("click", () => Saim.commands.run("folder:choose"));

        const help = document.getElementById("home-help");
        if (help) help.addEventListener("click", () => Saim.commands.run("help:shortcuts"));

        // Session header actions
        const copy = document.getElementById("sess-copy");
        if (copy) {
            copy.addEventListener("click", () => {
                const state = ocState();
                const text = (state.messages || []).map(msg => {
                    if (typeof msg.text === "string") return msg.text;
                    if (msg.payload && typeof msg.payload.text === "string") return msg.payload.text;
                    if (typeof msg.content === "string") return msg.content;
                    if (Array.isArray(msg.content)) {
                        return msg.content.filter(part => part && part.text).map(part => part.text).join("\n");
                    }
                    return "";
                }).filter(Boolean).join("\n\n");
                if (!text) { Saim.toast("Nothing to copy yet", "warn"); return; }
                Saim.bridge.clipboardWrite(text);
                Saim.toast("Conversation copied", "ok");
            });
        }

        const more = document.getElementById("sess-more");
        if (more) {
            more.addEventListener("click", event => {
                const rect = more.getBoundingClientRect();
                Saim.modal.contextMenu([
                    { label: "New session", icon: "+", action: newSession },
                    {
                        label: "Rename session", icon: "✎", action: async () => {
                            const active = sessions().find(session => session.id === activeId());
                            if (!active) { Saim.toast("No active session", "warn"); return; }
                            const name = await Saim.modal.prompt("Session title", active.title || "");
                            if (name) {
                                await Saim.bridge.ocRequest("PATCH", `/api/session/${active.id}`, { title: name });
                                Saim.opencode.refreshAll();
                            }
                        }
                    },
                    {
                        label: "Delete session", icon: "🗑", action: () => {
                            if (activeId()) Saim.opencode.deleteSession(activeId());
                        }
                    },
                    { label: "Open preferences", icon: "⚙", action: () => Saim.nav.go("preferences") }
                ], rect.left - 140, rect.bottom + 6);
            });
        }

        const panelBtn = document.getElementById("sess-panel");
        if (panelBtn) panelBtn.addEventListener("click", () => Saim.app.togglePanel());

        // Re-render whenever the OpenCode client refreshes.
        Saim.bus.on("opencode:render", () => render());
        Saim.bus.on("opencode:state", () => render());
        Saim.bus.on("theme:changed", () => render());

        render();
    }

    Saim.home = { init, render, focusSearch, newSession, renderSessionHeader };
})(window.Saim);
