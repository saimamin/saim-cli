/**
 * Saim CLI - preload bridge
 * ---------------------------------------------------------------------------
 * Exposes a small, explicit API to the renderer. The renderer runs with
 * context isolation on, so this is the only surface it can use to reach the
 * main process.
 */

const { contextBridge, ipcRenderer, webUtils } = require("electron");

const listeners = new Map();

function on(channel, callback) {
    const wrapped = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, wrapped);
    if (!listeners.has(channel)) listeners.set(channel, []);
    listeners.get(channel).push(wrapped);
    return () => {
        ipcRenderer.removeListener(channel, wrapped);
        const list = listeners.get(channel) || [];
        const idx = list.indexOf(wrapped);
        if (idx !== -1) list.splice(idx, 1);
    };
}

contextBridge.exposeInMainWorld("saim", {
    invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
    on,
    getPathForFile: file => {
        try {
            return webUtils.getPathForFile(file);
        } catch (e) {
            return "";
        }
    },
    removeAll: (channel) => {
        (listeners.get(channel) || []).forEach(wrapped => ipcRenderer.removeListener(channel, wrapped));
        listeners.set(channel, []);
    },
    channels: {
        settings: "settings:changed",
        terminalData: "terminal:data",
        terminalExit: "terminal:exit",
        terminalCwd: "terminal:cwd",
        terminalProcess: "terminal:process",
        opencodeData: "opencode:data",
        opencodeExit: "opencode:exit",
        appCommand: "app:command",
        windowState: "window:state"
    }
});
