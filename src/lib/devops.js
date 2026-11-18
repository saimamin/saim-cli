/**
 * Saim CLI - devops backend
 * ---------------------------------------------------------------------------
 * Git + hosting (GitHub / Vercel / Netlify) operations shared by the Electron
 * main process and the browser preview server, so both behave identically.
 * Every function is async and returns plain JSON-safe data.
 */
"use strict";

const { execFile } = require("child_process");
const os = require("os");

const MAX_OUTPUT = 400 * 1024; // keep diffs sane for the renderer

/* --------------------------------- helpers ------------------------------- */

function run(cmd, args, opts = {}) {
    return new Promise(resolve => {
        execFile(
            cmd,
            args,
            {
                cwd: opts.cwd || os.homedir(),
                timeout: opts.timeout || 60000,
                maxBuffer: 12 * 1024 * 1024,
                env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: "0" }, opts.env || {})
            },
            (err, stdout, stderr) => {
                resolve({
                    code: err ? (typeof err.code === "number" ? err.code : 1) : 0,
                    stdout: stdout || "",
                    stderr: stderr || (err && err.message) || "",
                    signal: err && err.signal ? err.signal : null
                });
            }
        );
    });
}

const git = (args, cwd, env) => run("git", args, { cwd, env });

/** Parse a git remote URL into host/owner/repo. */
function parseRemote(url) {
    if (!url) return null;
    const clean = String(url).trim();
    let host = "";
    let pathPart = "";
    let m = clean.match(/^https?:\/\/([^/]+)\/(.+)$/i);
    if (m) {
        host = m[1].replace(/^.*@/, "");
        pathPart = m[2];
    } else if ((m = clean.match(/^git@([^:]+):(.+)$/))) {
        host = m[1];
        pathPart = m[2];
    } else if ((m = clean.match(/^ssh:\/\/git@([^/]+)\/(.+)$/))) {
        host = m[1];
        pathPart = m[2];
    }
    if (!host) return null;
    pathPart = pathPart.replace(/\.git$/i, "");
    const parts = pathPart.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return {
        url: clean,
        host,
        owner: parts[0],
        repo: parts.slice(1).join("/"),
        slug: `${parts[0]}/${parts.slice(1).join("/")}`
    };
}

/** git -c config that authenticates https remotes with a token. */
function tokenConfig(token) {
    if (!token) return [];
    const t = String(token).trim();
    return [
        "-c",
        `url.https://x-access-token:${t}@github.com/.insteadOf=https://github.com/`,
        "-c",
        "credential.helper="
    ];
}

/* ----------------------------------- git --------------------------------- */

async function gitRepo(cwd) {
    const res = await git(["rev-parse", "--show-toplevel"], cwd);
    if (res.code !== 0) return null;
    return res.stdout.trim();
}

async function gitStatus(cwd) {
    const rootDir = await gitRepo(cwd);
    if (!rootDir) return { repo: false };

    const [branchRes, statusRes, remoteRes, countRes, lastRes] = await Promise.all([
        git(["rev-parse", "--abbrev-ref", "HEAD"], rootDir),
        git(["status", "--porcelain"], rootDir),
        git(["remote", "get-url", "origin"], rootDir),
        git(["rev-list", "--left-right", "--count", "@{u}...HEAD"], rootDir),
        git(["log", "-1", "--pretty=format:%h%x1f%s%x1f%ar"], rootDir)
    ]);

    const changes = (statusRes.stdout || "")
        .split("\n")
        .filter(line => line.trim().length > 0)
        .map(line => ({ status: line.slice(0, 2).trim() || "?", path: line.slice(3).trim() }));

    let ahead = 0;
    let behind = 0;
    if (countRes.code === 0) {
        const bits = countRes.stdout.trim().split(/\s+/);
        behind = Number(bits[0]) || 0;
        ahead = Number(bits[1]) || 0;
    }

    const last = lastRes.code === 0 && lastRes.stdout ? lastRes.stdout.split("\x1f") : [];

    return {
        repo: true,
        root: rootDir,
        branch: (branchRes.stdout || "").trim() || "(detached)",
        remote: parseRemote(remoteRes.stdout.trim()),
        upstream: countRes.code === 0,
        ahead,
        behind,
        dirty: changes.length > 0,
        changes,
        lastCommit: last.length ? { hash: last[0], subject: last[1], when: last[2] } : null
    };
}

