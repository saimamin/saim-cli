/**
 * Saim CLI - main process
 * ---------------------------------------------------------------------------
 * The Saim CLI is a complete graphical shell built on top of the eDEX-UI
 * terminal foundation. This process owns everything privileged:
 *   - window / menu / native dialogs
 *   - pseudo terminals (node-pty) for the shell tabs and the OpenCode panel
 *   - filesystem access
 *   - system telemetry (cpu / ram / net / processes) and git information
 *
 * The renderer never talks to the disk directly: everything goes through the
 * IPC bridge exposed by preload.js.
 */

const {
    app, BrowserWindow, ipcMain, dialog, shell, Menu, clipboard
} = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFile, exec } = require("child_process");
const pty = require("node-pty");
const { OpencodeManager } = require("./opencode/manager");
const devops = require("./lib/devops");

let si;
let ocManager = null;
try {
    si = require("systeminformation");
} catch (e) {
    si = null;
}

/* ------------------------------------------------------------------------- */
/* Constants & helpers                                                        */
/* ------------------------------------------------------------------------- */

const APP_NAME = "Saim CLI";
const IS_DEV = process.argv.includes("--dev");

const DEFAULTS = {
    // Terminal
    shell: process.env.SHELL || "/bin/bash",
    shellArgs: "",
    cwd: os.homedir(),
    termFontSize: 14,
    termScrollback: 5000,
    cursorBlink: true,
    cursorStyle: "block",
    // Appearance
    theme: "saim-cli",
    accent: "",
    fontFamily: "Fira Code",
    uiFont: "",
    uiScale: 100,
    showSidebar: true,
    showDock: true,
    showStatusbar: false,
    // OpenCode-looking interface preferences
    interfaceLayout: "inbox",
    language: "en",
    defaultEnvironment: "last",
    autoAcceptPermissions: false,
    showAgent: true,
    followUpBehavior: "queue",
    // Behaviour
    bellSound: false,
    confirmClose: true,
    restoreTabs: true,
    // Integrations
    opencodePath: "",
    opencodeAutoStart: false,
    // Telemetry
    telemetry: true,
    pingAddr: "1.1.1.1"
};

const USER_DATA = () => app.getPath("userData");
const SETTINGS_FILE = () => path.join(USER_DATA(), "settings.json");
const STATE_FILE = () => path.join(USER_DATA(), "state.json");

let settings = Object.assign({}, DEFAULTS);
let mainWindow = null;
let quitting = false;

/* ------------------------------------------------------------------------- */
/* Settings                                                                   */
/* ------------------------------------------------------------------------- */

function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE())) {
            const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE(), "utf-8"));
            settings = Object.assign({}, DEFAULTS, raw);
        }
    } catch (e) {
        console.error("[saim] could not read settings:", e.message);
        settings = Object.assign({}, DEFAULTS);
    }
    return settings;
}

function saveSettings(patch) {
    settings = Object.assign({}, settings, patch || {});
    try {
        fs.mkdirSync(USER_DATA(), { recursive: true });
        fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(settings, null, 4));
    } catch (e) {
        console.error("[saim] could not write settings:", e.message);
    }
    broadcast("settings:changed", settings);
    return settings;
}

function loadState() {
    try {
        if (fs.existsSync(STATE_FILE())) {
            return JSON.parse(fs.readFileSync(STATE_FILE(), "utf-8"));
        }
    } catch (e) { /* ignore */ }
    return {};
}

function saveState(patch) {
    const state = Object.assign(loadState(), patch || {});
    try {
        fs.mkdirSync(USER_DATA(), { recursive: true });
        fs.writeFileSync(STATE_FILE(), JSON.stringify(state, null, 4));
    } catch (e) { /* ignore */ }
    return state;
}

/* ------------------------------------------------------------------------- */
/* Window                                                                     */
/* ------------------------------------------------------------------------- */

