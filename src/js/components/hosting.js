/**
 * Saim CLI - Hosting section (sidebar)
 * ---------------------------------------------------------------------------
 * Deploy with Vercel or Netlify. Each provider accepts an API token (project
 * list + deploy) or a deploy hook URL (no token needed).
 */
window.Saim = window.Saim || {};

(function (Saim) {
    "use strict";

    const H = Saim.helpers;

    const state = {
        provider: "vercel",
        busy: "",
        log: "",
        logKind: "",
        projects: [],
        sites: [],
        account: "",
        result: null,
        domains: [],
        dnsRecords: [],
        selectedDomain: null,
        selectedZone: null
    };

    const settings = () => Saim.state.settings || {};

    function persist(patch) {
        Object.assign(Saim.state.settings, patch);
        Saim.bridge.saveSettings(patch);
    }

    /* ------------------------------- vercel ------------------------------- */

    async function vercelConnect() {
        const token = (settings().vercelToken || "").trim();
        if (!token) {
            Saim.toast("Add a Vercel token first", "warn");
            return;
        }
        state.busy = "vercel-connect";
        render();
        const who = await Saim.bridge.hostingVercelWhoami({ token });
        if (!who || !who.ok) {
            state.busy = "";
            state.logKind = "error";
            state.log = `Vercel: ${(who && who.error) || "token rejected"}`;
            render();
            return;
        }
        state.account = who.username || "connected";
        const list = await Saim.bridge.hostingVercelProjects({ token });
        state.busy = "";
        state.projects = (list && list.projects) || [];
        state.logKind = "ok";
        state.log = `Vercel: connected as ${state.account} · ${state.projects.length} project(s)`;
        render();
    }

    async function vercelDeploy() {
        const s = settings();
        state.busy = "vercel-deploy";
        state.result = null;
        render();
        const res = await Saim.bridge.hostingVercelDeploy({
            token: s.vercelToken || "",
            hook: s.vercelHook || "",
            project: s.vercelProject || "",
            branch: s.deployBranch || "main",
            target: s.vercelTarget || "production"
        });
        state.busy = "";
        if (res && res.ok) {
            state.logKind = "ok";
            state.log = `Vercel deployment queued${res.id ? ` · ${res.id}` : ""}`;
            state.result = res.url || null;
            Saim.toast("Vercel deployment started", "ok");
        } else {
            state.logKind = "error";
            state.log = `Vercel deploy failed: ${(res && res.error) || "unknown error"}`;
            Saim.toast("Vercel deploy failed", "error");
        }
        render();
    }

    /* ------------------------------- netlify ------------------------------ */

    async function netlifyConnect() {
        const token = (settings().netlifyToken || "").trim();
        if (!token) {
            Saim.toast("Add a Netlify token first", "warn");
            return;
        }
        state.busy = "netlify-connect";
        render();
        const res = await Saim.bridge.hostingNetlifySites({ token });
        state.busy = "";
        if (!res || !res.ok) {
            state.logKind = "error";
            state.log = `Netlify: ${(res && res.error) || "token rejected"}`;
        } else {
            state.sites = res.sites || [];
            state.logKind = "ok";
            state.log = `Netlify: ${state.sites.length} site(s) found`;
        }
        render();
    }

    async function netlifyDeploy() {
        const s = settings();
        state.busy = "netlify-deploy";
        state.result = null;
        render();
        const res = await Saim.bridge.hostingNetlifyDeploy({
            token: s.netlifyToken || "",
            hook: s.netlifyHook || "",
            siteId: s.netlifySite || "",
            branch: s.deployBranch || "main"
        });
        state.busy = "";
        if (res && res.ok) {
            state.logKind = "ok";
            state.log = `Netlify build queued${res.id ? ` · ${res.id}` : ""}`;
            state.result = res.url || null;
            Saim.toast("Netlify build started", "ok");
        } else {
            state.logKind = "error";
            state.log = `Netlify deploy failed: ${(res && res.error) || "unknown error"}`;
            Saim.toast("Netlify deploy failed", "error");
        }
        render();
    }

    /* ------------------------------- domains & dns ------------------------------ */

    async function vercelLoadDomains() {
        const s = settings();
        if (!s.vercelProject) { state.domains = []; state.dnsRecords = []; render(); return; }
        state.busy = "vercel-domains";
        render();
        const res = await Saim.bridge.hostingVercelDomains({ token: s.vercelToken || "", project: s.vercelProject });
        state.busy = "";
        state.domains = (res && res.ok && res.domains) || [];
        state.dnsRecords = [];
        state.selectedDomain = state.domains[0] ? state.domains[0].name : null;
        if (state.selectedDomain) await vercelLoadDns();
        render();
    }

    async function vercelLoadDns() {
        const s = settings();
        state.busy = "vercel-dns";
        const res = await Saim.bridge.hostingVercelDns({ token: s.vercelToken || "", domain: state.selectedDomain });
        state.busy = "";
        state.dnsRecords = (res && res.ok && res.records) || [];
        render();
    }

    async function netlifyLoadDomains() {
        const s = settings();
        if (!s.netlifySite) { state.domains = []; state.dnsRecords = []; render(); return; }
        state.busy = "netlify-domains";
        render();
        const res = await Saim.bridge.hostingNetlifyDomains({ token: s.netlifyToken || "", siteId: s.netlifySite });
        state.busy = "";
        state.domains = (res && res.ok && res.domains) || [];
        state.dnsRecords = [];
        state.selectedZone = null;
        render();
    }

    async function netlifyLoadDns(zoneId) {
        const s = settings();
        state.busy = "netlify-dns";
        state.selectedZone = zoneId;
        const res = await Saim.bridge.hostingNetlifyDns({ token: s.netlifyToken || "", zoneId });
        state.busy = "";
        state.dnsRecords = (res && res.ok && res.records) || [];
        render();
    }

    /* ------------------------------- render ------------------------------- */

    function render() {
        const body = document.getElementById("hosting-pane") || document.getElementById("sidebar-body");
        if (!body) return;
        H.clear(body);

        const wrap = H.el("div", "host");

        /* provider switch */
        const tabs = H.el("div", "host__tabs");
        [["vercel", "Vercel"], ["netlify", "Netlify"]].forEach(([key, label]) => {
            const tab = H.el("button", `host__tab ${state.provider === key ? "is-active" : ""}`, label);
            tab.type = "button";
            tab.addEventListener("click", () => {
                state.provider = key;
                state.log = "";
                state.result = null;
                render();
            });
            tabs.appendChild(tab);
        });
        wrap.appendChild(tabs);

        if (state.provider === "vercel") renderVercel(wrap);
        else renderNetlify(wrap);

        if (state.log) {
            const out = H.el("pre", `gh__log ${state.logKind === "error" ? "is-error" : ""}`);
            out.textContent = state.log;
            wrap.appendChild(out);
        }
        if (state.result) {
            const link = H.el("button", "gh__btn host__result", "Open deployment ↗");
            link.type = "button";
            link.title = state.result;
            link.addEventListener("click", () => {
                Saim.workspace.show("browser");
                Saim.workspace.navigate(state.result);
            });
            wrap.appendChild(link);
        }

        /* ---- domains & dns card ---- */
        const s = settings();
        const hasDomainCtx = (state.provider === "vercel" && s.vercelProject) || (state.provider === "netlify" && s.netlifySite);
        if (true) {
            const dCard = H.el("div", "gh__card");
            dCard.appendChild(H.el("div", "gh__label", "Domains & DNS"));
            const dHead = H.el("div", "gh__row");
            const loadBtn = button(
                state.busy.endsWith("domains") || state.busy.endsWith("dns") ? "Loading…" : "Refresh domains",
                "gh__btn",
                () => { if (state.provider === "vercel") vercelLoadDomains(); else netlifyLoadDomains(); }
            );
            dHead.appendChild(loadBtn);
            dCard.appendChild(dHead);

            const dList = H.el("div", "gh__domains");
            if (state.domains.length) {
                state.domains.forEach(dom => {
                    const row = H.el("div", "gh__domain-row");
                    row.appendChild(H.el("span", "gh__domain-name", dom.name));
                    const chip = H.el("span", `gh__chip ${dom.dnsConfigured ? "is-ok" : "is-warn"}`, dom.dnsConfigured ? "dns ok" : "dns pending");
                    row.appendChild(chip);
                    const viewBtn = H.el("button", "gh__btn", "DNS records");
                    viewBtn.type = "button";
                    viewBtn.addEventListener("click", () => {
                        state.selectedDomain = dom.name;
                        if (state.provider === "vercel") vercelLoadDns();
                        else netlifyLoadDns(dom.id);
                    });
                    row.appendChild(viewBtn);
                    dList.appendChild(row);
                });
            } else {
                dList.appendChild(H.el("p", "gh__hint", !hasDomainCtx
                    ? `Connect with a token and select a ${state.provider === "vercel" ? "project" : "site"} above to manage domains and DNS.`
                    : "No domains found for this project / site."));
            }
            dCard.appendChild(dList);

            if (state.dnsRecords.length) {
                dCard.appendChild(H.el("div", "gh__label", `DNS records · ${state.selectedDomain || state.selectedZone || ""}`));
                const tbody = H.el("div", "gh__dns-table");
                state.dnsRecords.forEach(rec => {
                    const row = H.el("div", "gh__dns-row");
                    row.appendChild(H.el("span", "gh__dns-name", rec.name));
                    row.appendChild(H.el("span", "gh__dns-type", rec.type));
                    row.appendChild(H.el("span", "gh__dns-value", rec.value));
                    row.appendChild(H.el("span", "gh__dns-ttl", rec.ttl ? `${rec.ttl}s` : "—"));
                    tbody.appendChild(row);
                });
                dCard.appendChild(tbody);
            }
            wrap.appendChild(dCard);
        }

        body.appendChild(wrap);
    }

    function renderVercel(wrap) {
        const s = settings();
        const tokenCard = H.el("div", "gh__card");
        tokenCard.appendChild(H.el("div", "gh__label", "Vercel token"));
        tokenCard.appendChild(
            field("vercelToken", "vercel_… account token", s.vercelToken, "password", {
                onSave: value => { state.projects = []; state.account = ""; }
            })
        );
        const row = H.el("div", "gh__row");
        row.appendChild(button(state.busy === "vercel-connect" ? "Connecting…" : "Connect", "gh__btn", vercelConnect, state.busy));
        tokenCard.appendChild(row);
        tokenCard.appendChild(H.el("p", "gh__hint", "Create at vercel.com/account/tokens (scope: full account)."));
        wrap.appendChild(tokenCard);

        /* project */
        const projectCard = H.el("div", "gh__card");
        projectCard.appendChild(H.el("div", "gh__label", "Project & branch"));
        if (state.projects.length) {
            const select = H.el("select", "gh__input");
            select.appendChild(option("", "Select project…"));
            state.projects.forEach(p => select.appendChild(option(p.name, p.name)));
            select.value = s.vercelProject || "";
            select.addEventListener("change", () => {
                persist({ vercelProject: select.value });
                vercelLoadDomains();
            });
            projectCard.appendChild(select);
        } else {
            projectCard.appendChild(
                field("vercelProject", "project-name", s.vercelProject, "text", { placeholder: "my-site" })
            );
        }

        const branchRow = H.el("div", "gh__row");
        branchRow.appendChild(
            field("deployBranch", "branch", s.deployBranch || "main", "text", { placeholder: "main" })
        );
        const targetSelect = H.el("select", "gh__input");
        targetSelect.appendChild(option("production", "production"));
        targetSelect.appendChild(option("preview", "preview"));
        targetSelect.value = s.vercelTarget || "production";
        targetSelect.addEventListener("change", () => persist({ vercelTarget: targetSelect.value }));
        branchRow.appendChild(targetSelect);
        projectCard.appendChild(branchRow);
        wrap.appendChild(projectCard);

        /* hook */
        const hookCard = H.el("div", "gh__card");
        hookCard.appendChild(H.el("div", "gh__label", "Deploy hook (optional)"));
        hookCard.appendChild(
            field("vercelHook", "https://api.vercel.com/v1/integrations/deploy/…", s.vercelHook, "url", {
                placeholder: "https://api.vercel.com/v1/integrations/deploy/…"
            })
        );
        hookCard.appendChild(H.el("p", "gh__hint", "A hook works even when the project is not linked to Git."));
        wrap.appendChild(hookCard);

        const deploy = button(
            state.busy === "vercel-deploy" ? "Deploying…" : "Deploy to Vercel",
            "gh__btn gh__btn--primary gh__deploy",
            vercelDeploy,
            state.busy
        );
        wrap.appendChild(deploy);
    }

    function renderNetlify(wrap) {
        const s = settings();
        const tokenCard = H.el("div", "gh__card");
        tokenCard.appendChild(H.el("div", "gh__label", "Netlify token"));
        tokenCard.appendChild(
            field("netlifyToken", "nfp_… personal access token", s.netlifyToken, "password", {
                onSave: () => { state.sites = []; }
            })
        );
        const row = H.el("div", "gh__row");
        row.appendChild(button(state.busy === "netlify-connect" ? "Connecting…" : "Connect", "gh__btn", netlifyConnect, state.busy));
        tokenCard.appendChild(row);
        tokenCard.appendChild(H.el("p", "gh__hint", "Create at app.netlify.com/user/applications#personal-access-tokens."));
        wrap.appendChild(tokenCard);

        /* site */
        const siteCard = H.el("div", "gh__card");
        siteCard.appendChild(H.el("div", "gh__label", "Site & branch"));
        if (state.sites.length) {
            const select = H.el("select", "gh__input");
            select.appendChild(option("", "Select site…"));
            state.sites.forEach(site => select.appendChild(option(site.id, site.name)));
            select.value = s.netlifySite || "";
            select.addEventListener("change", () => {
                persist({ netlifySite: select.value });
                netlifyLoadDomains();
            });
            siteCard.appendChild(select);
        } else {
            siteCard.appendChild(
                field("netlifySite", "site id (api-id)", s.netlifySite, "text", { placeholder: "site id" })
            );
        }

        const branchRow = H.el("div", "gh__row");
        branchRow.appendChild(
            field("deployBranch", "branch", s.deployBranch || "main", "text", { placeholder: "main" })
        );
        siteCard.appendChild(branchRow);
        wrap.appendChild(siteCard);

        const hookCard = H.el("div", "gh__card");
        hookCard.appendChild(H.el("div", "gh__label", "Build hook (optional)"));
        hookCard.appendChild(
            field("netlifyHook", "https://api.netlify.com/build_hooks/…", s.netlifyHook, "url", {
                placeholder: "https://api.netlify.com/build_hooks/…"
            })
        );
        wrap.appendChild(hookCard);

        const deploy = button(
            state.busy === "netlify-deploy" ? "Deploying…" : "Deploy to Netlify",
            "gh__btn gh__btn--primary gh__deploy",
            netlifyDeploy,
            state.busy
        );
        wrap.appendChild(deploy);
    }

    /* ------------------------------- pieces ------------------------------- */

    function field(key, placeholder, value, type, opts) {
        opts = opts || {};
        const input = H.el("input", "gh__input");
        input.type = type || "text";
        input.placeholder = opts.placeholder || placeholder;
        input.value = value || "";
        input.autocomplete = "off";
        input.spellcheck = false;
        input.setAttribute("aria-label", key);
        input.addEventListener("change", () => {
            const patch = {};
            patch[key] = input.value.trim();
            persist(patch);
            if (opts.onSave) opts.onSave(input.value.trim());
            render();
        });
        return input;
    }

    function button(label, cls, onClick, busy) {
        const btn = H.el("button", cls, label);
        btn.type = "button";
        if (busy) btn.disabled = true;
        btn.addEventListener("click", onClick);
        return btn;
    }

    function option(value, label) {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = label;
        return opt;
    }

    function init() {
        // Settings may change from the settings panel; keep the view fresh.
        Saim.bus.on("settings:changed", () => {
            if (Saim.state.sidebarView === "hosting") render();
        });
    }

    Saim.hosting = { init, render };
})(window.Saim);