async function gitLog(cwd, limit) {
    const n = Math.min(Math.max(Number(limit) || 25, 1), 200);
    const res = await git(
        ["log", `-${n}`, "--pretty=format:%h%x1f%an%x1f%ar%x1f%s"],
        cwd
    );
    if (res.code !== 0) return { ok: false, error: res.stderr.trim() || "not a git repository", commits: [] };
    const commits = res.stdout
        .split("\n")
        .filter(Boolean)
        .map(line => {
            const [hash, author, when, subject] = line.split("\x1f");
            return { hash, author, when, subject };
        });
    return { ok: true, commits };
}

async function gitIncoming(cwd) {
    const res = await git(["log", "HEAD..@{u}", "--pretty=format:%h%x1f%an%x1f%ar%x1f%s"], cwd);
    if (res.code !== 0) return { ok: false, commits: [] };
    const commits = res.stdout
        .split("\n")
        .filter(Boolean)
        .map(line => {
            const [hash, author, when, subject] = line.split("\x1f");
            return { hash, author, when, subject };
        });
    return { ok: true, commits };
}

async function gitDiff(cwd, opts = {}) {
    const args = opts.staged ? ["diff", "--cached"] : ["diff", "HEAD"];
    if (opts.file) args.push("--", opts.file);
    let res = await git(args, cwd);
    if (res.code !== 0 && !opts.staged) {
        // No commits yet: fall back to the working tree diff.
        res = await git(["diff"], cwd);
    }
    let patch = res.stdout || "";
    if (patch.length > MAX_OUTPUT) patch = `${patch.slice(0, MAX_OUTPUT)}\n\n… diff truncated …`;
    return { ok: res.code === 0, patch, error: res.code === 0 ? null : res.stderr.trim() };
}

async function gitFetch(cwd, token) {
    const args = [...tokenConfig(token), "fetch", "--all", "--prune"];
    const res = await git(args, cwd, { GIT_TERMINAL_PROMPT: "0" });
    return { ok: res.code === 0, stdout: res.stdout.trim(), stderr: res.stderr.trim() };
}

async function gitPull(cwd, token) {
    const args = [...tokenConfig(token), "pull", "--ff-only"];
    const res = await git(args, cwd, { GIT_TERMINAL_PROMPT: "0" });
    return { ok: res.code === 0, stdout: res.stdout.trim(), stderr: res.stderr.trim() };
}

async function gitPush(cwd, token, message) {
    const args = [...tokenConfig(token), "push"];
    if (message) args.push("--set-upstream", "origin", message);
    const res = await git(args, cwd, { GIT_TERMINAL_PROMPT: "0" });
    return { ok: res.code === 0, stdout: res.stdout.trim(), stderr: res.stderr.trim() };
}

/* ------------------------------- github api ------------------------------ */

