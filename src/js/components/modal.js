/**
 * Saim CLI - modal dialogs
 */
window.Saim = window.Saim || {};

(function (Saim) {
    "use strict";

    const H = Saim.helpers;
    let overlay = null;
    let root = null;
    let onClose = null;

    function open(options) {
        options = options || {};
        overlay = overlay || document.getElementById("modal-overlay");
        root = document.getElementById("modal");

        H.clear(root);
        root.className = `modal${options.size === "sm" ? " modal--sm" : ""}`;

        const head = H.el("div", "modal__head");
        const titles = H.el("div");
        titles.appendChild(H.el("div", "modal__title", options.title || "Saim CLI"));
        if (options.subtitle) titles.appendChild(H.el("div", "modal__sub", options.subtitle));
        head.appendChild(titles);

        const closeBtn = H.el("button", "iconbtn", "✕");
        closeBtn.addEventListener("click", () => close());
        head.appendChild(closeBtn);
        root.appendChild(head);

        const body = H.el("div", "modal__body");
        root.appendChild(body);
        if (typeof options.body === "function") options.body(body);
        else if (options.body) body.appendChild(options.body);

        if (options.actions && options.actions.length) {
            const foot = H.el("div", "modal__foot");
            options.actions.forEach(action => {
                const btn = H.el("button", action.kind === "primary" ? "primarybtn" : "ghostbtn", action.label);
                btn.addEventListener("click", () => {
                    const result = action.onClick ? action.onClick(body) : undefined;
                    if (result !== false && action.keepOpen !== true) close();
                });
                foot.appendChild(btn);
            });
            root.appendChild(foot);
        }

        overlay.hidden = false;
        onClose = options.onClose || null;
        overlay.onclick = event => {
            if (event.target === overlay && options.dismissable !== false) close();
        };
    }

    function close() {
        if (!overlay) return;
        overlay.hidden = true;
        if (onClose) {
            const cb = onClose;
            onClose = null;
            cb();
        }
    }

    function isOpen() {
        return overlay && !overlay.hidden;
    }

    function confirm(message, detail) {
        return new Promise(resolve => {
            let answered = false;
            open({
                title: "Please confirm",
                size: "sm",
                body: (body) => {
                    body.appendChild(H.el("p", null, message));
                    if (detail) body.appendChild(H.el("p", "setting__desc", detail));
                },
                actions: [
                    { label: "Cancel", onClick: () => { answered = true; resolve(false); } },
                    { label: "Confirm", kind: "primary", onClick: () => { answered = true; resolve(true); } }
                ],
                onClose: () => { if (!answered) resolve(false); }
            });
        });
    }

    function prompt(message, defaultValue) {
        return new Promise(resolve => {
            let answered = false;
            let field;
            open({
                title: "Saim CLI",
                size: "sm",
                body: (body) => {
                    body.appendChild(H.el("p", null, message));
                    field = H.el("input", "field");
                    field.style.width = "100%";
                    field.style.marginTop = "10px";
                    field.value = defaultValue || "";
                    body.appendChild(field);
                    setTimeout(() => field.focus(), 40);
                    field.addEventListener("keydown", event => {
                        if (event.key === "Enter") {
                            answered = true;
                            resolve(field.value);
                            close();
                        }
                    });
                },
                actions: [
                    { label: "Cancel", onClick: () => { answered = true; resolve(null); } },
                    { label: "OK", kind: "primary", onClick: () => { answered = true; resolve(field.value); } }
                ],
                onClose: () => { if (!answered) resolve(null); }
            });
        });
    }

    function init() {
        overlay = document.getElementById("modal-overlay");
        root = document.getElementById("modal");
    }

    /**
     * Lightweight context menu rendered at the pointer position.
     * items: [{ label, icon, action, danger }]
     */
    function contextMenu(items, x, y) {
        const existing = document.getElementById("context-menu");
        if (existing) existing.remove();

        const menu = H.el("div", "contextmenu");
        menu.id = "context-menu";
        items.forEach(item => {
            if (item.separator) {
                menu.appendChild(H.el("div", "contextmenu__sep"));
                return;
            }
            const node = H.el("div", "contextmenu__item");
            node.appendChild(H.el("span", "contextmenu__icon", item.icon || "›"));
            node.appendChild(H.el("span", null, item.label));
            if (item.danger) node.classList.add("is-danger");
            node.addEventListener("click", () => {
                menu.remove();
                if (item.action) item.action();
            });
            menu.appendChild(node);
        });

        document.body.appendChild(menu);
        const rect = menu.getBoundingClientRect();
        const left = Math.min(x, window.innerWidth - rect.width - 8);
        const top = Math.min(y, window.innerHeight - rect.height - 8);
        menu.style.left = `${Math.max(4, left)}px`;
        menu.style.top = `${Math.max(4, top)}px`;

        const dismiss = () => {
            menu.remove();
            document.removeEventListener("click", dismiss, true);
        };
        setTimeout(() => document.addEventListener("click", dismiss, true), 0);
    }

    Saim.modal = { init, open, close, isOpen, confirm, prompt, contextMenu };
})(window.Saim);