function createWindow() {
    const saved = loadState();
    const bounds = saved.window || {};

    mainWindow = new BrowserWindow({
        width: bounds.width || 1440,
        height: bounds.height || 880,
        x: bounds.x,
        y: bounds.y,
        minWidth: 900,
        minHeight: 560,
        show: false,
        frame: false,
        title: APP_NAME,
        backgroundColor: "#0a0e14",
        autoHideMenuBar: true,
        icon: path.join(__dirname, "..", "media", "icon.png"),
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            backgroundThrottling: false,
            spellcheck: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, "ui.html"));

    mainWindow.once("ready-to-show", () => {
        mainWindow.show();
        if (IS_DEV) mainWindow.webContents.openDevTools({ mode: "detach" });
        maybeCaptureScreenshot(mainWindow);
    });

    mainWindow.on("maximize", () => broadcast("window:state", { maximized: true }));
    mainWindow.on("unmaximize", () => broadcast("window:state", { maximized: false }));
    mainWindow.on("closed", () => { mainWindow = null; });

    const rememberBounds = () => {
        if (!mainWindow || mainWindow.isMaximized() || mainWindow.isFullScreen()) return;
        saveState({ window: mainWindow.getNormalBounds() });
    };
    mainWindow.on("resize", rememberBounds);
    mainWindow.on("move", rememberBounds);

    // External links open in the real browser.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: "deny" };
    });
    mainWindow.webContents.on("will-navigate", (e, url) => {
        if (!url.startsWith("file://")) {
            e.preventDefault();
            shell.openExternal(url);
        }
    });

    // Surface renderer errors in the terminal when running in dev mode.
    mainWindow.webContents.on("console-message", (event, level, message) => {
        if (!IS_DEV) return;
        const text = typeof message === "string" ? message : JSON.stringify(message);
        console.log(`[renderer:${level}] ${text}`);
    });
}

function broadcast(channel, payload) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, payload);
    }
}

/* ------------------------------------------------------------------------- */
/* Terminal manager (node-pty)                                               */
/* ------------------------------------------------------------------------- */

const terminals = new Map();   // id -> { pty, cwd, kind }
let termCounter = 0;

function nextId(prefix) {
    termCounter += 1;
    return `${prefix}-${Date.now().toString(36)}-${termCounter}`;
}

function buildEnv(extra) {
    const env = Object.assign({}, process.env, {
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        TERM_PROGRAM: APP_NAME,
        TERM_PROGRAM_VERSION: app.getVersion()
    });
    delete env.http_proxy;
    delete env.https_proxy;
    return Object.assign(env, extra || {});
}

function shellArgs(params) {
    const args = String(params || "").trim();
    if (args.length > 0) {
        return args.split(" ").filter(a => a.length > 0);
    }
    if (process.platform === "win32") return [];
    return ["--login"];
}

function resolveShell(shell) {
    return new Promise(resolve => {
        execFile("which", [shell], (err, stdout) => {
            const found = (stdout || "").trim().split("\n")[0];
            if (!err && found && fs.existsSync(found)) return resolve(found);
            resolve(fs.existsSync(shell) ? shell : "/bin/bash");
        });
    });
}

function trackCwd(pid) {
    return new Promise(resolve => {
        if (process.platform === "linux") {
            fs.readlink(`/proc/${pid}/cwd`, (err, target) => {
                if (!err && target) resolve(target);
                else resolve(null);
            });
        } else {
            exec(`lsof -a -d cwd -p ${pid} 2>/dev/null | tail -1`, (err, stdout) => {
                const line = (stdout || "").trim();
                if (line) resolve(line.split(/\s+/).slice(8).join(" "));
                else resolve(null);
            });
        }
    });
}

function trackProcess(pid) {
    return new Promise(resolve => {
        exec(`ps -o comm= -p ${pid} 2>/dev/null`, (err, stdout) => {
            resolve(((stdout || "").trim() || "shell"));
        });
    });
}

function createTerminal(opts) {
    const id = opts.id || nextId("term");
    const shellPath = opts.shell || settings.shell;
    const args = opts.shellArgs !== undefined ? opts.shellArgs : settings.shellArgs;
    const cwd = (opts.cwd && fs.existsSync(opts.cwd)) ? opts.cwd : (settings.cwd || os.homedir());

    const term = pty.spawn(shellPath, shellArgs(args), {
        name: "xterm-256color",
        cols: opts.cols || 100,
        rows: opts.rows || 30,
        cwd: cwd,
        env: buildEnv(opts.env)
    });

    const entry = { id, pty: term, cwd: cwd, kind: "shell" };
    terminals.set(id, entry);

    term.onData(data => broadcast("terminal:data", { id, data }));
    term.onExit(({ exitCode, signal }) => {
        terminals.delete(id);
        broadcast("terminal:exit", { id, code: exitCode, signal: signal || null });
    });

    // Publish the initial working directory straight away.
    broadcast("terminal:cwd", { id, cwd: cwd });

    // Track working directory + foreground process for the status bar.
    let tick = 0;
    const tracker = setInterval(async () => {
        if (!terminals.has(id)) { clearInterval(tracker); return; }
        tick += 1;
        const cwdNow = await trackCwd(term.pid);
        if (cwdNow && cwdNow !== entry.cwd) {
            entry.cwd = cwdNow;
            broadcast("terminal:cwd", { id, cwd: cwdNow });
        }
        if (tick % 3 === 0) {
            const proc = await trackProcess(term.pid);
            broadcast("terminal:process", { id, process: proc });
        }
    }, 900);

    return { id, pid: term.pid };
}