async function ghRequest(token, pathname, opts = {}) {
    if (!token) throw new Error("GitHub token required");
    const res = await fetch(`https://api.github.com${pathname}`, {
        method: opts.method || "GET",
        headers: Object.assign(
            {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github+json",
                "User-Agent": "SaimCLI/1.0",
                "X-GitHub-Api-Version": "2022-11-28"
            },
            opts.headers || {}
        ),
        body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
    if (!res.ok) {
        const msg = (data && (data.message || data.error)) || `HTTP ${res.status}`;
        throw new Error(msg);
    }
    return data;
}

async function githubInfo(token) {
    const user = await ghRequest(token, "/user");
    return {
        ok: true,
        login: user.login,
        name: user.name,
        avatar: user.avatar_url,
        repos: user.public_repos
    };
}

async function githubRemoteCommits(token, remote, branch) {
    if (!remote || remote.host !== "github.com") throw new Error("origin is not a github.com repository");
    const ref = branch || "main";
    const commits = await ghRequest(token, `/repos/${remote.slug}/commits?sha=${encodeURIComponent(ref)}&per_page=15`);
    return {
        ok: true,
        commits: (commits || []).map(c => ({
            hash: (c.sha || "").slice(0, 7),
            subject: (c.commit && c.commit.message || "").split("\n")[0],
            author: c.commit && c.commit.author && c.commit.author.name,
            when: c.commit && c.commit.author && c.commit.author.date
        }))
    };
}

/* --------------------------------- hosting ------------------------------- */

async function vercelWhoami(token) {
    const res = await fetch("https://api.vercel.com/v2/user", {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "SaimCLI/1.0" }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error && data.error.message ? data.error.message : `HTTP ${res.status}`);
    return { ok: true, username: data.user && (data.user.username || data.user.email) };
}

async function vercelProjects(token) {
    const res = await fetch("https://api.vercel.com/v9/projects?limit=100", {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "SaimCLI/1.0" }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error && data.error.message ? data.error.message : `HTTP ${res.status}`);
    const list = (data.projects || []).map(p => ({
        id: p.id,
        name: p.name,
        repo: p.link && p.link.repo,
        repoId: p.link && p.link.repoId,
        url: p.alias && p.alias[0] ? `https://${p.alias[0]}` : null
    }));
    return { ok: true, projects: list };
}

/**
 * Triggers a deployment. Two routes, in order of preference:
 *  1. deploy hook URL (works for any project, no token required)
 *  2. token + project name -> Vercel git deployment via the REST API
 */
async function vercelDeploy(opts = {}) {
    const { token, hook, project, branch, target } = opts;

    if (hook) {
        const res = await fetch(hook, {
            method: "POST",
            headers: { "Content-Type": "application/json", "User-Agent": "SaimCLI/1.0" },
            body: JSON.stringify({ ref: branch || "main" })
        });
        const text = await res.text();
        if (!res.ok) throw new Error(text.slice(0, 300) || `hook failed (${res.status})`);
        let job = null;
        try { job = JSON.parse(text); } catch (e) { /* hooks may return empty body */ }
        return { ok: true, mode: "hook", id: job && job.job && job.job.id, url: null, raw: text.slice(0, 400) };
    }

    if (!token) throw new Error("Vercel token or deploy hook required");
    if (!project) throw new Error("Vercel project name required");

    const list = await vercelProjects(token);
    const found = list.projects.find(p => p.name === project || p.id === project);
    if (!found) throw new Error(`project "${project}" not found on this Vercel account`);
    if (!found.repoId) {
        throw new Error(
            `project "${found.name}" is not linked to a Git repository - use its Deploy Hook instead`
        );
    }

    const res = await fetch("https://api.vercel.com/v13/deployments", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "User-Agent": "SaimCLI/1.0"
        },
        body: JSON.stringify({
            name: found.name,
            project: found.id,
            target: target || "production",
            gitSource: {
                type: "github",
                repoId: found.repoId,
                ref: branch || "main"
            }
        })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error && data.error.message ? data.error.message : `HTTP ${res.status}`);
    return {
        ok: true,
        mode: "api",
        id: data.id,
        url: data.url ? `https://${data.url}` : found.url,
        readyState: data.readyState || data.status
    };
}

async function netlifySites(token) {
    const res = await fetch("https://api.netlify.com/api/v1/sites?per_page=100", {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "SaimCLI/1.0" }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
    const sites = (Array.isArray(data) ? data : []).map(s => ({
        id: s.id,
        name: s.name,
        url: s.ssl_url || s.url,
        repo: s.build_settings && s.build_settings.repo_url
    }));
    return { ok: true, sites };
}

async function netlifyDeploy(opts = {}) {
    const { token, siteId, hook, branch } = opts;

    if (hook) {
        const res = await fetch(hook, {
            method: "POST",
            headers: { "Content-Type": "application/json", "User-Agent": "SaimCLI/1.0" },
            body: JSON.stringify({ branch: branch || "main" })
        });
        const text = await res.text();
        if (!res.ok) throw new Error(text.slice(0, 300) || `hook failed (${res.status})`);
        return { ok: true, mode: "hook", raw: text.slice(0, 400) };
    }

    if (!token) throw new Error("Netlify token or deploy hook required");
    if (!siteId) throw new Error("Netlify site required");

    const res = await fetch(`https://api.netlify.com/api/v1/sites/${encodeURIComponent(siteId)}/builds`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "User-Agent": "SaimCLI/1.0"
        },
        body: JSON.stringify({ clear_cache: false })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
    return { ok: true, mode: "api", id: data.deploy_id || data.id, url: data.deploy_url || null };
}

module.exports = {
    parseRemote,
    gitStatus,
    gitLog,
    gitIncoming,
    gitDiff,
    gitFetch,
    gitPull,
    gitPush,
    githubInfo,
    githubRemoteCommits,
    vercelWhoami,
    vercelProjects,
    vercelDeploy,
    netlifySites,
    netlifyDeploy,
    vercelDomains,
    vercelDnsRecords,
    netlifyDomains,
    netlifyDnsRecords
};

/* --------------------------------- hosting domains & dns ------------------------------- */

/**
 * Vercel: list custom domains for a project.
 * GET https://api.vercel.com/v9/projects/{projectId}/domains
 */
async function vercelDomains(opts = {}) {
    const { token, project } = opts;
    if (!token) throw new Error("Vercel token required");
    if (!project) throw new Error("Vercel project required");
    const list = await vercelProjects(token);
    const found = list.projects.find(p => p.name === project || p.id === project);
    if (!found) throw new Error(`project "${project}" not found`);
    const res = await fetch(`https://api.vercel.com/v9/projects/${found.id}/domains`, {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "SaimCLI/1.0" }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error && data.error.message ? data.error.message : `HTTP ${res.status}`);
    const domains = (data.domains || []).map(d => ({
        id: d.id,
        name: d.name,
        type: d.type || "external",
        configured: !!d.configured,
        dnsConfigured: d.dnsConfigured,
        createdAt: d.createdAt
    }));
    return { ok: true, project: found.name, domains };
}

/**
 * Vercel: list DNS records for a domain.
 * GET https://api.vercel.com/v9/domains/{domainId}/records
 */
async function vercelDnsRecords(opts = {}) {
    const { token, domain } = opts;
    if (!token) throw new Error("Vercel token required");
    if (!domain) throw new Error("Vercel domain required");
    const res = await fetch(`https://api.vercel.com/v9/domains/${encodeURIComponent(domain)}/records`, {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "SaimCLI/1.0" }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error && data.error.message ? data.error.message : `HTTP ${res.status}`);
    const records = (data.records || []).map(r => ({
        id: r.id,
        name: r.name,
        type: r.type,
        value: r.value,
        ttl: r.ttl
    }));
    return { ok: true, domain, records };
}

/**
 * Netlify: list custom domains for a site.
 * GET https://api.netlify.com/api/v1/sites/{siteId}/custom_domains
 */
async function netlifyDomains(opts = {}) {
    const { token, siteId } = opts;
    if (!token) throw new Error("Netlify token required");
    if (!siteId) throw new Error("Netlify site required");
    const res = await fetch(`https://api.netlify.com/api/v1/sites/${encodeURIComponent(siteId)}/custom_domains`, {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "SaimCLI/1.0" }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error && data.error.message ? data.error.message : `HTTP ${res.status}`);
    const domains = (Array.isArray(data) ? data : data.custom_domains || []).map(d => ({
        id: d.id,
        name: d.name,
        type: d.type,
        ssl: d.ssl,
        dnsConfigured: d.dns_configured,
        createdAt: d.created_at
    }));
    return { ok: true, site: siteId, domains };
}

/**
 * Netlify: list DNS records for a DNS zone.
 * GET https://api.netlify.com/api/v1/dns_zones/{zoneId}/dns_records
 */
async function netlifyDnsRecords(opts = {}) {
    const { token, zoneId } = opts;
    if (!token) throw new Error("Netlify token required");
    if (!zoneId) throw new Error("Netlify DNS zone required");
    const res = await fetch(`https://api.netlify.com/api/v1/dns_zones/${encodeURIComponent(zoneId)}/dns_records`, {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "SaimCLI/1.0" }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error && data.error.message ? data.error.message : `HTTP ${res.status}`);
    const records = (data.dns_records || []).map(r => ({
        id: r.id,
        name: r.name,
        type: r.type,
        value: r.value,
        ttl: r.ttl
    }));
    return { ok: true, zone: zoneId, records };
}
