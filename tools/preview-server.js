/**
 * Saim CLI - preview server
 * ---------------------------------------------------------------------------
 * Serves the Saim CLI interface over HTTP so it can be inspected in a normal
 * browser (default: http://localhost:3000).
 *
 *   node tools/preview-server.js [--port 3000]
 *
 * The renderer is the exact same code that ships in the desktop app; only the
 * IPC bridge is replaced by a small HTTP/SSE shim, so every panel, the command
 * palette, the settings and the file explorer behave exactly as in Electron.
 * Terminals are real shells running on the machine.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, execFile, exec } = require("child_process");
const { URL } = require("url");
const devops = require("../src/lib/devops");

const ROOT = path.join(__dirname, "..");
const PORT = Number((process.argv.find(a => a.startsWith("--port=")) || "").split("=")[1] || 3000);

const OC_SERVICE_REG = path.join(os.homedir(), ".local/state/opencode/service.json");
const OC_SERVICE_REG2 = path.join(os.homedir(), ".config/opencode/service.json");
function ocServiceInfo() {
    for (const p of [OC_SERVICE_REG, OC_SERVICE_REG2]) {
        try {
            if (fs.existsSync(p)) {
                const reg = JSON.parse(fs.readFileSync(p, "utf-8"));
                if (reg.url && reg.password) return reg;
            }
        } catch (e) { /* ignore */ }
    }
    return null;
}
async function ocRequest(method, apiPath, body) {
    const info = ocServiceInfo();
    if (!info) throw new Error("no opencode service");
    const headers = { "Content-Type": "application/json", "Authorization": "Basic " + Buffer.from("opencode:" + info.password).toString("base64") };
    const res = await fetch(info.url + apiPath, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    if (!res.ok) { const err = new Error((data && (data.message || data._tag)) || `HTTP ${res.status}`); err.status = res.status; err.data = data; throw err; }
    return data;
}

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".ttf": "font/ttf",
    ".icns": "application/octet-stream",
    ".wav": "audio/wav",
    ".pdf": "application/pdf"
};

/* ------------------------------- state ---------------------------------- */

const settings = loadPersistedSettings();

const state = { tabs: [], bookmarks: [] };

/**
 * Settings persistence: defaults are Apple-consistent; user changes survive
 * server restarts via a JSON file under ~/.config/saim-cli/.
 */
const SETTINGS_FILE = path.join(os.homedir(), ".config", "saim-cli", "preview-settings.json");

function defaultSettings() {
    return {
        shell: process.env.SHELL || "/bin/bash",
        shellArgs: "",
        cwd: ROOT,
        termFontSize: 14,
        termScrollback: 5000,
        cursorBlink: true,
        cursorStyle: "block",
        theme: "saim-cli",
        accent: "#0071e3",
        fontFamily: "Fira Code",
        uiFont: "",
        uiScale: 100,
        showSidebar: true,
        showDock: false,
        showStatusbar: true,
        restoreTabs: true,
        opencodePath: "",
        opencodeAutoStart: false,
        telemetry: true
    };
}

function loadPersistedSettings() {
    const defaults = defaultSettings();
    try {
        const raw = fs.readFileSync(SETTINGS_FILE, "utf8");
        const saved = JSON.parse(raw);
        return Object.assign(defaults, saved && typeof saved === "object" ? saved : {});
    } catch (err) {
        return defaults;
    }
}

