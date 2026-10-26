<p align="center">
  <img src="./assets/app-logo.svg" alt="MyDashboard" width="128" />
</p>

<h1 align="center">MyDashboard</h1>

<p align="center"><strong>A local-first desktop productivity workspace</strong></p>

<p align="center">
  <img src="./assets/badges/license.svg" alt="Apache 2.0" />
  <img src="./assets/badges/electron.svg" alt="Electron 33" />
  <img src="./assets/badges/react.svg" alt="React 18" />
  <img src="./assets/badges/typescript.svg" alt="TypeScript 5.7" />
  <img src="./assets/badges/pnpm.svg" alt="pnpm 9" />
  <img src="./assets/badges/status.svg" alt="Developing" />
</p>

<p align="center">
  <a href="./README.md">English</a> |
  <a href="./README.zh-CN.md">中文</a>
</p>

---

## Overview

MyDashboard is an Electron desktop app that brings projects, writing, media
assets, RSS reading, social insights, and AI tooling into one local-first
workspace. The app stores data on your machine with SQLite and file-based
storage, so you can work without cloud accounts or external sync as a baseline.

It is currently evolving from the author's own day-to-day workspace, which
means the product direction is shaped by real personal workflows first.

## Product Screenshots

<table>
  <tr>
    <td width="50%" align="center">
      <img src="./docs/screenshots/dashboard-macos.png" alt="MyDashboard dashboard on macOS" width="100%" />
      <br />
      <sub>Dashboard</sub>
    </td>
    <td width="50%" align="center">
      <img src="./docs/screenshots/writing-macos.png" alt="MyDashboard Writing Studio on macOS" width="100%" />
      <br />
      <sub>Writing Studio</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="./docs/screenshots/insights-macos.png" alt="MyDashboard Insights on macOS" width="100%" />
      <br />
      <sub>Insights</sub>
    </td>
    <td width="50%" align="center">
      <img src="./docs/screenshots/ai-lab-macos.png" alt="MyDashboard AI Lab on macOS" width="100%" />
      <br />
      <sub>AI Lab</sub>
    </td>
  </tr>
</table>

## Why This Project Exists

Many personal workflows are split across separate apps for task tracking,
writing, reference collection, media management, feed reading, and AI tools.
MyDashboard aims to make those workflows feel like one coherent desktop
workspace instead of a loose collection of tabs and services.

## Key Capabilities

### Dashboard

- Focus projects, priority tasks, and activity tracking in one home view
- Live clock and weather widgets
- Quick search via a global command palette (`Cmd+K`)

### Writing Studio

- Rich-text editing powered by Tiptap
- Source mode for raw HTML editing
- Auto-save and local draft storage
- Multi-target publishing helpers for blog, Notion, Juejin, WeChat, and Medium

### Video Studio

- Video cover management
- Audio asset library
- HTML presentation asset management

### Insights

- RSS subscriptions and article reading
- Feed presets and periodic background refresh
- Social metrics tracking for selected platforms

### AI Lab

- AI subscription tracking
- AI tool directory and quick access
- Embedded browser-based tool workflow

## Current Architecture

MyDashboard currently ships as a modular Electron app with six built-in
feature modules:

- `dashboard`
- `writing`
- `video`
- `insights`
- `ai-lab`
- `settings`

Feature enablement is controlled through
[feature.config.ts](./feature.config.ts).

At runtime, the app follows a standard Electron split:

- **Main process** for database access, background services, IPC handlers, and
  native integrations
- **Preload layer** for the typed `electronAPI` bridge
- **Renderer** for the React-based workspace UI

The codebase also includes design and architecture notes for a broader plugin
system in [docs/plugin-architecture.md](./docs/plugin-architecture.md). That
document is best read as a forward-looking design reference rather than a
complete statement of already-shipped runtime plugin behavior.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Electron 33, Node.js |
| Frontend | React 18, TypeScript 5.7, React Router 6 |
| Styling | Tailwind CSS 3.4, Radix UI |
| State | Zustand 5 |
| Editor | Tiptap 3, lowlight |
| Data | SQLite via `better-sqlite3` |
| Build | electron-vite, Vite 6, pnpm |
| Packaging | electron-builder |

## Local Data Model

The app stores data locally under Electron's `userData` directory.

- SQLite database: `<userData>/database/dashboard.db`
- File storage directories initialized by the app:
  - `articles`
  - `notes`
  - `drafts`
  - `media/covers`
  - `media/audio`
  - `media/presentations`
  - `exports`
  - `cache`
  - `config`

SQLite is initialized with WAL mode and foreign-key support enabled.

## Getting Started

### Prerequisites

- Node.js `>= 18`
- pnpm `>= 9`

### Install

```bash
git clone https://github.com/Moosphan/MyDashboard.git
cd MyDashboard
pnpm install
```

### Run In Development

```bash
pnpm dev
```

Renderer changes update through HMR. After changing main-process or preload code, save active drafts and restart Electron to load the new backend. For a launchd development session, run `pnpm dev:launchd` again to stop the old instance and start a fresh one.

### Build

Create production bundles:

```bash
pnpm build
```

Create packaged desktop artifacts with Electron Builder:

```bash
pnpm dist
```

Create macOS distribution artifacts:

```bash
pnpm dist:mac
```

The current `electron-builder.yml` is configured for macOS `arm64` targets
(`dmg` and `zip`). The existing README's previous `build:win` and `build:linux`
commands were removed because those scripts do not exist in `package.json`.

Because the app is built with Electron, the codebase itself is not inherently
macOS-only. However, the current packaging configuration in this repository is
focused on macOS targets.

## Project Structure

```text
src/
├── main/        # Electron main process, database, IPC, background services
├── preload/     # Typed context bridge
├── renderer/    # React application shell, modules, shared UI
└── shared/      # Cross-process constants and types
```

Supporting project files:

- [feature.config.ts](./feature.config.ts) for module toggles
- [electron.vite.config.ts](./electron.vite.config.ts) for app build config
- [electron-builder.yml](./electron-builder.yml) for packaging config
- [docs/](./docs/) for design and architecture notes

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `pnpm lint` and `pnpm typecheck`
5. Open a pull request

## License

Apache License 2.0. See [LICENSE](./LICENSE).
