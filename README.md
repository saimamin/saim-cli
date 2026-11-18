# Saim CLI

**A complete graphical desktop for the command line** — built by transforming the
whole of the [eDEX-UI](https://github.com/GitSquared/edex-ui) terminal application
into a full GUI shell branded *Saim CLI*.

Saim CLI keeps the DNA of eDEX-UI (Electron + xterm.js + node-pty, sci-fi styling,
multi-terminal tabs, filesystem browser) and rebuilds it as a modern, cohesive
desktop application with an **integrated OpenCode panel**.

---

## What is inside

| Area | Description |
|------|-------------|
| **Title bar** | Branded bar with the tab strip, quick actions and window controls. |
| **Explorer** | Full file tree of the workspace, folders expand in place, files open in the built-in editor. |
| **Sessions** | Every terminal tab listed with its running process, killable from the panel. |
| **Bookmarks** | Pin folders and jump to them instantly. |
| **Terminals** | Real PTYs (node-pty) with xterm.js rendering, multi-tab, cwd + process tracking. |
| **Editor** | Lightweight file viewer/editor with save-on-demand. |
| **OpenCode panel** | A full native OpenCode client — chat, sessions, agents, models, commands, MCP servers, plugins, skills and mobile pairing — driven by the OpenCode server API. Falls back to the embedded `opencode` TUI. |
| **Monitor** | Live CPU, memory, network, host and process telemetry. |
| **Command palette** | Fuzzy search over every command *and* over the files of the workspace. |
| **Settings** | A complete GUI for appearance, terminal, integrations and workspace behaviour. |
| **Status bar** | Git branch, working directory, foreground process, OpenCode state, CPU/RAM/NET and clock. |

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+P` | Command palette |
| `Ctrl+Shift+T` | New terminal tab |
| `Ctrl+W` | Close terminal tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous tab |
| `Ctrl+B` | Toggle the sidebar |
| `Ctrl+Shift+O` | Toggle the OpenCode panel |
| `Ctrl+Shift+B` | Toggle the status bar |
| `Ctrl+O` / `Ctrl+Shift+E` | Open file / open folder |

---

## OpenCode integration

Saim CLI talks to the [OpenCode](https://opencode.ai) server the same way the
OpenCode desktop and mobile apps do:

- **Auto-discovery** — finds the shared background service via
  `~/.local/state/opencode/service.json` (basic auth `opencode:<password>`), or
  spawns its own `opencode serve` on a free port if none is running.
- **Native chat** — sessions, prompts, streaming assistant replies, reasoning
  and tool-call parts, rendered in the right dock. `/commands` from your
  OpenCode config run inside the chat.
- **Agents & models** — switch agent (`build`, `plan`, …) and model per session.
- **MCP manager** — list, add (remote/local), connect and disconnect MCP servers
  (`PUT/DELETE /api/experimental/mcp/{server}`).
- **Plugins** — list, add, remove, check and update (`opencode plugin`).
- **Skills & commands** — browse what the server exposes.
- **Mobile pairing** — `Pair` tab generates a code via `POST /api/pair`; open
  `http://<server>/auth/connect/<code>` on the device to connect it (same flow
  as the OpenCode apps).
- **Event stream** — the server's SSE `/api/event` feed keeps sessions, messages
  and permission requests live. Permission requests get Allow once / Always /
  Reject buttons.

Command palette entries: `OpenCode: Open Panel`, `Start`, `Stop`, `Restart`,
`New Chat Session`, `Pair Mobile Device`, `Refresh`, `Toggle Native / Terminal Mode`.

| `Ctrl+S` | Save the current file |
| `Ctrl+,` | Settings |
| `Ctrl+Shift+K` | Clear the terminal |
| `F11` | Fullscreen |

## Running it

```bash
npm install
npm start          # launch the app
npm start -- --dev # launch with the developer tools open
```

### Building a native package

```bash
npm run dist       # produces dist/Saim-CLI-<version>-x86_64.AppImage
npm run pack       # produces an unpacked build in dist/
```

## Project layout

```
src/
  main.js              Electron main process: window, menus, PTYs, filesystem, telemetry
  preload.js           The only bridge between the renderer and the main process
  ui.html              Application shell markup
  assets/css/          Layered stylesheets (base, layout, titlebar, sidebar, …)
  js/core/             bridge, state + event bus, theming
  js/components/       terminals, explorer, sessions, bookmarks, editor,
                       opencode, monitors, dock, statusbar, palette, modal, settings
  js/commands.js       Command registry (palette + native menu + shortcuts)
  js/app.js            Bootstrap and global keyboard handling
tools/make-icons.js    Generates the application icons (PNG + SVG)
media/                 Application icons
```

## Configuration

Settings live in the Electron user-data directory
(`~/.config/Saim CLI/settings.json` on Linux) and are edited from the in-app
settings panel. Bookmarks and the last session are stored next to them in
`state.json`.

## Credits

Originally based on **eDEX-UI** by Gabriel "Squared" SAILLARD (GPL-3.0).
This derivative is released under the MIT licence for the Saim CLI rewrite.
