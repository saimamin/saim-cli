# Saim CLI

**A complete graphical desktop for your command line.** Saim CLI is an Electron +
xterm.js desktop app with an integrated AI assistant, a real multi-tab terminal,
a file explorer/editor, a diff Review pane, a built-in Browser, and first-class
**GitHub** and **Vercel/Netlify hosting** (including domain and DNS management).

The interface uses a dark, OpenCode-inspired layout: a session sidebar on the
left, a centered session/workspace stage, and a right-hand action panel with
keyboard shortcuts. A browser preview of the same UI runs at
`http://localhost:3000` with `tools/preview-server.js`.

> Repository: https://github.com/saimamin/saim-cli

---

## What is inside

| Area | Description |
|------|-------------|
| **Session sidebar** | Home · Search sessions · New session · Recent sessions · Working. Tool shortcuts for Files, GitHub and Hosting. |
| **Home** | Search sessions, Projects, Today (recent sessions) and **Recent development** (real git log of the working folder). |
| **Session** | AI chat with breadcrumb + token count, agent/model selectors, composer, permission requests, tools and streaming replies. |
| **Workspace** | Four views: **Open file** (explorer + editor), **Terminal** (real PTYs via node-pty), **Review** (git status + colorized diff), **Browser** (iframe with URL bar and quick links). |
| **Action panel** | Large action rows with shortcuts: Review (`Ctrl+Alt+R`), Browser (`Ctrl+Alt+B`), Open file (`Ctrl+Alt+P`), Terminal (`Ctrl+Alt+T`), plus New session, Preferences, GitHub and Hosting. |
| **GitHub** | Personal-access-token auth; fetch, pull, push; incoming/recent commits; local git status and error log. |
| **Hosting** | Vercel + Netlify: token or deploy hook, project/site picker, deploy + result link, and a **Domains & DNS** card listing domains, DNS status and DNS records. |
| **Preferences** | Interface layout (Top tabs / Side tabs / Inbox), language, default environment, auto-accept permissions, show agent, follow-up behavior, theme and status bar. |
| **Command palette** | Fuzzy search over every command and over workspace files. |
| **Status bar** | Optional git branch, working directory, foreground process, assistant state, CPU/RAM/NET and clock. |

All data shown is **real** — git log, sessions, deployments and DNS records come
from local git, the assistant server, and the Vercel/Netlify APIs. There is no
mock/fake data.

---

## Requirements

- **Node.js 18+** and npm
- **Electron** (installed as a dev dependency)
- Linux (AppImage build); node-pty needs a C++ toolchain (`build-essential`,
  Python 3) for `electron-rebuild`
- Optional: an [OpenCode](https://opencode.ai) server for the AI chat (auto-discovered)

## Running it

```bash
npm install
npm start            # launch the Electron app
npm start -- --dev   # launch with developer tools open
```

### Browser preview (no Electron)

The preview server serves the same UI over HTTP and maps the bridge to local
git/hosting/terminal operations:

```bash
node tools/preview-server.js
# open http://localhost:3000/src/ui.html
```

Preview settings and tokens are stored in
`~/.config/saim-cli/preview-settings.json` (gitignored — never commit tokens).

---

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Alt+R` | Review (git diff) |
| `Ctrl+Alt+B` | Browser |
| `Ctrl+Alt+P` | Open file |
| `Ctrl+Alt+T` | Terminal |
| `Ctrl+Alt+N` | New session |
| `Ctrl+Alt+S` | Preferences |
| `Ctrl+B` | Toggle the session sidebar |
| `Ctrl+Shift+P` | Command palette |
| `Ctrl+Shift+T` / `Ctrl+W` | New / close terminal tab |
| `Ctrl+Tab` | Next terminal tab |
| `Ctrl+O` / `Ctrl+Shift+E` | Open file / open folder |
| `Ctrl+S` | Save the current file |
| `Ctrl+,` | Settings modal |
| `F11` | Fullscreen |

---

## Building

### Desktop AppImage

```bash
npm run dist    # dist/Saim-CLI-<version>-x86_64.AppImage
npm run pack    # unpacked build in dist/
```

### Android companion APK

`android/` contains a lightweight WebView companion that loads
`android/assets/index.html` (the mobile UI). Build it without Gradle using the
bundled Android tools at `~/Projects/android-tools/`:

```bash
bash android/build-apk.sh
# produces android/SaimCLI.apk (signed)
```

The script uses `aapt2 → javac → d8 → zip → zipalign → apksigner` and targets
the newest Android SDK installed locally (currently SDK 36 / Android 16; SDK 37
/ Android 17 requires downloading that platform).

**APK keystore / signing (important):**

- The reusable signing key lives at `android/saim.keystore` and is **gitignored**
  (private keys must never be committed).
- On a fresh checkout the build script generates a new self-signed keystore
  automatically (store/keep passwords: `saimcli`). Keep this file safe: **losing
  it means you cannot sign updates with the same identity**, and Android will
  treat a re-signed APK as a different app.
- To use your own release key, replace `android/saim.keystore` and update the
  keystore alias/passwords in `android/build-apk.sh`.
- Verify the APK with:
  ```bash
  ~/Projects/android-tools/android-16/aapt2 dump badging android/SaimCLI.apk
  ```

---

## Project layout

```
src/
  main.js                 Electron main process (window, menus, PTYs, IPC, filesystem)
  preload.js              Renderer <-> main bridge
  ui.html                 Application shell markup
  assets/css/             Layered stylesheets (base, layout, sidebar, workspace, opencode-look, …)
  assets/fonts/           Bundled fonts
  js/core/                bridge, state + event bus, theming
  js/components/          session/home, preferences, terminals, explorer, editor,
                          workspace, github, hosting, assistant, monitors, dock,
                          statusbar, palette, modal, settings
  js/commands.js          Command registry (palette + native menu + shortcuts)
  js/app.js               Bootstrap, navigation and global keyboard handling
  lib/devops.js           Shared git + hosting backend (preview and Electron)
tools/
  preview-server.js       HTTP preview server + REST routes
  preview-shim.js         Browser bridge implementation
android/
  SaimCLI.apk             Signed companion APK (committed)
  build-apk.sh            Reproducible APK build script
  saim.keystore           Signing key (gitignored — generate/restore locally)
  assets/index.html       Mobile WebView UI
media/                    Application icons
```

## Configuration

- **Electron**: `~/.config/Saim CLI/settings.json` and `state.json`.
- **Preview**: `~/.config/saim-cli/preview-settings.json`.
- Both are edited from the in-app settings/preferences UI. GitHub/Vercel/Netlify
  tokens are stored locally in these files (plain text) — never commit them.

## Credits & licence

Originally based on **eDEX-UI** by Gabriel "Squared" SAILLARD (GPL-3.0).
This derivative is released under the MIT licence for the Saim CLI rewrite.
