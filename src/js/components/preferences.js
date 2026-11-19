/**
 * Saim CLI - Preferences page
 * ---------------------------------------------------------------------------
 * OpenCode-style settings page: secondary nav on the left, general behaviour
 * card on the right. Values persist through the normal settings bridge.
 */
window.Saim = window.Saim || {};

(function (Saim) {
    "use strict";

    const DEFAULTS = {
        interfaceLayout: "inbox",
        language: "en",
        defaultEnvironment: "last",
        autoAcceptPermissions: false,
        showAgent: true,
        followUpBehavior: "queue",
        showStatusbar: false
    };

    function settings() {
        if (!Saim.state.settings) Saim.state.settings = {};
        return Saim.state.settings;
    }

    function value(key) {
        const current = settings()[key];
        return current === undefined || current === null ? DEFAULTS[key] : current;
    }

    function persist(patch) {
        Object.assign(settings(), patch);
        if (Saim.bridge && Saim.bridge.saveSettings) Saim.bridge.saveSettings(patch);
    }

    function setToggle(el, on) {
        if (!el) return;
        el.setAttribute("aria-checked", on ? "true" : "false");
    }

    function sync() {
        const picker = document.getElementById("layout-picker");
        if (picker) {
            const layout = value("interfaceLayout");
            picker.querySelectorAll(".layoutopt").forEach(btn => {
                btn.classList.toggle("is-active", btn.dataset.layout === layout);
            });
        }

        const language = document.getElementById("pref-language");
        if (language) language.value = value("language");

        const environment = document.getElementById("pref-environment");
        if (environment) environment.value = value("defaultEnvironment");

        const followUp = document.getElementById("pref-followup");
        if (followUp) followUp.value = value("followUpBehavior");

        setToggle(document.getElementById("pref-autoaccept"), Boolean(value("autoAcceptPermissions")));
        setToggle(document.getElementById("pref-showagent"), Boolean(value("showAgent")));
        setToggle(document.getElementById("pref-statusbar"), settings().showStatusbar === true);
    }

    function init() {
        const picker = document.getElementById("layout-picker");
        if (picker) {
            picker.querySelectorAll(".layoutopt").forEach(btn => {
                btn.addEventListener("click", () => {
                    const layout = btn.dataset.layout;
                    persist({ interfaceLayout: layout });
                    picker.querySelectorAll(".layoutopt").forEach(item => {
                        item.classList.toggle("is-active", item === btn);
                    });
                });
            });
        }

        const language = document.getElementById("pref-language");
        if (language) language.addEventListener("change", () => persist({ language: language.value }));

        const environment = document.getElementById("pref-environment");
        if (environment) environment.addEventListener("change", () => persist({ defaultEnvironment: environment.value }));

        const followUp = document.getElementById("pref-followup");
        if (followUp) followUp.addEventListener("change", () => persist({ followUpBehavior: followUp.value }));

        const autoAccept = document.getElementById("pref-autoaccept");
        if (autoAccept) {
            autoAccept.addEventListener("click", () => {
                const next = autoAccept.getAttribute("aria-checked") !== "true";
                setToggle(autoAccept, next);
                persist({ autoAcceptPermissions: next });
            });
        }

        const showAgent = document.getElementById("pref-showagent");
        if (showAgent) {
            showAgent.addEventListener("click", () => {
                const next = showAgent.getAttribute("aria-checked") !== "true";
                setToggle(showAgent, next);
                persist({ showAgent: next });
            });
        }

        const statusbar = document.getElementById("pref-statusbar");
        if (statusbar) {
            statusbar.addEventListener("click", () => {
                const next = statusbar.getAttribute("aria-checked") !== "true";
                setToggle(statusbar, next);
                persist({ showStatusbar: next });
                Saim.app.setStatusbar(next);
            });
        }

        const themeBtn = document.getElementById("pref-open-theme");
        if (themeBtn) themeBtn.addEventListener("click", () => Saim.settings.open("appearance"));
        const appearanceRow = document.getElementById("pref-appearance-row");
        if (appearanceRow) appearanceRow.addEventListener("click", () => Saim.settings.open("appearance"));
        const aboutRow = document.getElementById("pref-about-row");
        if (aboutRow) aboutRow.addEventListener("click", () => Saim.commands.run("help:about"));

        const avatar = document.getElementById("sb-avatar");
        if (avatar) avatar.addEventListener("click", () => Saim.nav.go("preferences"));
        const spSettings = document.getElementById("sp-settings");
        if (spSettings) spSettings.addEventListener("click", () => Saim.nav.go("preferences"));
        const signOut = document.getElementById("sp-signout");
        if (signOut) signOut.addEventListener("click", async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            location.href = "/login";
        });

        const prefsSearch = document.querySelector(".prefs__search input");
        if (prefsSearch) {
            prefsSearch.addEventListener("input", () => {
                const needle = prefsSearch.value.trim().toLowerCase();
                document.querySelectorAll(".prefs__item").forEach(item => {
                    item.hidden = Boolean(needle) && !item.textContent.toLowerCase().includes(needle);
                });
            });
        }

        Saim.bus.on("settings:changed", () => sync());
        sync();
    }

    Saim.prefs = { init, sync };
})(window.Saim);
