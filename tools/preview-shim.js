/**
 * Saim CLI - browser preview shim
 * ---------------------------------------------------------------------------
 * The desktop build talks to the main process through the preload bridge.
 * In preview mode (tools/preview-server.js) the very same interface is
 * provided over HTTP + Server-Sent Events, so the interface behaves
 * identically in a normal browser.
 */
(function () {
    "use strict";

    const listeners = new Map();

    function emit(channel, payload) {
        (listeners.get(channel) || []).forEach(cb => {
            try { cb(payload); } catch (e) { console.error(e); }
        });
    }

    async function get(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${url} -> ${res.status}`);
        return res.json();
    }

    async function post(url, body) {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body || {})
        });
        if (!res.ok) throw new Error(`${url} -> ${res.status}`);
        return res.json();
    }

    const query = payload => new URLSearchParams(
        Object.entries(payload || {}).map(([k, v]) => [k, v === undefined || v === null ? "" : String(v)])
    ).toString();

    const handlers = {
        "app:getSettings": () => get("/api/settings"),
        "app:saveSettings": payload => post("/api/settings", payload),
        "app:getState": () => get("/api/state"),
        "app:saveState": payload => post("/api/state", payload),
        "app:info": () => get("/api/info"),
        "app:devtools": () => Promise.resolve({ ok: true }),

        "terminal:create": payload => post("/api/terminal/create", payload),
        "terminal:write": payload => post("/api/terminal/write", payload),
        "terminal:resize": payload => post("/api/terminal/resize", payload),
        "terminal:kill": payload => post("/api/terminal/kill", payload),
        "terminal:list": () => Promise.resolve([]),

        "opencode:create": payload => post("/api/opencode/create", payload),
        "opencode:write": payload => post("/api/opencode/write", payload),
        "opencode:resize": payload => post("/api/opencode/resize", payload),
        "opencode:kill": payload => post("/api/opencode/kill", payload),
        "opencode:which": () => get("/api/shell/which?cmd=opencode"),

        "oc:discover": () => post("/api/oc/discover"),
        "oc:status": () => get("/api/oc/status"),
        "oc:stop": () => post("/api/oc/stop"),
        "oc:request": payload => post("/api/oc/request", payload),
        "oc:startEvents": () => Promise.resolve({ ok: true }),
        "oc:stopEvents": () => Promise.resolve({ ok: true }),
        "oc:pair": () => post("/api/oc/pair"),
        "oc:cli": payload => post("/api/oc/cli", payload),
        "oc:connect": payload => post("/api/oc/connect", payload),

        "fs:list": payload => get(`/api/fs/list?${query(payload)}`),
        "fs:read": payload => get(`/api/fs/read?${query(payload)}`),
        "fs:stat": payload => get(`/api/fs/stat?${query(payload)}`),
        "fs:write": payload => post("/api/fs/write", payload),
        "fs:mkdir": payload => post("/api/fs/mkdir", payload),
        "fs:remove": payload => post("/api/fs/remove", payload),
        "fs:rename": payload => post("/api/fs/rename", payload),
        "fs:exists": payload => get(`/api/fs/stat?${query(payload)}`).then(() => true).catch(() => false),

        "dialog:openDirectory": () => Promise.resolve(null),
        "dialog:openFile": () => Promise.resolve(null),
        "dialog:message": () => Promise.resolve(true),

        "clipboard:read": () => get("/api/clipboard/read"),
        "clipboard:write": payload => post("/api/clipboard/write", payload),

        "sys:info": () => get("/api/sys/info"),
        "git:info": payload => get(`/api/git/info?${query(payload)}`),
        "git:status": payload => get(`/api/git/status?${query(payload)}`),
        "git:log": payload => get(`/api/git/log?${query(payload)}`),
        "git:incoming": payload => get(`/api/git/incoming?${query(payload)}`),
        "git:diff": payload => post("/api/git/diff", payload),
        "git:fetch": payload => post("/api/git/fetch", payload),
        "git:pull": payload => post("/api/git/pull", payload),
        "git:push": payload => post("/api/git/push", payload),
        "github:info": payload => post("/api/github/info", payload),
        "github:commits": payload => post("/api/github/commits", payload),
        "hosting:vercelWhoami": payload => post("/api/hosting/vercel/whoami", payload),
        "hosting:vercelProjects": payload => get(`/api/hosting/vercel/projects?${query(payload)}`),
        "hosting:vercelDeploy": payload => post("/api/hosting/vercel/deploy", payload),
        "hosting:netlifySites": payload => get(`/api/hosting/netlify/sites?${query(payload)}`),
        "hosting:netlifyDeploy": payload => post("/api/hosting/netlify/deploy", payload),

        "shell:which": payload => get(`/api/shell/which?${query(payload)}`),
        "shell:run": payload => post("/api/shell/run", payload),
        "app:openExternal": () => Promise.resolve({ ok: true }),

        "window:action": () => Promise.resolve({ ok: true }),
        "window:isMaximized": () => Promise.resolve(false)
    };

    // Live channels (terminal output, cwd tracking, …)
    const stream = new EventSource("/api/stream");
    stream.onmessage = event => {
        try {
            const parsed = JSON.parse(event.data);
            if (parsed && parsed.channel) emit(parsed.channel, parsed.payload);
        } catch (e) { /* ignore malformed frames */ }
    };
    stream.onerror = () => { /* the browser retries automatically */ };

    window.saim = {
        invoke: (channel, payload) => {
            const handler = handlers[channel];
            if (!handler) {
                console.warn(`[preview] no handler for ${channel}`);
                return Promise.resolve(null);
            }
            return handler(payload).catch(err => {
                console.error(`[preview] ${channel} failed:`, err);
                return null;
            });
        },
        on: (channel, callback) => {
            if (!listeners.has(channel)) listeners.set(channel, []);
            listeners.get(channel).push(callback);
            return () => {
                const list = listeners.get(channel) || [];
                const index = list.indexOf(callback);
                if (index !== -1) list.splice(index, 1);
            };
        },
        removeAll: () => {},
        getPathForFile: () => "",
        channels: {}
    };

    console.info("[preview] Saim CLI bridge ready");
})();