function writeTerminal(id, data) {
    const entry = terminals.get(id);
    if (entry) entry.pty.write(data);
}

function resizeTerminal(id, cols, rows) {
    const entry = terminals.get(id);
    if (!entry) return;
    try {
        entry.pty.resize(Math.max(2, Math.floor(cols)), Math.max(2, Math.floor(rows)));
    } catch (e) { /* pty gone */ }
}

function killTerminal(id) {
    const entry = terminals.get(id);
    if (!entry) return;
    try { entry.pty.kill(); } catch (e) { /* already dead */ }
    terminals.delete(id);
}

/* ------------------------------------------------------------------------- */
/* OpenCode manager - the integrated assistant panel                          */
/* ------------------------------------------------------------------------- */

function resolveOpencode() {
    const configured = settings.opencodePath;
    const candidates = configured ? [configured] : ["opencode"];
    for (const candidate of candidates) {
        return new Promise(resolve => {
            execFile("which", [candidate], (err, stdout) => {
                const found = (stdout || "").trim().split("\n")[0];
                if (!err && found) return resolve(found);
                if (candidate.includes("/") && fs.existsSync(candidate)) return resolve(candidate);
                resolve(null);
            });
        });
    }
    return Promise.resolve(null);
}

async function createOpencode(opts) {
    const bin = await resolveOpencode();
    if (!bin) {
        return { ok: false, error: "opencode binary not found in PATH" };
    }
    const id = opts.id || nextId("oc");
    const cwd = (opts.cwd && fs.existsSync(opts.cwd)) ? opts.cwd : (settings.cwd || os.homedir());

    const term = pty.spawn(bin, [], {
        name: "xterm-256color",
        cols: opts.cols || 60,
        rows: opts.rows || 24,
        cwd: cwd,
        env: buildEnv({
            SAIM_CLI: "1",
            OPENCODE: "1"
        })
    });

    terminals.set(id, { id, pty: term, cwd: cwd, kind: "opencode" });
    term.onData(data => broadcast("opencode:data", { id, data }));
    term.onExit(({ exitCode }) => {
        terminals.delete(id);
        broadcast("opencode:exit", { id, code: exitCode });
    });

    return { ok: true, id, pid: term.pid, path: bin };
}

/* ------------------------------------------------------------------------- */
/* Filesystem API                                                             */
/* ------------------------------------------------------------------------- */

function listDirectory(dir) {
    const target = dir && fs.existsSync(dir) ? dir : os.homedir();
    const entries = fs.readdirSync(target, { withFileTypes: true });
    return entries.map(entry => {
        let size = 0;
        let mtime = 0;
        try {
            const st = fs.statSync(path.join(target, entry.name));
            size = st.size;
            mtime = st.mtimeMs;
        } catch (e) { /* broken symlink */ }
        return {
            name: entry.name,
            path: path.join(target, entry.name),
            dir: entry.isDirectory(),
            symlink: entry.isSymbolicLink(),
            hidden: entry.name.startsWith("."),
            size: size,
            mtime: mtime
        };
    }).sort((a, b) => {
        if (a.dir !== b.dir) return a.dir ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    });
}

function readFileSafe(target) {
    const st = fs.statSync(target);
    if (st.isDirectory()) throw new Error("Path is a directory");
    const buffer = fs.readFileSync(target);
    return {
        content: buffer.toString("utf-8"),
        size: st.size,
        binary: buffer.includes(0),
        mtime: st.mtimeMs
    };
}

