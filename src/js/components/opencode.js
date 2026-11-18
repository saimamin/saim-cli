/**
 * Saim CLI - OpenCode integration
 * ---------------------------------------------------------------------------
 * Two modes:
 *   - "native": a full GUI client talking to the opencode server over its HTTP
 *     API (sessions, chat, agents, commands, MCP, plugins, skills, models,
 *     tools, pairing).
 *   - "tui":    the opencode TUI rendered inside an embedded terminal.
 *
 * The native mode is the default and is what makes Saim CLI a first-class
 * OpenCode client, the same way the opencode desktop app is.
 */
window.Saim = window.Saim || {};

(function (Saim) {
    "use strict";

    const H = Saim.helpers;
    const B = Saim.bridge;

    // ---------------------------------------------------------------- state
    const state = {
        mode: "native",          // "native" | "tui"
        connected: false,
        url: null,
        version: null,
        connecting: false,
        activeTab: "chat",
        sessions: [],
        activeSessionId: null,
        messages: [],
        agents: [],
        activeAgent: "build",
        commands: [],
        mcp: {},
        plugins: [],
        skills: [],
        models: [],
        activeModel: null,
        permissions: [],
        pairing: null,
        sending: false
    };

    let nativeHost = null;
    let chatHost = null;
    let statusEl = null;
    let overlayEl = null;

    // ---------------------------------------------------------------- status
    function setStatus(text, kind) {
        Saim.state.opencode.status = text;
        Saim.bus.emit("opencode:status", { text, kind });
    }

    // ---------------------------------------------------------------- connect
    async function discover() {
        state.connecting = true;
        renderHeader();
        try {
            const res = await B.ocDiscover();
            if (res && res.running) {
                state.connected = true;
                state.url = res.url;
                state.version = res.version;
                state.mode = "native";
                setStatus(`connected · v${res.version || "?"}`, "ok");
                await B.ocStartEvents();
                await refreshAll();
            } else {
                state.connected = false;
                state.url = null;
                setStatus(res && res.error ? res.error : "not connected", "error");
            }
        } catch (err) {
            state.connected = false;
            state.connecting = false;
            setStatus(err && err.message ? err.message : "discovery failed", "error");
        } finally {
            state.connecting = false;
            render();
        }
    }

    async function connectManual(url, password) {
        try {
            const res = await B.ocConnect(url, password);
            if (res && res.ok) {
                state.connected = true;
                state.url = url;
                state.version = (res.data && res.data.version) || null;
                setStatus("connected", "ok");
                await B.ocStartEvents();
                await refreshAll();
            } else {
                setStatus(res && res.error ? res.error : "connection failed", "error");
                Saim.toast("Could not connect to the OpenCode server", "error");
            }
        } catch (err) {
            setStatus(err && err.message ? err.message : "connection failed", "error");
            Saim.toast("Could not connect to the OpenCode server", "error");
        } finally {
            render();
        }
    }

    async function disconnect() {
        await B.ocStop();
        state.connected = false;
        state.url = null;
        state.version = null;
        state.sessions = [];
        state.activeSessionId = null;
        state.messages = [];
        setStatus("disconnected", "warn");
        render();
    }

    // ---------------------------------------------------------------- refresh
    async function refreshAll() {
        if (!state.connected) return;
        const req = (m, p) => B.ocRequest(m, p);
        try {
            const [agents, commands, mcp, plugins, skills, models, sessions] = await Promise.all([
                req("GET", "/api/agent"),
                req("GET", "/api/command"),
                req("GET", "/api/mcp"),
                req("GET", "/api/plugin"),
                req("GET", "/api/skill"),
                req("GET", "/api/model"),
                req("GET", "/api/session")
            ]);
        if (agents && agents.ok) state.agents = (agents.data && agents.data.data) || agents.data || [];
        if (commands && commands.ok) state.commands = (commands.data && commands.data.data) || commands.data || [];
        if (mcp && mcp.ok) state.mcp = (mcp.data && mcp.data.data) || mcp.data || {};
        if (plugins && plugins.ok) state.plugins = (plugins.data && plugins.data.data) || plugins.data || [];
        if (skills && skills.ok) state.skills = (skills.data && skills.data.data) || skills.data || [];
        if (models && models.ok) {
            const d = models.data;
            state.models = (d && (d.data || d.all || d)) || [];
        }
        if (sessions && sessions.ok) {
            const d = sessions.data;
            state.sessions = (d && (d.data || d)) || [];
        }
        const cfg = await req("GET", "/api/config");
        if (cfg && cfg.ok && cfg.data && !Array.isArray(cfg.data)) {
            // /api/config may return a config-location list on some builds; guard it.
            state.activeModel = cfg.data.model || state.activeModel;
            state.activeAgent = cfg.data.default_agent || state.activeAgent;
        }
        if (!state.activeSessionId && state.sessions.length) {
            const first = state.sessions[0];
            state.activeSessionId = (first && first.id) || null;
        }
        if (state.activeSessionId) await loadMessages(state.activeSessionId);
        } catch (err) {
            // Best-effort refresh: keep whatever loaded and still repaint below.
        }
        render();
    }

    async function loadMessages(sessionId) {
        const res = await B.ocRequest("GET", `/api/session/${sessionId}/message`);
        if (res && res.ok) {
            const d = res.data;
            state.messages = (d && (d.data || d)) || [];
            // Adopt the agent/model used by the latest assistant message.
            for (let i = state.messages.length - 1; i >= 0; i--) {
                const m = state.messages[i];
                if (m && m.type === "assistant") {
                    if (m.agent) state.activeAgent = m.agent;
                    if (m.model && m.model.id) state.activeModel = m.model.id;
                    break;
                }
            }
        }
    }

    // ---------------------------------------------------------------- sessions
    async function createSession(title) {
        const res = await B.ocRequest("POST", "/api/session", { title: title || "New session" });
        if (res && res.ok) {
            const session = (res.data && (res.data.data || res.data));
            state.sessions.unshift(session);
            state.activeSessionId = session.id;
            state.messages = [];
            await loadMessages(session.id);
            Saim.toast("Session created", "ok");
        } else {
            Saim.toast("Could not create session", "error");
        }
        render();
    }

    async function openSession(id) {
        state.activeSessionId = id;
        state.messages = [];
        await loadMessages(id);
        render();
    }

    async function deleteSession(id) {
        const ok = await Saim.modal.confirm("Delete this session?", "All messages and data will be removed.");
        if (!ok) return;
        await B.ocRequest("DELETE", `/api/session/${id}`);
        state.sessions = state.sessions.filter(s => s.id !== id);
        if (state.activeSessionId === id) {
            state.activeSessionId = state.sessions[0] ? state.sessions[0].id : null;
            state.messages = [];
            if (!state.activeSessionId && state.sessions.length) {
            const first = state.sessions[0];
            state.activeSessionId = (first && first.id) || null;
        }
        if (state.activeSessionId) await loadMessages(state.activeSessionId);
        }
        render();
        Saim.toast("Session deleted", "ok");
    }

    // ---------------------------------------------------------------- chat
    async function sendMessage(text) {
        if (!text || !text.trim() || state.sending) return;
        if (!state.activeSessionId) await createSession();
        if (!state.activeSessionId) return;

        // Optimistically echo the user prompt using the server shape {type:"user", payload:{text}}.
        state.messages.push({ type: "user", payload: { text: text.trim() } });
        state.sending = true;
        renderChat();

        // The prompt body only accepts text/files/agents/skills/metadata/delivery/resume
        // (additionalProperties: false). Agent/model are bound via dedicated endpoints.
        // Valid delivery values: "steer" | "queue".
        const body = { text: text.trim(), delivery: "steer" };
        const res = await B.ocRequest("POST", `/api/session/${state.activeSessionId}/prompt`, body);
        state.sending = false;
        if (!res || !res.ok) {
            Saim.toast("Send failed: " + ((res && res.error) || "unknown"), "error");
        }
        // The assistant reply streams in asynchronously; poll until it lands.
        for (let i = 0; i < 25; i++) {
            await new Promise(r => setTimeout(r, 1000));
            await loadMessages(state.activeSessionId);
            render();
            const last = state.messages[state.messages.length - 1];
            const role = last && messageRole(last);
            if (role === "assistant" || (last && last.type === "idle")) break;
        }
    }

    async function runCommand(name, args) {
        if (!state.activeSessionId) await createSession();
        if (!state.activeSessionId) return;
        const res = await B.ocRequest("POST", `/api/session/${state.activeSessionId}/command`, {
            name: name, text: args || ""
        });
        if (res && res.ok) {
            const msg = (res.data && (res.data.data || res.data));
            if (msg) state.messages.push(msg);
        }
        await loadMessages(state.activeSessionId);
        render();
    }

    async function replyPermission(requestId, decision) {
        await B.ocRequest("POST", `/api/session/${state.activeSessionId}/permission/${requestId}/reply`, { decision });
        state.permissions = state.permissions.filter(p => p.id !== requestId);
        render();
    }

    async function switchAgent(id) {
        state.activeAgent = id;
        if (state.activeSessionId) await B.ocRequest("POST", `/api/session/${state.activeSessionId}/agent`, { agent: id });
        render();
    }

    async function switchModel(id) {
        // POST /api/session/{id}/model requires Model.Ref {id, providerID}.
        const entry = Array.isArray(state.models) && state.models.find(m => (m.id || m) === id);
        let ref;
        if (entry && entry.providerID) {
            ref = { id: entry.id || id, providerID: entry.providerID };
        } else if (typeof id === "string" && id.includes("/")) {
            ref = { providerID: id.split("/")[0], id: id.split("/").slice(1).join("/") };
        } else {
            ref = { providerID: "opencode", id: String(id) };
        }
        state.activeModel = id;
        if (state.activeSessionId) {
            const res = await B.ocRequest("POST", `/api/session/${state.activeSessionId}/model`, { model: ref });
            if (!res || !res.ok) Saim.toast("Could not switch model: " + ((res && res.error) || ""), "error");
        }
        render();
    }

    // ---------------------------------------------------------------- pair
    async function pair() {
        const res = await B.ocPair();
        if (res && res.ok) {
            state.pairing = res.data;
            Saim.toast("Pairing code generated", "ok");
        } else {
            state.pairing = null;
            Saim.toast("Could not generate a pairing code", "error");
        }
        render();
    }

    // ---------------------------------------------------------------- mode
    function setMode(mode) {
        state.mode = mode;
        const host = resolveAiHost();
        if (mode === "tui") {
            if (host) { H.clear(host); host.hidden = true; }
            if (Saim.opencodeTui && Saim.opencodeTui.show) Saim.opencodeTui.show();
            if (!Saim.state.opencode.running && Saim.opencodeTui) Saim.opencodeTui.start();
        } else {
            if (Saim.opencodeTui && Saim.opencodeTui.hide) Saim.opencodeTui.hide();
            if (host) host.hidden = false;
        }
        render();
    }

    // ---------------------------------------------------------------- events
    function handleEvent(event) {
        if (!event || !event.type) return;
        const data = event.data || {};
        // Session created/updated
        if (event.type === "session.updated" || event.type === "session.created") {
            refreshAll();
        }
        // New message
        if (event.type === "message.created" || event.type === "message.updated") {
            if (data.sessionID === state.activeSessionId || !data.sessionID) {
                loadMessages(state.activeSessionId).then(render);
            }
        }
        // Permission request
        if (event.type === "permission.requested" || event.type === "permission.created") {
            if (data.sessionID === state.activeSessionId) {
                state.permissions.push(data);
                render();
            }
        }
        // Status / idle
        if (event.type === "session.status" || event.type === "session.idle") {
            renderHeader();
        }
    }

    Saim.bus.on("opencode:event", handleEvent);

    // ---------------------------------------------------------------- rendering
    function render() {
        const host = resolveAiHost();
        if (!host) return;
        if (state.mode === "tui") return; // native hidden
        H.clear(host);
        host.hidden = false;

        // Header
        const header = H.el("div", "oc__header");
        const title = H.el("div", "oc__title");
        const dot = H.el("span", `dot ${state.connected ? (state.sending ? "is-busy" : "is-on") : ""}`);
        title.appendChild(dot);
        title.appendChild(H.el("span", null, state.connected
            ? `OpenCode · v${state.version || "?"}`
            : "OpenCode · not connected"));
        header.appendChild(title);

        const pills = H.el("div", "oc__pills");
        if (state.connected) {
            pills.appendChild(H.el("span", "oc__pill is-accent", state.activeAgent || "build"));
            if (state.activeModel) pills.appendChild(H.el("span", "oc__pill", state.activeModel));
            if (state.url) pills.appendChild(H.el("span", "oc__pill oc__pill--url", state.url.replace("http://", "")));
        }
        const modeBtn = H.el("button", "oc__pill", state.mode === "native" ? "Native" : "TUI");
        modeBtn.title = "Toggle between the native panel and the embedded terminal";
        modeBtn.addEventListener("click", () => setMode(state.mode === "native" ? "tui" : "native"));
        pills.appendChild(modeBtn);
        header.appendChild(pills);
        host.appendChild(header);

        // Sub-tabs
        const tabs = H.el("div", "oc__tabs");
        const tabDefs = [
            { id: "chat", label: "Chat" },
            { id: "sessions", label: "Sessions" },
            { id: "agents", label: "Agents" },
            { id: "commands", label: "Commands" },
            { id: "mcp", label: "MCP" },
            { id: "plugins", label: "Plugins" },
            { id: "skills", label: "Skills" },
            { id: "models", label: "Models" },
            { id: "pair", label: "Pair" }
        ];
        tabDefs.forEach(def => {
            const btn = H.el("button", `oc__tab${def.id === state.activeTab ? " is-active" : ""}`, def.label);
            btn.addEventListener("click", () => { state.activeTab = def.id; render(); });
            tabs.appendChild(btn);
        });
        host.appendChild(tabs);

        // Body
        const body = H.el("div", "oc__body");
        if (!state.connected) {
            body.appendChild(renderConnect());
        } else {
            switch (state.activeTab) {
                case "chat": body.appendChild(renderChat()); break;
                case "sessions": body.appendChild(renderSessions()); break;
                case "agents": body.appendChild(renderAgents()); break;
                case "commands": body.appendChild(renderCommands()); break;
                case "mcp": body.appendChild(renderMcp()); break;
                case "plugins": body.appendChild(renderPlugins()); break;
                case "skills": body.appendChild(renderSkills()); break;
                case "models": body.appendChild(renderModels()); break;
                case "pair": body.appendChild(renderPair()); break;
            }
        }
        host.appendChild(body);
        Saim.bus.emit("opencode:render", state);
    }

    function resolveAiHost() {
        // The chat lives in the session pane; the old dock host is only a
        // fallback for embedded builds.
        return document.getElementById("ai-chat-host") || document.getElementById("opencode-native");
    }

    function renderHeader() { /* header is rebuilt in render() */ }

    // ---------------------------------------------------------------- connect view
    function renderConnect() {
        const wrap = H.el("div", "oc-empty");
        const card = H.el("div", "opencode__card");
        card.style.width = "100%";
        card.appendChild(H.el("h3", null, "OpenCode"));
        card.appendChild(H.el("p", null, state.connecting
            ? "Connecting to the OpenCode server…"
            : "No OpenCode server is connected. Start the background service, or connect manually."));

        const actions = H.el("div", "oc__pills");
        const discoverBtn = H.el("button", "primarybtn", state.connecting ? "Connecting…" : "Discover server");
        discoverBtn.disabled = state.connecting;
        discoverBtn.addEventListener("click", discover);
        actions.appendChild(discoverBtn);

        const manual = H.el("button", "ghostbtn", "Connect manually");
        manual.addEventListener("click", () => {
            Saim.modal.open({
                title: "Connect to OpenCode",
                size: "sm",
                body: (body) => {
                    const wrap = H.el("div", "oc-connect");
                    const url = H.el("input", null, "");
                    url.placeholder = "http://127.0.0.1:4096";
                    const pw = H.el("input", null, "");
                    pw.type = "password";
                    pw.placeholder = "server password";
                    wrap.appendChild(url);
                    wrap.appendChild(pw);
                    body.appendChild(wrap);
                    body._url = url;
                    body._pw = pw;
                },
                actions: [
                    { label: "Cancel" },
                    {
                        label: "Connect", kind: "primary",
                        onClick: (body) => {
                            connectManual(body._url.value.trim(), body._pw.value.trim());
                        }
                    }
                ]
            });
        });
        actions.appendChild(manual);
        card.appendChild(actions);
        wrap.appendChild(card);
        return wrap;
    }

    // ---------------------------------------------------------------- chat
    function renderChat() {
        const wrap = H.el("div", "oc-chat");

        const msgs = H.el("div", "oc-chat__messages");
        if (!state.activeSessionId) {
            msgs.appendChild(H.el("div", "oc-empty", "No session selected.\nCreate one from the Sessions tab, or just start typing."));
        } else if (!state.messages.length) {
            msgs.appendChild(H.el("div", "oc-empty", "Empty session.\nSend a prompt to begin."));
        } else {
            state.messages.forEach(msg => {
                const node = renderMessage(msg);
                if (node) msgs.appendChild(node);
            });
            state.permissions.forEach(perm => msgs.appendChild(renderPermission(perm)));
        }
        wrap.appendChild(msgs);

        const composer = H.el("div", "oc-chat__composer");
        const row = H.el("div", "oc-chat__row");
        const input = H.el("textarea", "oc-chat__input");
        input.placeholder = "Ask anything… (Enter to send, Shift+Enter for a newline, / for commands)";
        input.rows = 2;
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                const text = input.value;
                input.value = "";
                handleInput(text);
            }
        });
        row.appendChild(input);
        composer.appendChild(row);

        const actions = H.el("div", "oc-chat__actions");
        const left = H.el("div", "oc-chat__row");
        const agentSel = H.el("select", "oc-chat__select");
        state.agents.forEach(a => {
            const opt = H.el("option", null, a.name || a.id);
            opt.value = a.id;
            if (a.id === state.activeAgent) opt.selected = true;
            agentSel.appendChild(opt);
        });
        agentSel.addEventListener("change", () => switchAgent(agentSel.value));
        left.appendChild(agentSel);

        const modelSel = H.el("select", "oc-chat__select");
        state.models.forEach(m => {
            const id = m.id || m;
            const opt = H.el("option", null, (m.name || m.id || m));
            opt.value = id;
            if (id === state.activeModel) opt.selected = true;
            modelSel.appendChild(opt);
        });
        modelSel.addEventListener("change", () => switchModel(modelSel.value));
        left.appendChild(modelSel);
        actions.appendChild(left);

        const sendBtn = H.el("button", "primarybtn", state.sending ? "…" : "Send");
        sendBtn.disabled = state.sending;
        sendBtn.addEventListener("click", () => {
            const text = input.value;
            input.value = "";
            handleInput(text);
        });
        actions.appendChild(sendBtn);
        composer.appendChild(actions);
        wrap.appendChild(composer);

        // auto-scroll
        setTimeout(() => { msgs.scrollTop = msgs.scrollHeight; }, 30);
        return wrap;
    }

    function handleInput(text) {
        const trimmed = (text || "").trim();
        if (!trimmed) return;
        if (trimmed.startsWith("/")) {
            const parts = trimmed.slice(1).split(/\s+/);
            const name = parts[0];
            const args = parts.slice(1).join(" ");
            const cmd = state.commands.find(c => c.name === name);
            if (cmd) { runCommand(name, args); return; }
            // built-in shortcuts
            if (name === "new") { createSession(args || "New session"); return; }
            if (name === "sessions") { state.activeTab = "sessions"; render(); return; }
            if (name === "agents") { state.activeTab = "agents"; render(); return; }
            if (name === "models") { state.activeTab = "models"; render(); return; }
            if (name === "mcp") { state.activeTab = "mcp"; render(); return; }
            if (name === "plugins") { state.activeTab = "plugins"; render(); return; }
            if (name === "skills") { state.activeTab = "skills"; render(); return; }
            if (name === "pair") { state.activeTab = "pair"; render(); return; }
            if (name === "help") {
                const help = state.commands.map(c => `/${c.name} — ${c.description || ""}`).join("\n");
                state.messages.push({ type: "assistant", content: [{ type: "text", text: help || "No commands available." }] });
                render();
                return;
            }
        }
        sendMessage(trimmed);
    }

    function messageRole(msg) {
        if (msg.type === "user") return "user";
        if (msg.type === "assistant") return "assistant";
        if (msg.type === "idle") return null;
        if (msg.role) return msg.role;
        if (msg.info && msg.info.role) return msg.info.role;
        return "assistant";
    }

    function messageText(msg) {
        if (typeof msg.text === "string") return msg.text;
        if (msg.payload && typeof msg.payload.text === "string") return msg.payload.text;
        const content = msg.content;
        if (Array.isArray(content)) {
            return content.filter(p => p.type === "text" && p.text).map(p => p.text).join("\n");
        }
        if (typeof content === "string") return content;
        if (msg.info && msg.info.content) {
            const c = msg.info.content;
            if (Array.isArray(c)) return c.filter(p => p.type === "text" && p.text).map(p => p.text).join("\n");
            if (typeof c === "string") return c;
        }
        return "";
    }

    function renderMessage(msg) {
        const role = messageRole(msg);
        if (role === null) return null; // idle
        const isUser = role === "user";
        const node = H.el("div", `oc-msg ${isUser ? "oc-msg--user" : "oc-msg--assistant"}`);

        const head = H.el("div", "oc-msg__head");
        head.appendChild(H.el("span", null, isUser ? "You" : (msg.agent || state.activeAgent || "Assistant")));
        if (msg.model && msg.model.id) head.appendChild(H.el("span", null, `· ${msg.model.id}`));
        node.appendChild(head);

        const body = H.el("div", "oc-msg__body");
        const text = messageText(msg);
        if (text) body.appendChild(H.el("div", null, text));

        // tool calls (assistant messages carry them in content[])
        const content = msg.content || (msg.info && msg.info.content) || [];
        if (Array.isArray(content)) {
            content.forEach(part => {
                if (part.type === "tool" || part.type === "tool_use" || part.type === "tool_result") {
                    const row = H.el("div", "oc-msg__tool-row");
                    const status = H.el("span", `status ${part.state === "completed" ? "is-done" : (part.state === "error" ? "is-error" : "is-running")}`,
                        part.state === "completed" ? "✓" : (part.state === "error" ? "✗" : "…"));
                    row.appendChild(status);
                    row.appendChild(H.el("span", null, part.tool || part.name || "tool"));
                    if (part.input) row.appendChild(H.el("span", null, JSON.stringify(part.input).slice(0, 80)));
                    if (part.output) row.appendChild(H.el("span", null, String(part.output).slice(0, 80)));
                    body.appendChild(row);
                } else if (part.type === "reasoning" && part.text) {
                    const span = H.el("div", null, `💭 ${part.text}`);
                    span.style.opacity = "0.7";
                    body.appendChild(span);
                }
            });
        }

        if (!body.childElementCount && !body.textContent.trim()) {
            body.textContent = "…";
        }
        node.appendChild(body);
        return node;
    }

    function renderPermission(perm) {
        const node = H.el("div", "oc-perm");
        node.appendChild(H.el("div", "oc-perm__head", "Permission requested"));
        node.appendChild(H.el("div", "oc-perm__body", JSON.stringify(perm, null, 2).slice(0, 600)));
        const actions = H.el("div", "oc-perm__actions");
        // Permission.Reply enum: "once" | "always" | "reject"
        const deny = H.el("button", "ghostbtn", "Reject");
        deny.addEventListener("click", () => replyPermission(perm.id, "reject"));
        const always = H.el("button", "ghostbtn", "Always");
        always.addEventListener("click", () => replyPermission(perm.id, "always"));
        const allow = H.el("button", "primarybtn", "Allow once");
        allow.addEventListener("click", () => replyPermission(perm.id, "once"));
        actions.appendChild(deny);
        actions.appendChild(always);
        actions.appendChild(allow);
        node.appendChild(actions);
        return node;
    }

    // ---------------------------------------------------------------- sessions
    function renderSessions() {
        const wrap = H.el("div", "oc-list");
        const header = H.el("div", "oc__row");
        header.style.cursor = "default";
        header.appendChild(H.el("span", "oc-row__title", `Sessions (${state.sessions.length})`));
        const newBtn = H.el("button", "primarybtn", "+ New");
        newBtn.addEventListener("click", () => createSession());
        header.appendChild(newBtn);
        wrap.appendChild(header);

        if (!state.sessions.length) {
            wrap.appendChild(H.el("div", "oc-empty", "No sessions yet.\nCreate one to start chatting."));
            return wrap;
        }
        state.sessions.forEach(s => {
            const row = H.el("div", `oc-row${s.id === state.activeSessionId ? " is-active" : ""}`);
            row.appendChild(H.el("span", "oc-row__icon", "❯"));
            const main = H.el("div", "oc-row__main");
            main.appendChild(H.el("div", "oc-row__title", s.title || s.id));
            main.appendChild(H.el("div", "oc-row__sub", `${s.id} · ${s.agent || "build"}`));
            row.appendChild(main);
            const del = H.el("button", "oc-row__badge", "✕");
            del.addEventListener("click", (e) => { e.stopPropagation(); deleteSession(s.id); });
            row.appendChild(del);
            row.addEventListener("click", () => openSession(s.id));
            wrap.appendChild(row);
        });
        return wrap;
    }

    // ---------------------------------------------------------------- agents
    function renderAgents() {
        const wrap = H.el("div", "oc-list");
        if (!state.agents.length) {
            wrap.appendChild(H.el("div", "oc-empty", "No agents reported by the server."));
            return wrap;
        }
        state.agents.forEach(a => {
            const row = H.el("div", `oc-row${a.id === state.activeAgent ? " is-active" : ""}`);
            row.appendChild(H.el("span", "oc-row__icon", "◆"));
            const main = H.el("div", "oc-row__main");
            main.appendChild(H.el("div", "oc-row__title", a.name || a.id));
            main.appendChild(H.el("div", "oc-row__sub", a.description || a.mode || ""));
            row.appendChild(main);
            row.appendChild(H.el("span", "oc-row__badge", a.mode || "agent"));
            row.addEventListener("click", () => switchAgent(a.id));
            wrap.appendChild(row);
        });
        return wrap;
    }

    // ---------------------------------------------------------------- commands
    function renderCommands() {
        const wrap = H.el("div", "oc-list");
        if (!state.commands.length) {
            wrap.appendChild(H.el("div", "oc-empty", "No commands reported by the server."));
            return wrap;
        }
        state.commands.forEach(c => {
            const row = H.el("div", "oc-row");
            row.appendChild(H.el("span", "oc-row__icon", "/"));
            const main = H.el("div", "oc-row__main");
            main.appendChild(H.el("div", "oc-row__title", `/${c.name}`));
            main.appendChild(H.el("div", "oc-row__sub", c.description || ""));
            row.appendChild(main);
            row.addEventListener("click", () => {
                const args = prompt(`Arguments for /${c.name}`, "");
                if (args !== null) runCommand(c.name, args);
            });
            wrap.appendChild(row);
        });
        return wrap;
    }

    // ---------------------------------------------------------------- mcp
    function renderMcp() {
        const wrap = H.el("div", "oc-list");
        const servers = Object.keys(state.mcp || {});
        if (!servers.length) {
            wrap.appendChild(H.el("div", "oc-empty", "No MCP servers configured.\nUse `opencode mcp add` or the Saim CLI settings to add one."));
            const add = H.el("button", "primarybtn", "Add MCP server");
            add.addEventListener("click", () => addMcp());
            wrap.appendChild(add);
            return wrap;
        }
        servers.forEach(name => {
            const info = state.mcp[name] || {};
            const status = info.status || info.state || "unknown";
            const ok = status === "connected" || status === "ready";
            const row = H.el("div", "oc-row");
            row.appendChild(H.el("span", "oc-row__icon", "plug"));
            const main = H.el("div", "oc-row__main");
            main.appendChild(H.el("div", "oc-row__title", name));
            main.appendChild(H.el("div", "oc-row__sub", `${status} · ${info.tools ? info.tools.length + " tools" : ""}`));
            row.appendChild(main);
            row.appendChild(H.el("span", `oc-row__badge ${ok ? "is-on" : "is-off"}`, status));
            const conn = H.el("button", "ghostbtn", ok ? "Disconnect" : "Connect");
            conn.addEventListener("click", async (e) => {
                e.stopPropagation();
                if (ok) await B.ocRequest("POST", `/api/experimental/mcp/${encodeURIComponent(name)}/disconnect`);
                else await B.ocRequest("POST", `/api/experimental/mcp/${encodeURIComponent(name)}/connect`);
                await refreshAll();
            });
            row.appendChild(conn);
            wrap.appendChild(row);
        });
        const add = H.el("button", "ghostbtn", "+ Add MCP server");
        add.style.marginTop = "8px";
        add.addEventListener("click", () => addMcp());
        wrap.appendChild(add);
        return wrap;
    }

    function addMcp() {
        Saim.modal.open({
            title: "Add MCP server",
            size: "sm",
            body: (body) => {
                const wrap = H.el("div", "oc-connect");
                const name = H.el("input"); name.placeholder = "server name";
                const url = H.el("input"); url.placeholder = "http://… or command";
                const type = H.el("select", "oc-chat__select");
                ["remote", "local"].forEach(t => {
                    const o = H.el("option", null, t); o.value = t; type.appendChild(o);
                });
                wrap.appendChild(name); wrap.appendChild(url); wrap.appendChild(type);
                body._name = name; body._url = url; body._type = type;
                body.appendChild(wrap);
            },
            actions: [
                { label: "Cancel" },
                {
                    label: "Add", kind: "primary",
                    onClick: async (body) => {
                        const cfg = body._type.value === "remote"
                            ? { type: "remote", url: body._url.value.trim() }
                            : { type: "local", command: body._url.value.trim().split(" ") };
                        const res = await B.ocRequest("PUT", `/api/experimental/mcp/${encodeURIComponent(body._name.value.trim())}`, { config: cfg });
                        if (res && res.ok) Saim.toast("MCP server added", "ok");
                        else Saim.toast("Failed to add MCP server", "error");
                        await refreshAll();
                    }
                }
            ]
        });
    }

    // ---------------------------------------------------------------- plugins
    function renderPlugins() {
        const wrap = H.el("div", "oc-list");
        if (!state.plugins.length) {
            wrap.appendChild(H.el("div", "oc-empty", "No plugins reported by the server."));
        } else {
            state.plugins.forEach(p => {
                const row = H.el("div", "oc-row");
                row.appendChild(H.el("span", "oc-row__icon", "plug"));
                const main = H.el("div", "oc-row__main");
                main.appendChild(H.el("div", "oc-row__title", p.id || p.name || "plugin"));
                main.appendChild(H.el("div", "oc-row__sub", (p.source && p.source.type) || ""));
                row.appendChild(main);
                const badge = H.el("span", `oc-row__badge ${p.state && p.state.status === "active" ? "is-on" : "is-off"}`,
                    (p.state && p.state.status) || "unknown");
                row.appendChild(badge);
                const rm = H.el("button", "ghostbtn", "Remove");
                rm.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    const id = p.id || p.name;
                    const ok = await Saim.modal.confirm("Remove plugin?", id);
                    if (!ok) return;
                    const res = await B.ocCli(["plugin", "remove", id]);
                    if (res && res.ok && res.data && res.data.code === 0) Saim.toast(`Plugin ${id} removed`, "ok");
                    else Saim.toast("Plugin remove failed", "error");
                    await refreshAll();
                });
                row.appendChild(rm);
                wrap.appendChild(row);
            });
        }
        const actions = H.el("div", "oc__pills");
        actions.style.marginTop = "8px";
        const add = H.el("button", "ghostbtn", "+ Add plugin");
        add.addEventListener("click", () => {
            Saim.modal.open({
                title: "Add plugin",
                size: "sm",
                body: (body) => {
                    const wrap = H.el("div", "oc-connect");
                    const name = H.el("input");
                    name.placeholder = "npm package, e.g. @opencode/plugin-git";
                    wrap.appendChild(name);
                    body._name = name;
                    body.appendChild(wrap);
                },
                actions: [
                    { label: "Cancel" },
                    {
                        label: "Add", kind: "primary",
                        onClick: async (body) => {
                            const name = body._name.value.trim();
                            if (!name) return;
                            const res = await B.ocCli(["plugin", "add", name]);
                            if (res && res.ok && res.data && res.data.code === 0) {
                                Saim.toast(`Plugin ${name} added`, "ok");
                            } else {
                                Saim.toast("Plugin add failed: " + ((res.data && res.data.stderr) || res.error || "unknown"), "error");
                            }
                            await refreshAll();
                        }
                    }
                ]
            });
        });
        actions.appendChild(add);
        const check = H.el("button", "ghostbtn", "Check for updates");
        check.addEventListener("click", async () => {
            const res = await B.ocRequest("POST", "/api/plugin/check");
            Saim.toast(res && res.ok ? "Plugin check complete" : "Plugin check failed", res && res.ok ? "ok" : "error");
            await refreshAll();
        });
        actions.appendChild(check);
        const update = H.el("button", "ghostbtn", "Update all");
        update.addEventListener("click", async () => {
            const res = await B.ocRequest("POST", "/api/plugin/update");
            Saim.toast(res && res.ok ? "Plugins updated" : "Plugin update failed", res && res.ok ? "ok" : "error");
            await refreshAll();
        });
        actions.appendChild(update);
        wrap.appendChild(actions);
        return wrap;
    }

    // ---------------------------------------------------------------- skills
    function renderSkills() {
        const wrap = H.el("div", "oc-list");
        if (!state.skills.length) {
            wrap.appendChild(H.el("div", "oc-empty", "No skills reported by the server."));
            return wrap;
        }
        state.skills.forEach(s => {
            const row = H.el("div", "oc-row");
            row.appendChild(H.el("span", "oc-row__icon", "★"));
            const main = H.el("div", "oc-row__main");
            main.appendChild(H.el("div", "oc-row__title", s.name || s.id));
            main.appendChild(H.el("div", "oc-row__sub", s.description || s.path || ""));
            row.appendChild(main);
            wrap.appendChild(row);
        });
        return wrap;
    }

    // ---------------------------------------------------------------- models
    function renderModels() {
        const wrap = H.el("div", "oc-list");
        if (!state.models.length) {
            wrap.appendChild(H.el("div", "oc-empty", "No models reported by the server."));
            return wrap;
        }
        const list = Array.isArray(state.models) ? state.models : (state.models.data || state.models.all || []);
        list.forEach(m => {
            const id = m.id || m;
            const row = H.el("div", `oc-row${id === state.activeModel ? " is-active" : ""}`);
            row.appendChild(H.el("span", "oc-row__icon", "◆"));
            const main = H.el("div", "oc-row__main");
            main.appendChild(H.el("div", "oc-row__title", m.name || id));
            main.appendChild(H.el("div", "oc-row__sub", m.provider || m.providerID || ""));
            row.appendChild(main);
            row.addEventListener("click", () => switchModel(id));
            wrap.appendChild(row);
        });
        return wrap;
    }

    // ---------------------------------------------------------------- pair
    function renderPair() {
        const wrap = H.el("div", "oc-pair");
        wrap.appendChild(H.el("h3", null, "Pair a device"));
        wrap.appendChild(H.el("p", null, "Generate a pairing code and open the OpenCode app on your phone or browser. The code expires in 5 minutes."));

        if (state.pairing) {
            wrap.appendChild(H.el("div", "oc-pair__code", state.pairing.code));
            wrap.appendChild(H.el("div", "oc-pair__url", `Server: ${state.url}`));
            wrap.appendChild(H.el("div", "oc-pair__url", `Expires in ${state.pairing.expires_in}s`));
        }

        const btn = H.el("button", "primarybtn", state.pairing ? "Regenerate code" : "Generate pairing code");
        btn.addEventListener("click", pair);
        wrap.appendChild(btn);

        // Connect to a remote server
        wrap.appendChild(H.el("div", "sidebar__section", "Connect to a remote server"));
        const conn = H.el("div", "oc-connect");
        const url = H.el("input"); url.placeholder = "http://192.168.1.5:4096"; url.id = "oc-remote-url";
        const pw = H.el("input"); pw.type = "password"; pw.placeholder = "server password"; pw.id = "oc-remote-pw";
        conn.appendChild(url); conn.appendChild(pw);
        const cbtn = H.el("button", "ghostbtn", "Connect");
        cbtn.addEventListener("click", () => {
            connectManual(url.value.trim(), pw.value.trim());
        });
        conn.appendChild(cbtn);
        wrap.appendChild(conn);
        return wrap;
    }

    // ---------------------------------------------------------------- init
    function init() {
        nativeHost = resolveAiHost();
        overlayEl = document.getElementById("opencode-overlay");
        statusEl = document.getElementById("opencode-status");

        if (Saim.opencodeTui && Saim.opencodeTui.init) Saim.opencodeTui.init();

        // Wire the legacy start button to native discover.
        const startBtn = document.getElementById("opencode-start");
        if (startBtn) startBtn.addEventListener("click", discover);

        // Listen for server events.
        B.on("opencode:event", (event) => handleEvent(event));

        // Auto-discover on init if possible.
        setTimeout(() => {
            if (Saim.state.settings.opencodeAutoConnect !== false) discover();
        }, 600);
    }

    // ---------------------------------------------------------------- public
    function start() {
        // Legacy: TUI mode start
        if (state.mode === "tui") {
            Saim.opencodeLegacyStart && Saim.opencodeLegacyStart();
            return;
        }
        discover();
    }
    function stop() { disconnect(); }
    function restart() { disconnect().then(discover); }
    function focus() { /* no-op in native mode */ }
    function fit() { /* no-op */ }
    function isRunning() { return state.connected; }

    // Expose the native state for other components (palette, commands).
    Saim.opencodeNative = state;

    Saim.opencode = {
        init,
        start,
        stop,
        restart,
        focus,
        fit,
        isRunning,
        discover,
        connect: connectManual,
        disconnect,
        createSession,
        openSession,
        deleteSession,
        sendMessage,
        runCommand,
        switchAgent,
        switchModel,
        pair,
        setMode,
        state,
        render,
        refreshAll,
        loadMessages
    };
})(window.Saim);