function persistSettings() {
    try {
        fs.mkdirSync(path.join(SETTINGS_FILE, ".."), { recursive: true });
        fs.writeFileSync(SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`);
    } catch (err) {
        console.error("[preview] could not persist settings:", err.message);
    }
}

/* ------------------------------ terminals -------------------------------- */

const sessions = new Map(); // id -> { proc, listeners:Set, kind }
let sessionCounter = 0;

/**
 * Runs a program inside a real pseudo terminal.
 * `script` is used because it is present on every Linux box and gives the
 * child process a genuine TTY without needing a compiled node-pty.
 */
function startSession(command, args, cwd, kind, idOverride) {
    const id = idOverride || `${kind}-${Date.now().toString(36)}-${++sessionCounter}`;
    const scriptArgs = ["-qfc", [command, ...args].join(" "), "/dev/null"];
    const proc = spawn("script", scriptArgs, {
        cwd: cwd && fs.existsSync(cwd) ? cwd : os.homedir(),
        env: Object.assign({}, process.env, {
            TERM: "xterm-256color",
            COLORTERM: "truecolor",
            TERM_PROGRAM: "Saim CLI",
            TERM_PROGRAM_VERSION: "preview"
        }),
        stdio: ["pipe", "pipe", "pipe"]
    });

    const session = { id, proc, listeners: new Set(), kind, cwd };
    sessions.set(id, session);

    const emit = payload => {
        session.listeners.forEach(listener => listener(payload));
        globalStreams.get("all").forEach(listener => listener(payload));
    };

    // Publish the initial working directory straight away.
    emit({ channel: `${kind}:cwd`, payload: { id, cwd: session.cwd } });

    const relay = chunk => {
        const text = chunk.toString("utf-8");
        // Hide the "no job control" noise produced by `script`.
        const cleaned = text.replace(/cannot set terminal process group[^\n]*\n?/g, "")
            .replace(/no job control in this shell[^\n]*\n?/g, "");
        if (cleaned) emit({ channel: `${kind}:data`, payload: { id, data: cleaned } });
    };

    proc.stdout.on("data", relay);
    proc.stderr.on("data", relay);
    proc.on("exit", code => {
        emit({ channel: `${kind}:exit`, payload: { id, code: code || 0 } });
        sessions.delete(id);
    });

    // Track the working directory of the shell, like the desktop app does.
    let ticks = 0;
    const tracker = setInterval(() => {
        if (!sessions.has(id)) { clearInterval(tracker); return; }
        ticks += 1;
        const pid = proc.pid;
        fs.readlink(`/proc/${pid}/cwd`, (err, target) => {
            if (!err && target && target !== session.cwd) {
                session.cwd = target;
                emit({ channel: `${kind}:cwd`, payload: { id, cwd: target } });
            }
        });
        if (ticks % 3 === 0) {
            execFile("ps", ["-o", "comm=", "-p", String(pid)], (err, stdout) => {
                const procName = (stdout || "").trim() || "shell";
                emit({ channel: `${kind}:process`, payload: { id, process: procName } });
            });
        }
    }, 900);

    return id;
}

/* ------------------------------ filesystem ------------------------------- */

function listDirectory(dir) {
    const target = dir && fs.existsSync(dir) ? dir : os.homedir();
    return fs.readdirSync(target, { withFileTypes: true })
        .map(entry => {
            let size = 0;
            let mtime = 0;
            try {
                const st = fs.statSync(path.join(target, entry.name));
                size = st.size;
                mtime = st.mtimeMs;
            } catch (e) { /* broken link */ }
            return {
                name: entry.name,
                path: path.join(target, entry.name),
                dir: entry.isDirectory(),
                symlink: entry.isSymbolicLink(),
                hidden: entry.name.startsWith("."),
                size: size,
                mtime: mtime
            };
        })
        .sort((a, b) => {
            if (a.dir !== b.dir) return a.dir ? -1 : 1;
            return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
        });
}

/* ------------------------------- helpers --------------------------------- */

function sendJson(res, data, code = 200) {
    const body = JSON.stringify(data === undefined ? null : data);
    res.writeHead(code, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
        "Cache-Control": "no-store"
    });
    res.end(body);
}

function sendFile(res, file) {
    fs.readFile(file, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end("Not found");
            return;
        }
        res.writeHead(200, {
            "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
            "Cache-Control": "no-store"
        });
        res.end(data);
    });
}

function readBody(req) {
    return new Promise(resolve => {
        let raw = "";
        req.on("data", chunk => {
            raw += chunk;
            if (raw.length > 20 * 1024 * 1024) req.destroy();
        });
        req.on("end", () => {
            try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { resolve({}); }
        });
    });
}

function safeJoin(root, relative) {
    const target = path.normalize(path.join(root, relative));
    return target.startsWith(root) ? target : null;
}

/* --------------------------------- routes -------------------------------- */

async function handleApi(req, res, url) {
    const route = url.pathname.replace(/^\/api/, "");

    if (route === "/settings" && req.method === "GET") return sendJson(res, settings);
    if (route === "/settings" && req.method === "POST") {
        const patch = await readBody(req);
        Object.assign(settings, patch);
        persistSettings();
        return sendJson(res, settings);
    }
    if (route === "/state" && req.method === "GET") return sendJson(res, state);
    if (route === "/state" && req.method === "POST") {
        const patch = await readBody(req);
        Object.assign(state, patch);
        return sendJson(res, state);
    }
    if (route === "/info") {
        return sendJson(res, {
            name: "Saim CLI",
            version: require(path.join(ROOT, "package.json")).version,
            electron: "preview",
            chrome: process.versions.v8,
            node: process.versions.node,
            platform: process.platform,
            arch: process.arch,
            home: os.homedir(),
            userData: ROOT
        });
    }

    if (route === "/fs/list") return sendJson(res, listDirectory(url.searchParams.get("dir")));
    if (route === "/fs/read") {
        const target = url.searchParams.get("path");
        const data = fs.readFileSync(target);
        return sendJson(res, { content: data.toString("utf-8"), size: data.length, binary: data.includes(0), mtime: 0 });
    }
    if (route === "/fs/stat") {
        const st = fs.statSync(url.searchParams.get("path"));
        return sendJson(res, { dir: st.isDirectory(), size: st.size, mtime: st.mtimeMs });
    }
    if (route === "/fs/write" && req.method === "POST") {
        const body = await readBody(req);
        fs.writeFileSync(body.path, body.content || "", "utf-8");
        return sendJson(res, { ok: true, size: Buffer.byteLength(body.content || "") });
    }
    if (route === "/fs/mkdir" && req.method === "POST") {
        const body = await readBody(req);
        fs.mkdirSync(body.path, { recursive: true });
        return sendJson(res, { ok: true });
    }
    if (route === "/fs/remove" && req.method === "POST") {
        const body = await readBody(req);
        const st = fs.lstatSync(body.path);
        if (st.isDirectory()) fs.rmSync(body.path, { recursive: true, force: true });
        else fs.unlinkSync(body.path);
        return sendJson(res, { ok: true });
    }
    if (route === "/fs/rename" && req.method === "POST") {
        const body = await readBody(req);
        fs.renameSync(body.from, body.to);
        return sendJson(res, { ok: true });
    }

    if (route === "/terminal/create" && req.method === "POST") {
        const body = await readBody(req);
        const id = startSession(settings.shell, (settings.shellArgs || "").split(" ").filter(Boolean),
            body.cwd || settings.cwd, "terminal", body.id);
        return sendJson(res, { id, pid: 0 });
    }
    if (route === "/terminal/write" && req.method === "POST") {
        const body = await readBody(req);
        const session = sessions.get(body.id);
        if (session) session.proc.stdin.write(body.data || "");
        return sendJson(res, { ok: true });
    }
    if (route === "/terminal/resize" && req.method === "POST") {
        const body = await readBody(req);
        const session = sessions.get(body.id);
        if (session && session.proc.stdin.setRawMode) session.proc.stdin.setRawMode(true);
        return sendJson(res, { ok: true });
    }
    if (route === "/terminal/kill" && req.method === "POST") {
        const body = await readBody(req);
        const session = sessions.get(body.id);
        if (session) {
            try { session.proc.kill(); } catch (e) { /* gone */ }
            sessions.delete(body.id);
        }
        return sendJson(res, { ok: true });
    }

    if (route === "/opencode/create" && req.method === "POST") {
        const body = await readBody(req);
        const binary = await new Promise(resolve => {
            execFile("which", ["opencode"], (err, stdout) => {
                const found = (stdout || "").trim().split("\n")[0];
                resolve(err ? null : found);
            });
        });
        if (!binary) return sendJson(res, { ok: false, error: "opencode binary not found in PATH" });
        const id = startSession(binary, [], body.cwd || settings.cwd, "opencode", body.id);
        return sendJson(res, { ok: true, id, pid: 0, path: binary });
    }
    if (route === "/opencode/write" && req.method === "POST") {
        const body = await readBody(req);
        const session = sessions.get(body.id);
        if (session) session.proc.stdin.write(body.data || "");
        return sendJson(res, { ok: true });
    }
    if (route === "/opencode/resize" && req.method === "POST") return sendJson(res, { ok: true });
    if (route === "/opencode/kill" && req.method === "POST") {
        const body = await readBody(req);
        const session = sessions.get(body.id);
        if (session) { try { session.proc.kill(); } catch (e) { /* gone */ } }
        return sendJson(res, { ok: true });
    }

    if (route === "/clipboard/read") return sendJson(res, "");
    if (route === "/clipboard/write" && req.method === "POST") return sendJson(res, { ok: true });
    if (route === "/shell/which") {
        const cmd = url.searchParams.get("cmd") || "bash";
        const resolved = await new Promise(resolve => {
            execFile("which", [cmd], (err, stdout) => {
                const found = (stdout || "").trim().split("\n")[0];
                resolve(found || null);
            });
        });
        return sendJson(res, resolved);
    }
    if (route === "/shell/run" && req.method === "POST") {
        const body = await readBody(req);
        const result = await new Promise(resolve => {
            exec(body.cmd || "true", { cwd: body.cwd || settings.cwd, timeout: 30000 }, (err, stdout, stderr) => {
                resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, stdout: stdout || "", stderr: stderr || "" });
            });
        });
        return sendJson(res, result);
    }
    if (route === "/git/info") {
        const cwd = url.searchParams.get("cwd") || os.homedir();
        const info = await new Promise(resolve => {
            execFile("git", ["rev-parse", "--is-inside-work-tree"], { cwd }, err => {
                if (err) return resolve({ repo: false });
                execFile("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd }, (e, branch) => {
                    execFile("git", ["status", "--porcelain"], { cwd }, (e2, status) => {
                        const changes = (status || "").split("\n").filter(l => l.trim().length > 0);
                        resolve({ repo: true, branch: (branch || "").trim(), dirty: changes.length > 0, changes: changes.length });
                    });
                });
            });
        });
        return sendJson(res, info);
    }

    /* ---------------------------- git / devops --------------------------- */
    // Every devops route funnels through here so an upstream failure always
    // returns JSON ({ok:false,error}) instead of breaking the HTTP response.
    const guard = fn => async () => {
        try {
            return sendJson(res, await fn());
        } catch (err) {
            return sendJson(res, { ok: false, error: err && err.message ? err.message : String(err) });
        }
    };

    if (route === "/git/status") {
        return guard(() => devops.gitStatus(url.searchParams.get("cwd") || settings.cwd))();
    }
    if (route === "/git/log") {
        return guard(() =>
            devops.gitLog(url.searchParams.get("cwd") || settings.cwd, url.searchParams.get("limit"))
        )();
    }
    if (route === "/git/incoming") {
        return guard(() => devops.gitIncoming(url.searchParams.get("cwd") || settings.cwd))();
    }
    if (route === "/git/diff") {
        const body = await readBody(req);
        return guard(() => devops.gitDiff(body.cwd || settings.cwd, body))();
    }
    if (route === "/git/fetch") {
        const body = await readBody(req);
        return guard(() => devops.gitFetch(body.cwd || settings.cwd, body.token))();
    }
    if (route === "/git/pull") {
        const body = await readBody(req);
        return guard(() => devops.gitPull(body.cwd || settings.cwd, body.token))();
    }
    if (route === "/git/push") {
        const body = await readBody(req);
        return guard(() => devops.gitPush(body.cwd || settings.cwd, body.token, body.upstream))();
    }
    if (route === "/github/info") {
        const body = await readBody(req);
        return guard(() => devops.githubInfo(body.token))();
    }
    if (route === "/github/commits") {
        const body = await readBody(req);
        return guard(() => devops.githubRemoteCommits(body.token, body.remote, body.branch))();
    }
    if (route === "/hosting/vercel/whoami") {
        const body = await readBody(req);
        return guard(() => devops.vercelWhoami(body.token))();
    }
    if (route === "/hosting/vercel/projects") {
        return guard(() => devops.vercelProjects(url.searchParams.get("token")))();
    }
    if (route === "/hosting/vercel/deploy") {
        const body = await readBody(req);
        return guard(() => devops.vercelDeploy(body))();
    }
    if (route === "/hosting/netlify/sites") {
        return guard(() => devops.netlifySites(url.searchParams.get("token")))();
    }
    if (route === "/hosting/netlify/deploy") {
        const body = await readBody(req);
        return guard(() => devops.netlifyDeploy(body))();
    }
    if (route === "/hosting/vercel/domains") {
        return guard(() => devops.vercelDomains({ token: url.searchParams.get("token"), project: url.searchParams.get("project") }))();
    }
    if (route === "/hosting/vercel/dns") {
        return guard(() => devops.vercelDnsRecords({ token: url.searchParams.get("token"), domain: url.searchParams.get("domain") }))();
    }
    if (route === "/hosting/netlify/domains") {
        return guard(() => devops.netlifyDomains({ token: url.searchParams.get("token"), siteId: url.searchParams.get("siteId") }))();
    }
    if (route === "/hosting/netlify/dns") {
        return guard(() => devops.netlifyDnsRecords({ token: url.searchParams.get("token"), zoneId: url.searchParams.get("zoneId") }))();
    }

    if (route === "/oc/status") {
        const info = ocServiceInfo();
        if (!info) return sendJson(res, { running: false, error: "no service" });
        try {
            const data = await ocRequest("GET", "/api/info");
            return sendJson(res, { running: true, url: info.url, password: info.password, version: data.version, pid: info.pid, mode: "service" });
        } catch (e) {
            return sendJson(res, { running: false, url: info.url, password: info.password, error: e.message });
        }
    }
    if (route === "/oc/discover") {
        const info = ocServiceInfo();
        if (!info) return sendJson(res, { running: false, error: "no service" });
        try {
            const data = await ocRequest("GET", "/api/info");
            return sendJson(res, { running: true, url: info.url, password: info.password, version: data.version, pid: info.pid, mode: "service" });
        } catch (e) {
            return sendJson(res, { running: false, error: e.message });
        }
    }
    if (route === "/oc/request" && req.method === "POST") {
        const body = await readBody(req);
        try {
            const data = await ocRequest(body.method || "GET", body.path, body.body);
            return sendJson(res, { ok: true, data });
        } catch (e) {
            return sendJson(res, { ok: false, error: e.message, status: e.status, data: e.data });
        }
    }
    if (route === "/oc/pair" && req.method === "POST") {
        try {
            const data = await ocRequest("POST", "/api/pair");
            return sendJson(res, { ok: true, data });
        } catch (e) {
            return sendJson(res, { ok: false, error: e.message });
        }
    }
    if (route === "/oc/connect" && req.method === "POST") {
        const body = await readBody(req);
        try {
            const data = await ocRequest("GET", "/api/info", null, body.url, body.password);
            return sendJson(res, { ok: true, data });
        } catch (e) {
            return sendJson(res, { ok: false, error: e.message });
        }
    }
    if (route === "/oc/stop") return sendJson(res, { ok: true });

    if (route === "/oc/cli" && req.method === "POST") {
        const body = await readBody(req);
        const { spawn } = require("child_process");
        const proc = spawn("opencode", body.args || [], { stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "", stderr = "";
        proc.stdout.on("data", d => stdout += d);
        proc.stderr.on("data", d => stderr += d);
        proc.on("exit", code => sendJson(res, { ok: true, data: { code, stdout, stderr } }));
        return;
    }

    if (route === "/sys/info") {
        const load = os.loadavg()[0];
        const total = os.totalmem();
        const free = os.freemem();
        return sendJson(res, {
            cpu: { usage: Math.min(100, (load / os.cpus().length) * 100), cores: os.cpus().length, model: os.cpus()[0].model },
            mem: { total: total, free: free },
            net: { rx: 0, tx: 0, iface: "preview" },
            host: { hostname: os.hostname(), platform: `${os.type()} ${os.release()}`, uptime: os.uptime(), user: os.userInfo().username },
            processes: []
        });
    }

    if (route === "/stream") {
        res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        });
        res.write(": connected\n\n");
        const listener = payload => {
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
        };
        // Every listener receives the events of every session.
        globalStreams.get("all").add(listener);
        req.on("close", () => globalStreams.get("all").delete(listener));
        return undefined;
    }

    return sendJson(res, { error: "unknown route" }, 404);
}

const globalStreams = new Map([["all", new Set()]]);

/* -------------------------------- server --------------------------------- */

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    try {
        if (url.pathname.startsWith("/api/")) {
            return await handleApi(req, res, url);
        }

        if (url.pathname === "/" || url.pathname === "/index.html") {
            res.writeHead(302, { Location: "/src/ui.html" });
            return res.end();
        }

        if (url.pathname === "/__preview/shim.js") {
            return sendFile(res, path.join(__dirname, "preview-shim.js"));
        }

        if (url.pathname === "/src/ui.html") {
            const html = fs.readFileSync(path.join(ROOT, "src", "ui.html"), "utf-8")
                .replace('<script src="js/core/bridge.js"></script>',
                    '<script src="/__preview/shim.js"></script>\n    <script src="js/core/bridge.js"></script>');
            res.writeHead(200, { "Content-Type": MIME[".html"], "Cache-Control": "no-store" });
            return res.end(html);
        }

        const target = safeJoin(ROOT, decodeURIComponent(url.pathname));
        if (!target || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
            res.writeHead(404);
            return res.end("Not found");
        }
        return sendFile(res, target);
    } catch (err) {
        console.error("[preview]", err);
        res.writeHead(500);
        res.end(String(err.message || err));
    }
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`\n  Saim CLI preview running on http://localhost:${PORT}\n`);
});
