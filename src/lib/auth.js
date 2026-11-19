/**
 * Saim CLI - self-hosted authentication for the browser preview
 * ---------------------------------------------------------------------------
 * Username/password login with a signed, HttpOnly session cookie. Credentials
 * live in a local .env file (never committed). The Electron app is unaffected.
 */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ENV_PATH = path.join(__dirname, "..", "..", ".env");
const COOKIE = "saim_session";
const MAX_AGE = 7 * 24 * 60 * 60; // 7 days

function randomSecret() {
    return crypto.randomBytes(32).toString("hex");
}

/** Load .env (simple KEY=VALUE), creating a default one on first run. */
function loadConfig() {
    let raw = "";
    try { raw = fs.readFileSync(ENV_PATH, "utf8"); }
    catch (e) { /* created below */ }

    const cfg = {};
    raw.split(/\r?\n/).forEach(line => {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
        if (!m) return;
        let value = m[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        cfg[m[1]] = value;
    });

    let created = false;
    if (!cfg.AUTH_USER || !cfg.AUTH_PASS) {
        cfg.AUTH_USER = cfg.AUTH_USER || "admin";
        cfg.AUTH_PASS = cfg.AUTH_PASS || crypto.randomBytes(6).toString("base64url");
        cfg.AUTH_SECRET = cfg.AUTH_SECRET || randomSecret();
        const body = [
            "# Saim CLI preview login credentials",
            "# Change these, then restart the preview server.",
            `AUTH_USER=${cfg.AUTH_USER}`,
            `AUTH_PASS=${cfg.AUTH_PASS}`,
            `AUTH_SECRET=${cfg.AUTH_SECRET}`,
            ""
        ].join("\n");
        try {
            fs.writeFileSync(ENV_PATH, body, { mode: 0o600 });
            created = true;
        } catch (e) { console.error("[auth] could not write .env:", e.message); }
    }
    if (!cfg.AUTH_SECRET) cfg.AUTH_SECRET = randomSecret();

    return { user: cfg.AUTH_USER, pass: cfg.AUTH_PASS, secret: cfg.AUTH_SECRET, enabled: cfg.AUTH_ENABLED !== "false", created };
}

const config = loadConfig();

function sign(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = crypto.createHmac("sha256", config.secret).update(body).digest("base64url");
    return `${body}.${sig}`;
}

function verify(token) {
    if (!token || typeof token !== "string") return false;
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const [body, sig] = parts;
    const expected = crypto.createHmac("sha256", config.secret).update(body).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
    try {
        const payload = JSON.parse(Buffer.from(body, "base64url").toString());
        return payload.u === config.user && payload.exp > Date.now();
    } catch (e) { return false; }
}

function checkCredentials(username, password) {
    const u = Buffer.from(String(username || ""));
    const p = Buffer.from(String(password || ""));
    const cu = Buffer.from(config.user);
    const cp = Buffer.from(config.pass);
    const userOk = u.length === cu.length && crypto.timingSafeEqual(u, cu);
    const passOk = p.length === cp.length && crypto.timingSafeEqual(p, cp);
    return userOk && passOk;
}

function parseCookies(header) {
    const out = {};
    (header || "").split(";").forEach(part => {
        const idx = part.indexOf("=");
        if (idx > 0) out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
    });
    return out;
}

function isAuthenticated(req) {
    if (!config.enabled) return true;
    const cookies = parseCookies(req.headers.cookie);
    return verify(cookies[COOKIE]);
}

function login(username, password) {
    if (!checkCredentials(username, password)) return null;
    return sign({ u: config.user, exp: Date.now() + MAX_AGE * 1000 });
}

function cookieHeader(token) {
    return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

function clearCookieHeader() {
    return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

module.exports = {
    config,
    isAuthenticated,
    login,
    cookieHeader,
    clearCookieHeader,
    parseCookies
};
