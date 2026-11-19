/**
 * Saim CLI - bridge
 * Thin, promise based wrapper around the preload IPC surface.
 */
window.Saim = window.Saim || {};

(function (Saim) {
    "use strict";

    const call = async (channel, payload) => {
        try {
            return await window.saim.invoke(channel, payload);
        } catch (err) {
            console.error(`[saim] ipc ${channel} failed:`, err);
            Saim.toast && Saim.toast(`Command failed: ${channel}`, "error");
            return null;
        }
    };

    Saim.bridge = {
        getSettings: () => call("app:getSettings"),
        saveSettings: patch => call("app:saveSettings", patch),
        getState: () => call("app:getState"),
        saveState: patch => call("app:saveState", patch),
        appInfo: () => call("app:info"),

        createTerminal: opts => call("terminal:create", opts),
        writeTerminal: (id, data) => call("terminal:write", { id, data }),
        resizeTerminal: (id, cols, rows) => call("terminal:resize", { id, cols, rows }),
        killTerminal: id => call("terminal:kill", { id }),
        listTerminals: () => call("terminal:list"),

        createOpencode: opts => call("opencode:create", opts),
        writeOpencode: (id, data) => call("opencode:write", { id, data }),
        resizeOpencode: (id, cols, rows) => call("opencode:resize", { id, cols, rows }),
        killOpencode: id => call("opencode:kill", { id }),
        whichOpencode: () => call("opencode:which"),

        ocDiscover: () => call("oc:discover"),
        ocStatus: () => call("oc:status"),
        ocStop: () => call("oc:stop"),
        ocRequest: (method, path, body) => call("oc:request", { method, path, body }),
        ocStartEvents: () => call("oc:startEvents"),
        ocStopEvents: () => call("oc:stopEvents"),
        ocPair: () => call("oc:pair"),
        ocCli: args => call("oc:cli", { args }),
        ocConnect: (url, password) => call("oc:connect", { url, password }),

        list: dir => call("fs:list", { dir }),
        readFile: path => call("fs:read", { path }),
        writeFile: (path, content) => call("fs:write", { path, content }),
        mkdir: path => call("fs:mkdir", { path }),
        remove: path => call("fs:remove", { path }),
        rename: (from, to) => call("fs:rename", { from, to }),
        stat: path => call("fs:stat", { path }),
        exists: path => call("fs:exists", { path }),

        openDirectory: defaultPath => call("dialog:openDirectory", { defaultPath }),
        openFile: defaultPath => call("dialog:openFile", { defaultPath }),
        message: opts => call("dialog:message", opts),

        clipboardRead: () => call("clipboard:read"),
        clipboardWrite: text => call("clipboard:write", { text }),

        sysInfo: () => call("sys:info"),
        gitInfo: cwd => call("git:info", { cwd }),
        gitStatus: opts => call("git:status", opts),
        gitLog: opts => call("git:log", opts),
        gitIncoming: opts => call("git:incoming", opts),
        gitDiff: opts => call("git:diff", opts),
        gitFetch: opts => call("git:fetch", opts),
        gitPull: opts => call("git:pull", opts),
        gitPush: opts => call("git:push", opts),

        githubInfo: opts => call("github:info", opts),
        githubCommits: opts => call("github:commits", opts),

        hostingVercelWhoami: opts => call("hosting:vercelWhoami", opts),
        hostingVercelProjects: opts => call("hosting:vercelProjects", opts),
        hostingVercelDeploy: opts => call("hosting:vercelDeploy", opts),
        hostingNetlifySites: opts => call("hosting:netlifySites", opts),
        hostingNetlifyDeploy: opts => call("hosting:netlifyDeploy", opts),
        hostingVercelDomains: opts => call("hosting:vercelDomains", opts),
        hostingVercelDns: opts => call("hosting:vercelDns", opts),
        hostingNetlifyDomains: opts => call("hosting:netlifyDomains", opts),
        hostingNetlifyDns: opts => call("hosting:netlifyDns", opts),
        r2Buckets: opts => call("r2:buckets", opts),
        r2CreateBucket: opts => call("r2:create", opts),
        r2Objects: opts => call("r2:objects", opts),
        r2Delete: opts => call("r2:delete", opts),
        r2Presign: opts => call("r2:presign", opts),
        r2Backup: opts => call("r2:backup", opts),

        which: cmd => call("shell:which", { cmd }),
        run: (cmd, cwd) => call("shell:run", { cmd, cwd }),
        openExternal: url => call("app:openExternal", { url }),

        windowAction: action => call("window:action", { action }),
        isMaximized: () => call("window:isMaximized"),
        toggleDevtools: () => call("app:devtools"),

        on: (channel, cb) => window.saim.on(channel, cb)
    };
})(window.Saim);
