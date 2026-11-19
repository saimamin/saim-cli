/**
 * Saim CLI - center workspace
 * ---------------------------------------------------------------------------
 * Four views in the main area: Open File, Terminal, Review, Browser.
 * The AI chat host floats above the panes; picking a view tucks it away and
 * the "AI" button in the segment bar brings it back.
 */
window.Saim = window.Saim || {};

(function (Saim) {
    "use strict";

    const H = Saim.helpers;
    const RECENT_KEY = "saim.recentFiles";

    const state = {
        pane: "terminal",
        diffFile: null,
        diffStaged: false
    };

    let segEl = null;
    let panesEl = null;
    let chatHost = null;
    let browserState = { history: [], index: -1 };

    /* ------------------------------------------------------------------ */
    /* view switching                                                      */
    /* ------------------------------------------------------------------ */

    function show(pane, opts) {
        opts = opts || {};
        state.pane = pane;
        Saim.state.workspacePane = pane;

        if (Saim.nav && Saim.nav.go) {
            Saim.nav.go(pane, { skipWorkspace: true });
        } else {
            document.querySelectorAll(".wstab").forEach(tab => {
                const active = tab.dataset.ws === pane;
                tab.classList.toggle("is-active", active);
                tab.setAttribute("aria-selected", active ? "true" : "false");
            });
            document.querySelectorAll(".ws__pane").forEach(el => {
                el.classList.toggle("is-active", el.dataset.pane === pane);
            });
        }

        if (pane === "terminal") {
            // Boot creates the first terminal; only backfill after it finishes.
            if (Saim.state.bootComplete && Saim.terminals.tabs().length === 0) Saim.terminals.create({});
            setTimeout(() => Saim.terminals.fitAll(), 60);
        }
        if (pane === "file") syncFilePane();
        if (pane === "review") refreshReview();
        if (pane === "browser") setTimeout(focusUrl, 40);
    }

    function setChat(open) {
        Saim.state.chatOpen = open;
        if (!open) return;
        // The chat is a stage pane now: opening it is plain navigation.
        if (Saim.nav && Saim.nav.go) Saim.nav.go("session");
        if (Saim.opencode && Saim.opencode.render) {
            try { Saim.opencode.render(); } catch (e) { /* not connected yet */ }
        }
    }

    function toggleChat() {
        setChat(!Saim.state.chatOpen);
    }

    async function openFile() {
        let path = null;
        try {
            path = await Saim.bridge.openFile(Saim.state.cwd);
        } catch (e) {
            path = null;
        }
        // The browser preview has no native dialog - ask for a path instead.
        if (!path) path = await Saim.modal.prompt("Path to open", `${Saim.state.cwd}/`);
        if (!path) return;
        await openPath(path);
    }

    async function openPath(path) {
        await Saim.editor.open(path);
        pushRecent(path);
        syncFilePane();
    }

    function pushRecent(path) {
        let list = [];
        try { list = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch (e) { list = []; }
        list = [path].concat(list.filter(item => item !== path)).slice(0, 6);
        try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) { /* storage full */ }
        renderRecent();
    }

    function renderRecent() {
        const host = document.getElementById("ws-recent");
        if (!host) return;
        H.clear(host);
        let list = [];
        try { list = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch (e) { list = []; }
        list.forEach(path => {
            const btn = H.el("button", null, path.split("/").pop() || path);
            btn.title = path;
            btn.addEventListener("click", () => openPath(path));
            host.appendChild(btn);
        });
    }

    function syncFilePane() {
        const drop = document.getElementById("ws-filedrop");
        const editor = document.getElementById("editor");
        if (!drop || !editor) return;
        drop.hidden = !editor.hidden;
    }

    /* ------------------------------------------------------------------ */
    /* review                                                              */
    /* ------------------------------------------------------------------ */

    async function refreshReview() {
        const filesEl = document.getElementById("review-files");
        const diffEl = document.getElementById("review-diff");
        const branchEl = document.getElementById("review-branch");
        const metaEl = document.getElementById("review-meta");
        if (!filesEl || !diffEl) return;

        const status = await Saim.bridge.gitStatus({ cwd: Saim.state.cwd });
        if (!status || !status.repo) {
            if (branchEl) branchEl.textContent = "no repo";
            if (metaEl) metaEl.textContent = "Initialize git to review changes";
            filesEl.innerHTML = "";
            diffEl.textContent = "This folder is not a git repository.";
            return;
        }

        if (branchEl) branchEl.textContent = status.branch;
        if (metaEl) {
            const bits = [];
            if (status.ahead) bits.push(`↑${status.ahead}`);
            if (status.behind) bits.push(`↓${status.behind}`);
            bits.push(`${status.changes.length} changed`);
            metaEl.textContent = bits.join(" · ");
        }

        H.clear(filesEl);
        if (status.changes.length === 0) {
            state.diffFile = null;
            diffEl.textContent = "Working tree clean — nothing to review.";
            return;
        }

        status.changes.forEach(change => {
            const row = H.el("button", "review__file");
            const code = change.status.toUpperCase();
            const statusEl = H.el("span", "review__file-status", code.slice(0, 1));
            if (code.includes("A") || code.includes("?")) statusEl.classList.add("is-add");
            if (code.includes("D")) statusEl.classList.add("is-del");
            row.appendChild(statusEl);
            const pathEl = H.el("span", "review__file-path", change.path);
            row.appendChild(pathEl);
            row.addEventListener("click", () => {
                state.diffFile = change.path;
                document.querySelectorAll(".review__file").forEach(el => el.classList.remove("is-active"));
                row.classList.add("is-active");
                loadDiff(change.path);
            });
            filesEl.appendChild(row);
        });

        const first = status.changes[0].path;
        state.diffFile = first;
        const firstRow = filesEl.firstChild;
        if (firstRow) firstRow.classList.add("is-active");
        await loadDiff(first);
    }

    async function loadDiff(file) {
        const diffEl = document.getElementById("review-diff");
        if (!diffEl) return;
        diffEl.textContent = "Loading diff…";
        const res = await Saim.bridge.gitDiff({
            cwd: Saim.state.cwd,
            staged: state.diffStaged,
            file
        });
        if (!res) {
            diffEl.textContent = "Could not read the diff.";
            return;
        }
        if (!res.patch) {
            diffEl.textContent = "No diff for this file yet.";
            return;
        }
        renderDiff(diffEl, res.patch);
    }

    /** Light syntax tinting without innerHTML on untrusted patch text. */
    function renderDiff(host, patch) {
        H.clear(host);
        patch.split("\n").forEach(line => {
            const span = document.createElement("span");
            if (line.startsWith("+++") || line.startsWith("---")) {
                span.className = "diff-hunk";
            } else if (line.startsWith("@@")) {
                span.className = "diff-hunk";
            } else if (line.startsWith("+")) {
                span.className = "diff-add";
            } else if (line.startsWith("-")) {
                span.className = "diff-del";
            }
            span.textContent = `${line}\n`;
            host.appendChild(span);
        });
    }

    /* ------------------------------------------------------------------ */
    /* browser                                                             */
    /* ------------------------------------------------------------------ */

    const QUICK_LINKS = [
        { label: "GitHub", url: "https://github.com" },
        { label: "Vercel", url: "https://vercel.com/dashboard" },
        { label: "Netlify", url: "https://app.netlify.com" },
        { label: "MDN", url: "https://developer.mozilla.org" },
        { label: "localhost:3000", url: "http://localhost:3000" }
    ];

    function normalizeUrl(raw) {
        const value = String(raw || "").trim();
        if (!value) return null;
        if (/^https?:\/\//i.test(value)) return value;
        if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(value)) return `http://${value}`;
        if (/^[\w-]+(\.[\w-]+)+(\/|:|$)/.test(value)) return `https://${value}`;
        return `https://duckduckgo.com/?q=${encodeURIComponent(value)}`;
    }

    function navigate(raw, opts) {
        opts = opts || {};
        const url = normalizeUrl(raw);
        if (!url) return;
        // Ensure the browser pane is active when navigating from elsewhere.
        if (state.pane !== "browser" && !opts.fromHistory) {
            if (Saim.nav && Saim.nav.go) Saim.nav.go("browser");
            else show("browser", { skipNav: true });
        }
        const frame = document.getElementById("browser-frame");
        const start = document.getElementById("browser-start");
        const input = document.getElementById("browser-url");
        if (!frame) return;

        if (!opts.fromHistory) {
            browserState.history = browserState.history.slice(0, browserState.index + 1);
            browserState.history.push(url);
            browserState.index = browserState.history.length - 1;
        }
        frame.hidden = false;
        if (start) start.hidden = true;
        frame.src = url;
        if (input) input.value = url;
        Saim.state.browserUrl = url;
        updateNav();
    }

    function updateNav() {
        const back = document.getElementById("browser-back");
        const forward = document.getElementById("browser-forward");
        if (back) back.disabled = browserState.index <= 0;
        if (forward) forward.disabled = browserState.index >= browserState.history.length - 1;
    }

    function goBack() {
        if (browserState.index <= 0) return;
        browserState.index -= 1;
        navigate(browserState.history[browserState.index], { fromHistory: true });
    }

    function goForward() {
        if (browserState.index >= browserState.history.length - 1) return;
        browserState.index += 1;
        navigate(browserState.history[browserState.index], { fromHistory: true });
    }

    function reload() {
        const frame = document.getElementById("browser-frame");
        if (!frame || frame.hidden) {
            if (browserState.history.length) navigate(browserState.history[browserState.index], { fromHistory: true });
            return;
        }
        // Re-assigning src is the only reliable cross-origin reload.
        const url = frame.src;
        frame.src = "about:blank";
        setTimeout(() => { frame.src = url; }, 30);
    }

    function focusUrl() {
        const input = document.getElementById("browser-url");
        if (input && window.innerWidth > 768) input.focus();
    }

    function renderQuickLinks() {
        const host = document.getElementById("browser-links");
        if (!host || host.children.length) return;
        QUICK_LINKS.forEach(link => {
            const btn = H.el("button", null, link.label);
            btn.type = "button";
            btn.addEventListener("click", () => navigate(link.url));
            host.appendChild(btn);
        });
    }

    /* ------------------------------------------------------------------ */
    /* init                                                                */
    /* ------------------------------------------------------------------ */

    function init() {
        segEl = document.getElementById("ws-seg");
        panesEl = document.getElementById("ws-panes");
        chatHost = document.getElementById("ai-chat-host");

        if (segEl) {
            segEl.querySelectorAll(".wstab").forEach(tab => {
                tab.addEventListener("click", () => show(tab.dataset.ws));
            });
        }

        const chatBtn = document.getElementById("ws-chat");
        if (chatBtn) chatBtn.addEventListener("click", toggleChat);

        // Open File
        const openBtn = document.getElementById("ws-openfile");
        if (openBtn) openBtn.addEventListener("click", openFile);
        renderRecent();

        const editorEl = document.getElementById("editor");
        if (editorEl && window.MutationObserver) {
            new MutationObserver(syncFilePane).observe(editorEl, { attributes: true, attributeFilter: ["hidden"] });
        }
        const editorClose = document.getElementById("editor-close");
        if (editorClose) editorClose.addEventListener("click", () => setTimeout(syncFilePane, 0));

        // Review
        const refreshBtn = document.getElementById("review-refresh");
        if (refreshBtn) refreshBtn.addEventListener("click", refreshReview);
        const stagedBox = document.getElementById("review-staged");
        if (stagedBox) {
            stagedBox.addEventListener("change", () => {
                state.diffStaged = stagedBox.checked;
                if (state.diffFile) loadDiff(state.diffFile);
            });
        }

        // Browser
        renderQuickLinks();
        const form = document.getElementById("browser-form");
        const input = document.getElementById("browser-url");
        if (form) {
            form.addEventListener("submit", event => {
                event.preventDefault();
                navigate(input ? input.value : "");
            });
        }
        const back = document.getElementById("browser-back");
        const forward = document.getElementById("browser-forward");
        const reloadBtn = document.getElementById("browser-reload");
        const external = document.getElementById("browser-external");
        if (back) back.addEventListener("click", goBack);
        if (forward) forward.addEventListener("click", goForward);
        if (reloadBtn) reloadBtn.addEventListener("click", reload);
        if (external) {
            external.addEventListener("click", () => {
                const url = Saim.state.browserUrl;
                if (url) Saim.bridge.openExternal(url);
                else Saim.toast("Open a page first", "warn");
            });
        }
        updateNav();

        // Deep links from elsewhere in the app.
        Saim.bus.on("workspace:show", payload => {
            if (payload && payload.pane) show(payload.pane);
        });
        Saim.bus.on("browser:navigate", payload => {
            show("browser");
            if (payload && payload.url) navigate(payload.url);
        });
        Saim.bus.on("review:refresh", () => {
            if (state.pane === "review") refreshReview();
        });
    }

    Saim.workspace = {
        init,
        show,
        setChat,
        toggleChat,
        openPath,
        openFile,
        refreshReview,
        navigate,
        get pane() { return state.pane; }
    };
})(window.Saim);
