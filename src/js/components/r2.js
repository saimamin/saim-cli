/**
 * Saim CLI - Cloudflare R2 storage
 * ---------------------------------------------------------------------------
 * Manage R2 buckets and back up / restore project folders. Credentials stay
 * in the local settings file; all network calls go through the bridge.
 */
window.Saim = window.Saim || {};

(function (Saim) {
    "use strict";

    const H = Saim.helpers;

    const state = {
        buckets: [],
        objects: [],
        busy: "",
        log: "",
        logKind: "",
        lastBackup: null
    };

    const settings = () => Saim.state.settings || {};

    function persist(patch) {
        Object.assign(settings(), patch);
        Saim.bridge.saveSettings(patch);
    }

    function creds() {
        const s = settings();
        return {
            accountId: (s.r2AccountId || "").trim(),
            accessKeyId: (s.r2AccessKeyId || "").trim(),
            secretAccessKey: (s.r2SecretKey || "").trim()
        };
    }

    function hasCreds() {
        const c = creds();
        return c.accountId && c.accessKeyId && c.secretAccessKey;
    }

    function setLog(msg, kind) {
        state.log = msg || "";
        state.logKind = kind || "";
        render();
    }

    /* ------------------------------- actions ------------------------------ */

    async function listBuckets() {
        if (!hasCreds()) { setLog("Add account ID, access key ID and secret key first.", "error"); return; }
        state.busy = "buckets";
        render();
        const res = await Saim.bridge.r2Buckets(creds());
        state.busy = "";
        if (res && res.ok) {
            state.buckets = res.buckets || [];
            setLog(`Found ${state.buckets.length} bucket(s)`, "ok");
        } else {
            setLog(`R2: ${(res && res.error) || "could not list buckets"}`, "error");
        }
    }

    async function createBucket(name) {
        if (!name) { Saim.toast("Enter a bucket name", "warn"); return; }
        state.busy = "create";
        render();
        const res = await Saim.bridge.r2CreateBucket(Object.assign({ bucket: name }, creds()));
        state.busy = "";
        if (res && res.ok) {
            persist({ r2Bucket: name });
            Saim.toast(`Bucket ${name} created`, "ok");
            await listBuckets();
            await listObjects();
        } else {
            setLog(`R2: ${(res && res.error) || "could not create bucket"}`, "error");
        }
    }

    async function listObjects() {
        if (!hasCreds() || !settings().r2Bucket) {
            state.objects = [];
            render();
            return;
        }
        state.busy = "objects";
        render();
        const res = await Saim.bridge.r2Objects(Object.assign({
            bucket: settings().r2Bucket,
            prefix: settings().r2Prefix || "backups"
        }, creds()));
        state.busy = "";
        if (res && res.ok) {
            state.objects = res.objects || [];
            render();
        } else {
            setLog(`R2: ${(res && res.error) || "could not list objects"}`, "error");
        }
    }

    async function backupNow() {
        if (!hasCreds() || !settings().r2Bucket) {
            setLog("Add credentials and select a bucket first.", "error");
            return;
        }
        const sources = settings().r2BackupPaths || [];
        const paths = sources.length ? sources : [Saim.state.cwd];
        state.busy = "backup";
        render();
        const res = await Saim.bridge.r2Backup(Object.assign({
            bucket: settings().r2Bucket,
            prefix: settings().r2Prefix || "backups",
            sources: paths
        }, creds()));
        state.busy = "";
        if (res && res.ok) {
            state.lastBackup = res;
            setLog(`Backed up ${res.sources.join(", ")} → ${res.key} (${H.formatBytes(res.size)})`, "ok");
            Saim.toast("Backup saved to R2", "ok");
            await listObjects();
        } else {
            setLog(`Backup failed: ${(res && res.error) || "unknown error"}`, "error");
            Saim.toast("Backup failed", "error");
        }
    }

    async function download(key) {
        const res = await Saim.bridge.r2Presign(Object.assign({ key }, creds()));
        if (res && res.ok) {
            Saim.bridge.openExternal(res.url);
        } else {
            setLog(`Download failed: ${(res && res.error) || "unknown error"}`, "error");
        }
    }

    async function removeObject(key) {
        const ok = await Saim.modal.confirm("Delete backup?", `Remove ${key} from the R2 bucket?`);
        if (!ok) return;
        const res = await Saim.bridge.r2Delete(Object.assign({
            bucket: settings().r2Bucket, key
        }, creds()));
        if (res && res.ok) {
            Saim.toast("Backup deleted", "ok");
            await listObjects();
        } else {
            setLog(`Delete failed: ${(res && res.error) || "unknown error"}`, "error");
        }
    }

    async function addFolder() {
        const dir = await Saim.bridge.openDirectory(Saim.state.cwd);
        if (!dir) return;
        const list = (settings().r2BackupPaths || []).slice();
        if (!list.includes(dir)) list.push(dir);
        persist({ r2BackupPaths: list });
        render();
    }

    /* ------------------------------- render ------------------------------- */

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

    function render() {
        const body = document.getElementById("r2-pane");
        if (!body) return;
        H.clear(body);

        const wrap = H.el("div", "host");

        // Credentials card
        const s = settings();
        const credCard = H.el("div", "gh__card");
        credCard.appendChild(H.el("div", "gh__label", "Cloudflare R2 credentials"));
        credCard.appendChild(field("r2AccountId", "Cloudflare account ID", s.r2AccountId, "text"));
        credCard.appendChild(field("r2AccessKeyId", "R2 access key ID", s.r2AccessKeyId, "text"));
        credCard.appendChild(field("r2SecretKey", "R2 secret access key", s.r2SecretKey, "password"));
        credCard.appendChild(H.el("p", "gh__hint", "Create an R2 API token in the Cloudflare dashboard with Object Read & Write permission."));
        const credRow = H.el("div", "gh__row");
        credRow.appendChild(button(state.busy === "buckets" ? "Loading…" : "List buckets", "gh__btn", listBuckets, state.busy));
        credCard.appendChild(credRow);
        wrap.appendChild(credCard);

        // Bucket card
        const bucketCard = H.el("div", "gh__card");
        bucketCard.appendChild(H.el("div", "gh__label", "Bucket"));
        if (state.buckets.length) {
            const select = H.el("select", "gh__input");
            select.appendChild(option("", "Select bucket…"));
            state.buckets.forEach(b => select.appendChild(option(b.name, b.name)));
            select.value = s.r2Bucket || "";
            select.addEventListener("change", () => {
                persist({ r2Bucket: select.value });
                listObjects();
            });
            bucketCard.appendChild(select);
        } else {
            bucketCard.appendChild(field("r2Bucket", "bucket-name", s.r2Bucket, "text"));
        }
        bucketCard.appendChild(field("r2Prefix", "backups", s.r2Prefix || "backups", "text", { placeholder: "backups" }));
        const createRow = H.el("div", "gh__row");
        const nameInput = H.el("input", "gh__input");
        nameInput.placeholder = "new-bucket-name";
        nameInput.id = "r2-new-bucket";
        createRow.appendChild(nameInput);
        createRow.appendChild(button("Create bucket", "gh__btn", () => {
            const el = document.getElementById("r2-new-bucket");
            createBucket(el ? el.value.trim() : "");
        }, state.busy === "create"));
        bucketCard.appendChild(createRow);
        wrap.appendChild(bucketCard);

        // Backup card
        const backupCard = H.el("div", "gh__card");
        backupCard.appendChild(H.el("div", "gh__label", "Backup projects"));
        const paths = s.r2BackupPaths || [];
        paths.forEach(p => {
            const row = H.el("div", "r2__path");
            row.appendChild(H.el("span", "r2__path-name", p));
            const rm = H.el("button", "minibtn", "✕");
            rm.title = "Remove";
            rm.addEventListener("click", () => {
                persist({ r2BackupPaths: paths.filter(x => x !== p) });
                render();
            });
            row.appendChild(rm);
            backupCard.appendChild(row);
        });
        if (!paths.length) {
            backupCard.appendChild(H.el("p", "gh__hint", "No folders added — the current project folder will be backed up."));
        }
        const backupRow = H.el("div", "gh__row");
        backupRow.appendChild(button("Add folder", "gh__btn", addFolder));
        backupRow.appendChild(button(state.busy === "backup" ? "Backing up…" : "Backup now", "gh__btn gh__btn--primary", backupNow, state.busy));
        backupCard.appendChild(backupRow);
        wrap.appendChild(backupCard);

        // Objects card
        const objCard = H.el("div", "gh__card");
        objCard.appendChild(H.el("div", "gh__label", `Backups in ${s.r2Bucket || "bucket"}`));
        const objRow = H.el("div", "gh__row");
        objRow.appendChild(button("Refresh", "gh__btn", listObjects, state.busy === "objects"));
        objCard.appendChild(objRow);
        if (!state.objects.length) {
            objCard.appendChild(H.el("p", "gh__hint", "No backups yet. Run a backup to see objects here."));
        } else {
            state.objects.forEach(obj => {
                const row = H.el("div", "r2__obj");
                const name = H.el("span", "r2__obj-name", obj.key);
                name.title = obj.key;
                row.appendChild(name);
                row.appendChild(H.el("span", "r2__obj-size", H.formatBytes(obj.size)));
                const dl = H.el("button", "minibtn", "↓");
                dl.title = "Download";
                dl.addEventListener("click", () => download(obj.key));
                row.appendChild(dl);
                const del = H.el("button", "minibtn", "✕");
                del.title = "Delete";
                del.addEventListener("click", () => removeObject(obj.key));
                row.appendChild(del);
                objCard.appendChild(row);
            });
        }
        wrap.appendChild(objCard);

        if (state.log) {
            const out = H.el("pre", `gh__log ${state.logKind === "error" ? "is-error" : ""}`);
            out.textContent = state.log;
            wrap.appendChild(out);
        }

        body.appendChild(wrap);
    }

    function option(value, label) {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = label;
        return opt;
    }

    function init() {
        Saim.bus.on("settings:changed", () => {
            if (Saim.state.view === "r2") render();
        });
    }

    Saim.r2 = { init, render, listBuckets, listObjects, backupNow };
})(window.Saim);
