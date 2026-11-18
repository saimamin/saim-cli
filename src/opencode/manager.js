/**
 * Saim CLI - OpenCode client manager (main process)
 * ---------------------------------------------------------------------------
 * Owns the connection to the OpenCode server: discovers the shared background
 * service, falls back to a privately spawned server, performs authenticated
 * requests, relays the SSE event stream, and exposes the pairing flow.
 */

const { spawn, execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const SERVICE_REG = path.join(os.homedir(), ".local/state/opencode/service.json");

class OpencodeManager {
    constructor() {
        this.status = {
            running: false,
            url: null,
            password: null,
            pid: null,
            version: null,
            error: null,
            mode: "disconnected"     // "service" | "spawned" | "disconnected" | "error"
        };
        this.proc = null;
        this.sseReq = null;
        this.onEvent = null;
    }

    async discover() {
        // 1. Try the shared background service.
        try {
            if (fs.existsSync(SERVICE_REG)) {
                const reg = JSON.parse(fs.readFileSync(SERVICE_REG, "utf-8"));
                if (reg.url && reg.password) {
                    const info = await this.request("GET", "/api/info", null, reg.url, reg.password);
                    if (info && info.version) {
                        this.status = {
                            running: true, url: reg.url, password: reg.password,
                            pid: reg.pid, version: info.version, error: null, mode: "service"
                        };
                        return this.status;
                    }
                }
            }
        } catch (e) { /* fall through */ }

        // 2. Spawn our own server.
        return this.spawn();
    }

    async spawn() {
        // Pick a free port so stale servers don't block us.
        const port = await new Promise((resolve, reject) => {
            const net = require("net");
            const srv = net.createServer();
            srv.unref();
            srv.on("error", reject);
            srv.listen(0, "127.0.0.1", () => {
                const p = srv.address().port;
                srv.close(() => resolve(p));
            });
        });
        const proc = spawn("opencode", ["serve", "--port", String(port), "--hostname", "127.0.0.1"], {
            stdio: ["ignore", "pipe", "pipe"],
            detached: true
        });
        let password = null;
        const started = new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("opencode serve timed out")), 25000);
            const onData = (chunk) => {
                const text = chunk.toString();
                const m = text.match(/server password\s+([A-Za-z0-9_-]+)/);
                if (m) {
                    password = m[1];
                    clearTimeout(timer);
                    resolve();
                }
            };
            proc.stdout.on("data", onData);
            proc.stderr.on("data", onData);
            proc.on("exit", (code) => {
                if (!password) {
                    clearTimeout(timer);
                    reject(new Error(`opencode serve exited (${code})`));
                }
            });
        });
        try {
            await started;
        } catch (e) {
            this.status = { running: false, url: null, password: null, pid: null, version: null, error: e.message, mode: "error" };
            throw e;
        }
        const url = `http://127.0.0.1:${port}`;
        let info = null;
        try { info = await this.request("GET", "/api/info", null, url, password); } catch (e) { /* ignore */ }
        this.proc = proc;
        this.status = { running: true, url, password, pid: proc.pid, version: (info && info.version) || null, error: null, mode: "spawned" };
        return this.status;
    }

    async stop() {
        this.stopEvents();
        if (this.proc) {
            try { this.proc.kill(); } catch (e) { /* gone */ }
            this.proc = null;
        }
        this.status = { running: false, url: null, password: null, pid: null, version: null, error: null, mode: "disconnected" };
    }

    async request(method, apiPath, body, urlOverride, passwordOverride) {
        // Explicit url/password overrides let discover() probe a candidate server
        // before the connection state has been established.
        const base = urlOverride || (this.status.running && this.status.url) || null;
        if (!base) throw new Error("opencode server not connected");
        const password = passwordOverride !== undefined ? passwordOverride : this.status.password;
        const url = base + apiPath;
        const headers = { "Content-Type": "application/json" };
        if (password) {
            headers["Authorization"] = "Basic " + Buffer.from("opencode:" + password).toString("base64");
        }
        const res = await fetch(url, {
            method: method || "GET",
            headers: headers,
            body: body !== undefined && body !== null ? JSON.stringify(body) : undefined
        });
        const text = await res.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
        if (!res.ok) {
            const err = new Error((data && (data.message || data._tag)) || `HTTP ${res.status}`);
            err.status = res.status;
            err.data = data;
            throw err;
        }
        return data;
    }

    startEvents() {
        if (!this.status.running || !this.status.url || !this.status.password || this.sseReq) return;
        const url = new URL(this.status.url + "/api/event");
        const req = http.request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: "GET",
            headers: {
                "Authorization": "Basic " + Buffer.from("opencode:" + this.status.password).toString("base64"),
                "Accept": "text/event-stream"
            }
        }, (res) => {
            res.setEncoding("utf-8");
            let buffer = "";
            res.on("data", (chunk) => {
                buffer += chunk;
                const lines = buffer.split("\n");
                buffer = lines.pop();
                for (const line of lines) {
                    if (line.startsWith("data:")) {
                        const raw = line.slice(5).trim();
                        if (!raw) continue;
                        try { this.emit("opencode:event", JSON.parse(raw)); } catch (e) { /* ignore */ }
                    }
                }
            });
            res.on("end", () => { this.sseReq = null; });
        });
        req.on("error", (e) => { this.emit("opencode:event", { type: "error", data: { message: e.message } }); this.sseReq = null; });
        req.end();
        this.sseReq = req;
    }

    stopEvents() {
        if (this.sseReq) {
            try { this.sseReq.destroy(); } catch (e) { /* ignore */ }
            this.sseReq = null;
        }
    }

    emit(channel, payload) {
        if (this.onEvent) this.onEvent(channel, payload);
    }

    async pair() {
        return this.request("POST", "/api/pair");
    }

    async cli(args) {
        return new Promise((resolve) => {
            const proc = spawn("opencode", args, { stdio: ["ignore", "pipe", "pipe"] });
            let stdout = "", stderr = "";
            proc.stdout.on("data", d => stdout += d);
            proc.stderr.on("data", d => stderr += d);
            proc.on("exit", code => resolve({ code, stdout, stderr }));
        });
    }
}

module.exports = { OpencodeManager };
