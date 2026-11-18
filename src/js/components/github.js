/**
 * Saim CLI - GitHub section (sidebar)
 * ---------------------------------------------------------------------------
 * Pull commits and push code with a personal access token. Git runs locally
 * through the bridge; the token is only used to authenticate HTTPS remotes.
 */
window.Saim = window.Saim || {};

(function (Saim) {
    "use strict";

    const H = Saim.helpers;

    const state = {
        status: null,
        local: [],
        incoming: [],
        busy: "",
        log: "",
        logKind: ""
    };

    function token() {
        return (Saim.state.settings && Saim.state.settings.githubToken) || "";
    }

    async function saveToken(value) {
        Saim.state.settings.githubToken = value;
        await Saim.bridge.saveSettings({ githubToken: value });
        Saim.toast(value ? "GitHub token saved" : "GitHub token removed", value ? "ok" : "warn");
        render();
    }

    /* ------------------------------- actions ------------------------------ */

    async function refresh(silent) {
        state.status = await Saim.bridge.gitStatus({ cwd: Saim.state.cwd });
        const log = await Saim.bridge.gitLog({ cwd: Saim.state.cwd, limit: 12 });
        state.local = (log && log.commits) || [];
        const inc = await Saim.bridge.gitIncoming({ cwd: Saim.state.cwd });
        state.incoming = (inc && inc.commits) || [];
        if (!silent) render();
        else render();
    }

    async function fetchRemote() {
        state.busy = "fetch";
        render();
        const res = await Saim.bridge.gitFetch({ cwd: Saim.state.cwd, token: token() });
        finish("fetch", res);
    }

    async function pull() {
        state.busy = "pull";
        render();
        const res = await Saim.bridge.gitPull({ cwd: Saim.state.cwd, token: token() });
        finish("pull", res);
        Saim.bus.emit("review:refresh");
    }

    async function push() {
        state.busy = "push";
        render();
        const branch = (state.status && state.status.branch) || "";
        const upstream = state.status && state.status.upstream ? null : branch;
        const res = await Saim.bridge.gitPush({ cwd: Saim.state.cwd, token: token(), upstream });
        finish("push", res);
        Saim.bus.emit("review:refresh");
    }

    function finish(action, res) {
        state.busy = "";
        if (res && res.ok) {
            state.logKind = "ok";
            state.log = `${action} ok\n${res.stdout || ""}`.trim();
            Saim.toast(`git ${action} complete`, "ok");
        } else {
            state.logKind = "error";
            const err = (res && (res.stderr || res.error)) || "command failed";
            state.log = `${action} failed\n${err}`.trim();
            if (/Authentication|could not read Username|terminal prompts disabled/i.test(err)) {
                state.log += "\n\nAdd a personal access token above (repo scope) to authenticate.";
            }
            Saim.toast(`git ${action} failed`, "error");
        }
        refresh();
    }

    async function verifyToken() {
        const value = token();
        if (!value) {
            Saim.toast("Add a GitHub token first", "warn");
            return;
        }
        state.busy = "verify";
        render();
        const res = await Saim.bridge.githubInfo({ token: value });
        state.busy = "";
        if (res && res.ok) {
            state.logKind = "ok";
            state.log = `Signed in as @${res.login}${res.name ? ` (${res.name})` : ""}`;
            Saim.toast(`GitHub: @${res.login}`, "ok");
        } else {
            state.logKind = "error";
            state.log = `Token check failed: ${(res && (res.error || res.message)) || "unknown error"}`;
        }
        render();
    }

    /* ------------------------------- render ------------------------------- */

    function render() {
        const body = document.getElementById("github-pane") || document.getElementById("sidebar-body");
        if (!body) return;
        H.clear(body);

        const wrap = H.el("div", "gh");

        /* token */
        const tokenCard = H.el("div", "gh__card");
        tokenCard.appendChild(H.el("div", "gh__label", "Personal access token"));
        const input = H.el("input", "gh__input");
        input.type = "password";
        input.placeholder = "ghp_… classic or fine-grained token";
        input.value = token();
        input.autocomplete = "off";
        input.spellcheck = false;
        input.setAttribute("aria-label", "GitHub personal access token");
        input.addEventListener("change", () => saveToken(input.value.trim()));
        tokenCard.appendChild(input);
        const tokenRow = H.el("div", "gh__row");
        tokenRow.appendChild(button("Save", "gh__btn", () => saveToken(input.value.trim())));
        tokenRow.appendChild(button("Verify", "gh__btn", verifyToken));
        if (token()) tokenRow.appendChild(button("Clear", "gh__btn gh__btn--ghost", () => saveToken("")));
        tokenCard.appendChild(tokenRow);
        tokenCard.appendChild(
            H.el("p", "gh__hint", "Stored locally in your Saim settings. Needs repo scope for push.")
        );
        wrap.appendChild(tokenCard);

        /* repo */
        const status = state.status;
        const repoCard = H.el("div", "gh__card");
        if (!status || !status.repo) {
            repoCard.appendChild(H.el("div", "gh__label", "Repository"));
            repoCard.appendChild(H.el("p", "gh__hint", "This folder is not a git repository."));
            repoCard.appendChild(button("Initialize repo", "gh__btn", initRepo));
        } else {
            const head = H.el("div", "gh__repo");
            head.appendChild(H.el("span", "gh__branch", status.branch));
            if (status.remote) head.appendChild(H.el("span", "gh__remote", status.remote.slug));
            repoCard.appendChild(head);

            const meta = H.el("div", "gh__meta");
            meta.appendChild(chip(`↑ ${status.ahead}`, "ahead"));
            meta.appendChild(chip(`↓ ${status.behind}`, "behind"));
            meta.appendChild(chip(`${status.changes.length} changed`, "changed"));
            repoCard.appendChild(meta);

            const actions = H.el("div", "gh__row gh__row--3");
            actions.appendChild(button(state.busy === "fetch" ? "Fetching…" : "Fetch", "gh__btn", fetchRemote, state.busy));
            actions.appendChild(button(state.busy === "pull" ? "Pulling…" : "Pull", "gh__btn gh__btn--primary", pull, state.busy));
            actions.appendChild(button(state.busy === "push" ? "Pushing…" : "Push", "gh__btn", push, state.busy));
            repoCard.appendChild(actions);
        }
        wrap.appendChild(repoCard);

        /* incoming commits */
        if (status && status.repo) {
            if (status.remote) {
                wrap.appendChild(sectionTitle(`Incoming (${state.incoming.length})`));
                if (state.incoming.length === 0) {
                    wrap.appendChild(H.el("p", "gh__hint gh__hint--pad", "Up to date with the remote."));
                } else {
                    const list = H.el("div", "gh__commits");
                    state.incoming.forEach(c => list.appendChild(commitRow(c)));
                    wrap.appendChild(list);
                }
            } else {
                wrap.appendChild(sectionTitle("Remote"));
                wrap.appendChild(
                    H.el("p", "gh__hint gh__hint--pad", "No origin remote yet — add one to fetch, pull and push.")
                );
            }

            wrap.appendChild(sectionTitle(`Recent commits (${state.local.length})`));
            const localList = H.el("div", "gh__commits");
            if (state.local.length === 0) {
                localList.appendChild(H.el("p", "gh__hint gh__hint--pad", "No commits yet."));
            } else {
                state.local.forEach(c => localList.appendChild(commitRow(c)));
            }
            wrap.appendChild(localList);
        }

        /* log */
        if (state.log) {
            const out = H.el("pre", `gh__log ${state.logKind === "error" ? "is-error" : ""}`);
            out.textContent = state.log;
            wrap.appendChild(out);
        }

        body.appendChild(wrap);
    }

    async function initRepo() {
        const res = await Saim.bridge.run("git init", Saim.state.cwd);
        if (res && res.code === 0) {
            Saim.toast("git repository initialized", "ok");
            refresh();
        } else {
            Saim.toast("Could not initialize git", "error");
        }
    }

    /* ------------------------------- pieces ------------------------------- */

    function button(label, cls, onClick, busy) {
        const btn = H.el("button", cls, label);
        btn.type = "button";
        if (busy) btn.disabled = true;
        btn.addEventListener("click", onClick);
        return btn;
    }

    function chip(text, kind) {
        return H.el("span", `gh__chip gh__chip--${kind}`, text);
    }

    function sectionTitle(text) {
        return H.el("div", "sidebar__section", text);
    }

    function commitRow(commit) {
        const row = H.el("div", "gh__commit");
        row.appendChild(H.el("span", "gh__hash", commit.hash));
        const bodyEl = H.el("div", "gh__commit-body");
        bodyEl.appendChild(H.el("div", "gh__subject", commit.subject || "(no subject)"));
        bodyEl.appendChild(H.el("div", "gh__byline", `${commit.author || "?"} · ${commit.when || ""}`));
        row.appendChild(bodyEl);
        row.title = `${commit.hash} · ${commit.subject || ""}`;
        return row;
    }

    async function init() {
        Saim.bus.on("cwd:changed", () => refresh(true));
        Saim.bus.on("git:refresh", () => refresh());
        await refresh(true);
    }

    Saim.github = { init, render, refresh };
})(window.Saim);