/* ------------------------------------------------------------------------- */
/* Git / system telemetry                                                     */
/* ------------------------------------------------------------------------- */

function gitInfo(cwd) {
    const target = cwd && fs.existsSync(cwd) ? cwd : os.homedir();
    return new Promise(resolve => {
        execFile("git", ["rev-parse", "--is-inside-work-tree"], { cwd: target }, (err) => {
            if (err) return resolve({ repo: false });
            execFile("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: target }, (e, branch) => {
                execFile("git", ["status", "--porcelain"], { cwd: target }, (e2, status) => {
                    const changes = (status || "").split("\n").filter(l => l.trim().length > 0);
                    resolve({
                        repo: true,
                        branch: (branch || "").trim(),
                        dirty: changes.length > 0,
                        changes: changes.length
                    });
                });
            });
        });
    });
}

async function systemInfo() {
    const info = {
        cpu: { usage: 0, cores: os.cpus().length, model: os.cpus()[0] ? os.cpus()[0].model : "CPU" },
        mem: { total: os.totalmem(), free: os.freemem() },
        net: { rx: 0, tx: 0, iface: "" },
        host: { hostname: os.hostname(), platform: `${os.type()} ${os.release()}`, uptime: os.uptime(), user: os.userInfo().username },
        processes: [],
        gpu: null
    };
    if (!si) return info;
    try {
        const [cpu, mem, net, processes] = await Promise.all([
            si.currentLoad().catch(() => null),
            si.mem().catch(() => null),
            si.networkStats().catch(() => null),
            si.processes().catch(() => null)
        ]);
        if (cpu) info.cpu.usage = cpu.currentLoad;
        if (mem) info.mem = { total: mem.total, free: mem.available };
        if (net && net.length) {
            const iface = net.find(n => n.operstate && n.operstate !== "down") || net[0];
            info.net = { rx: iface.rx_sec || 0, tx: iface.tx_sec || 0, iface: iface.iface };
        }
        if (processes) {
            const list = Array.isArray(processes) ? processes : (processes.list || []);
            info.processes = list
                .slice()
                .sort((a, b) => b.cpu - a.cpu)
                .slice(0, 40)
                .map(p => ({ pid: p.pid, name: p.name, cpu: p.cpu || 0, mem: p.mem || 0 }));
        }
    } catch (e) { /* telemetry is best effort */ }
    return info;
}

/* ------------------------------------------------------------------------- */
/* Native menu                                                                */
/* ------------------------------------------------------------------------- */

function buildMenu() {
    const send = (command, payload) => () => broadcast("app:command", { command, payload });
    const template = [
        {
            label: "File",
            submenu: [
                { label: "New Terminal Tab", accelerator: "CmdOrCtrl+Shift+T", click: send("tab:new") },
                { label: "Close Terminal Tab", accelerator: "CmdOrCtrl+W", click: send("tab:close") },
                { label: "Next Tab", accelerator: "CmdOrCtrl+Tab", click: send("tab:next") },
                { label: "Previous Tab", accelerator: "CmdOrCtrl+Shift+Tab", click: send("tab:previous") },
                { label: "Rename Tab…", click: send("tab:rename") },
                { type: "separator" },
                { label: "Open File…", accelerator: "CmdOrCtrl+O", click: send("file:open") },
                { label: "Open Folder…", accelerator: "CmdOrCtrl+Shift+E", click: send("folder:open") },
                { type: "separator" },
                { label: "Save Current File", accelerator: "CmdOrCtrl+S", click: send("file:save") },
                { label: "Reload Window", accelerator: "CmdOrCtrl+R", click: send("app:reload") },
                { type: "separator" },
                { label: "Settings", accelerator: "CmdOrCtrl+,", click: send("settings:open") },
                { type: "separator" },
                { label: "Quit", accelerator: "CmdOrCtrl+Q", click: () => { quitting = true; app.quit(); } }
            ]
        },
        {
            label: "Edit",
            submenu: [
                { label: "Undo", role: "undo" },
                { label: "Redo", role: "redo" },
                { type: "separator" },
                { label: "Cut", role: "cut" },
                { label: "Copy", role: "copy" },
                { label: "Paste", role: "paste" },
                { label: "Select All", role: "selectAll" },
                { type: "separator" },
                { label: "Command Palette", accelerator: "CmdOrCtrl+Shift+P", click: send("palette:open") }
            ]
        },
        {
            label: "View",
            submenu: [
                { label: "Toggle Sidebar", accelerator: "CmdOrCtrl+B", click: send("sidebar:toggle") },
                { label: "Toggle OpenCode Panel", accelerator: "CmdOrCtrl+Shift+O", click: send("dock:toggle") },
                { label: "Toggle Status Bar", accelerator: "CmdOrCtrl+Shift+B", click: send("statusbar:toggle") },
                { type: "separator" },
                { label: "Fullscreen", accelerator: "F11", click: send("window:fullscreen") },
                { label: "Zoom In", role: "zoomIn" },
                { label: "Zoom Out", role: "zoomOut" },
                { label: "Reset Zoom", role: "resetZoom" },
                { type: "separator" },
                { label: "Developer Tools", accelerator: "CmdOrCtrl+Shift+I", click: send("app:devtools") }
            ]
        },
        {
            label: "Tools",
            submenu: [
                { label: "Open OpenCode Panel", accelerator: "CmdOrCtrl+Shift+O", click: send("opencode:open") },
                { label: "Restart OpenCode", click: send("opencode:restart") },
                { type: "separator" },
                { label: "System Monitor", click: send("monitor:open") },
                { label: "Clear Terminal", accelerator: "CmdOrCtrl+Shift+K", click: send("terminal:clear") }
            ]
        },
        {
            label: "Help",
            submenu: [
                { label: "Keyboard Shortcuts", click: send("help:shortcuts") },
                { label: "About Saim CLI", click: send("help:about") }
            ]
        }
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ------------------------------------------------------------------------- */
/* IPC handlers                                                               */
/* ------------------------------------------------------------------------- */

function registerIpc() {
    ipcMain.handle("app:getSettings", () => settings);
    ipcMain.handle("app:saveSettings", (_e, patch) => saveSettings(patch));
    ipcMain.handle("app:getState", () => loadState());
    ipcMain.handle("app:saveState", (_e, patch) => saveState(patch));
    ipcMain.handle("app:info", () => ({
        name: APP_NAME,
        version: app.getVersion(),
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
        platform: process.platform,
        arch: process.arch,
        home: os.homedir(),
        userData: USER_DATA()
    }));

    // Terminals
    ipcMain.handle("terminal:create", async (_e, opts) => createTerminal(opts || {}));
    ipcMain.handle("terminal:write", (_e, { id, data }) => writeTerminal(id, data));
    ipcMain.handle("terminal:resize", (_e, { id, cols, rows }) => resizeTerminal(id, cols, rows));
    ipcMain.handle("terminal:kill", (_e, { id }) => killTerminal(id));
    ipcMain.handle("terminal:list", () => Array.from(terminals.values()).map(t => ({ id: t.id, cwd: t.cwd, kind: t.kind })));

    // OpenCode terminal (embedded TUI)
    ipcMain.handle("opencode:create", async (_e, opts) => createOpencode(opts || {}));
    ipcMain.handle("opencode:write", (_e, { id, data }) => writeTerminal(id, data));
    ipcMain.handle("opencode:resize", (_e, { id, cols, rows }) => resizeTerminal(id, cols, rows));
    ipcMain.handle("opencode:kill", (_e, { id }) => killTerminal(id));
    ipcMain.handle("opencode:which", async () => resolveOpencode());

    // OpenCode server (native API client)
    ipcMain.handle("oc:discover", async () => {
        try { return await ocManager.discover(); } catch (e) { return { running: false, error: e.message }; }
    });
    ipcMain.handle("oc:status", () => ocManager.status);
    ipcMain.handle("oc:stop", async () => { await ocManager.stop(); return ocManager.status; });
    ipcMain.handle("oc:request", async (_e, { method, path, body }) => {
        try { return { ok: true, data: await ocManager.request(method, path, body) }; }
        catch (e) { return { ok: false, error: e.message, status: e.status, data: e.data }; }
    });
    ipcMain.handle("oc:startEvents", () => { ocManager.startEvents(); return { ok: true }; });
    ipcMain.handle("oc:stopEvents", () => { ocManager.stopEvents(); return { ok: true }; });
    ipcMain.handle("oc:pair", async () => {
        try { return { ok: true, data: await ocManager.pair() }; }
        catch (e) { return { ok: false, error: e.message }; }
    });
    ipcMain.handle("oc:cli", async (_e, { args }) => {
        try { return { ok: true, data: await ocManager.cli(args || []) }; }
        catch (e) { return { ok: false, error: e.message }; }
    });
    ipcMain.handle("oc:connect", async (_e, { url, password }) => {
        try {
            const info = await ocManager.request("GET", "/api/info", null, url, password);
            ocManager.status = { running: true, url, password, pid: null, version: info.version, error: null, mode: "manual" };
            ocManager.startEvents();
            return { ok: true, data: info };
        } catch (e) { return { ok: false, error: e.message }; }
    });

    // Filesystem
    ipcMain.handle("fs:list", (_e, { dir }) => listDirectory(dir));
    ipcMain.handle("fs:read", (_e, { path: target }) => readFileSafe(target));
    ipcMain.handle("fs:write", (_e, { path: target, content }) => {
        fs.writeFileSync(target, content, "utf-8");
        return { ok: true, size: Buffer.byteLength(content) };
    });
    ipcMain.handle("fs:mkdir", (_e, { path: target }) => {
        fs.mkdirSync(target, { recursive: true });
        return { ok: true };
    });
    ipcMain.handle("fs:remove", (_e, { path: target }) => {
        const st = fs.lstatSync(target);
        if (st.isDirectory()) fs.rmSync(target, { recursive: true, force: true });
        else fs.unlinkSync(target);
        return { ok: true };
    });
    ipcMain.handle("fs:rename", (_e, { from, to }) => {
        fs.renameSync(from, to);
        return { ok: true };
    });
    ipcMain.handle("fs:stat", (_e, { path: target }) => {
        const st = fs.statSync(target);
        return { dir: st.isDirectory(), size: st.size, mtime: st.mtimeMs };
    });
    ipcMain.handle("fs:exists", (_e, { path: target }) => fs.existsSync(target));

    // Dialogs
    ipcMain.handle("dialog:openDirectory", async (_e, { defaultPath } = {}) => {
        const res = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory"], defaultPath });
        return res.canceled ? null : res.filePaths[0];
    });
    ipcMain.handle("dialog:openFile", async (_e, { defaultPath } = {}) => {
        const res = await dialog.showOpenDialog(mainWindow, { properties: ["openFile"], defaultPath });
        return res.canceled ? null : res.filePaths[0];
    });
    ipcMain.handle("dialog:message", (_e, { type, title, message, detail }) => {
        dialog.showMessageBox(mainWindow, { type: type || "info", title: title || APP_NAME, message, detail });
    });

    // Clipboard
    ipcMain.handle("clipboard:read", () => clipboard.readText());
    ipcMain.handle("clipboard:write", (_e, { text }) => { clipboard.writeText(text || ""); return { ok: true }; });

    // Telemetry
    ipcMain.handle("sys:info", async () => systemInfo());
    ipcMain.handle("git:info", (_e, { cwd }) => gitInfo(cwd));

    // Git / devops (shared with the browser preview backend)
    ipcMain.handle("git:status", (_e, opts = {}) => devops.gitStatus(opts.cwd));
    ipcMain.handle("git:log", (_e, opts = {}) => devops.gitLog(opts.cwd, opts.limit));
    ipcMain.handle("git:incoming", (_e, opts = {}) => devops.gitIncoming(opts.cwd));
    ipcMain.handle("git:diff", (_e, opts = {}) => devops.gitDiff(opts.cwd, opts));
    ipcMain.handle("git:fetch", (_e, opts = {}) => devops.gitFetch(opts.cwd, opts.token));
    ipcMain.handle("git:pull", (_e, opts = {}) => devops.gitPull(opts.cwd, opts.token));
    ipcMain.handle("git:push", (_e, opts = {}) => devops.gitPush(opts.cwd, opts.token, opts.upstream));
    ipcMain.handle("github:info", (_e, opts = {}) => devops.githubInfo(opts.token));
    ipcMain.handle("github:commits", (_e, opts = {}) => devops.githubRemoteCommits(opts.token, opts.remote, opts.branch));
    ipcMain.handle("hosting:vercelWhoami", (_e, opts = {}) => devops.vercelWhoami(opts.token));
    ipcMain.handle("hosting:vercelProjects", (_e, opts = {}) => devops.vercelProjects(opts.token));
    ipcMain.handle("hosting:vercelDeploy", (_e, opts = {}) => devops.vercelDeploy(opts));
    ipcMain.handle("hosting:netlifySites", (_e, opts = {}) => devops.netlifySites(opts.token));
    ipcMain.handle("hosting:netlifyDeploy", (_e, opts = {}) => devops.netlifyDeploy(opts));
    ipcMain.handle("hosting:vercelDomains", (_e, opts = {}) => devops.vercelDomains(opts));
    ipcMain.handle("hosting:vercelDns", (_e, opts = {}) => devops.vercelDnsRecords(opts));
    ipcMain.handle("hosting:netlifyDomains", (_e, opts = {}) => devops.netlifyDomains(opts));
    ipcMain.handle("hosting:netlifyDns", (_e, opts = {}) => devops.netlifyDnsRecords(opts));

    // Shell helpers
    ipcMain.handle("shell:which", async (_e, { cmd }) => {
        const resolved = await resolveShell(cmd);
        return resolved;
    });
    ipcMain.handle("shell:run", (_e, { cmd, cwd }) => new Promise(resolve => {
        exec(cmd, { cwd: cwd || os.homedir() }, (err, stdout, stderr) => {
            resolve({ code: err ? err.code || 1 : 0, stdout: stdout || "", stderr: stderr || "" });
        });
    }));
    ipcMain.handle("app:openExternal", (_e, { url }) => {
        if (/^https?:\/\//i.test(url)) shell.openExternal(url);
        return { ok: true };
    });

    // Window controls
    ipcMain.handle("window:action", (_e, { action }) => {
        if (!mainWindow) return { ok: false };
        switch (action) {
            case "minimize": mainWindow.minimize(); break;
            case "maximize":
                if (mainWindow.isMaximized()) mainWindow.unmaximize();
                else mainWindow.maximize();
                break;
            case "close": mainWindow.close(); break;
            case "fullscreen":
                mainWindow.setFullScreen(!mainWindow.isFullScreen());
                break;
            default: break;
        }
        return { ok: true, maximized: mainWindow.isMaximized() };
    });
    ipcMain.handle("window:isMaximized", () => mainWindow ? mainWindow.isMaximized() : false);
    ipcMain.handle("app:devtools", () => {
        if (mainWindow) mainWindow.webContents.toggleDevTools();
        return { ok: true };
    });
}

/* ------------------------------------------------------------------------- */
/* App lifecycle                                                              */
/* ------------------------------------------------------------------------- */

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on("second-instance", () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("enable-gpu-rasterization");
if (process.argv.includes("--disable-gpu")) {
    app.disableHardwareAcceleration();
}

/**
 * Debug helper: `electron . --screenshot=/tmp/saim.png` renders the window,
 * captures it and quits. Handy for packaging checks and documentation.
 */
function maybeCaptureScreenshot(win) {
    const arg = process.argv.find(a => a.startsWith("--screenshot="));
    if (!arg) return;
    const target = arg.split("=")[1] || "saim-screenshot.png";
    const delay = Number((process.argv.find(a => a.startsWith("--screenshot-delay=")) || "").split("=")[1] || 4000);
    const scriptArg = process.argv.find(a => a.startsWith("--capture-script="));
    const zoomArg = process.argv.find(a => a.startsWith("--zoom="));
    if (zoomArg) win.webContents.setZoomFactor(Number(zoomArg.split("=")[1]) || 1);
    setTimeout(async () => {
        try {
            if (scriptArg) {
                const file = scriptArg.split("=")[1];
                const code = fs.readFileSync(file, "utf-8");
                await win.webContents.executeJavaScript(code, true);
                await new Promise(resolve => setTimeout(resolve, 1800));
            }
            const image = await win.webContents.capturePage();
            fs.writeFileSync(target, image.toPNG());
            console.log(`[saim] screenshot written to ${target}`);
        } catch (e) {
            console.error("[saim] screenshot failed:", e.message);
        }
        app.quit();
    }, delay);
}

app.whenReady().then(() => {
    loadSettings();
    registerIpc();
    ocManager = new OpencodeManager();
    ocManager.onEvent = (channel, payload) => broadcast(channel, payload);
    buildMenu();
    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
    quitting = true;
    terminals.forEach(entry => {
        try { entry.pty.kill(); } catch (e) { /* ignore */ }
    });
    terminals.clear();
});
