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

The existing workflow supports **HyperFrames** and **Remotion** rendering. Select **合成引擎** in the roughcut stage; the choice is remembered per project. Confirmed motion edits use the selected engine, and final rendering and background music use the engine recorded in the approved roughcut. Switching engines creates a new roughcut for review; existing videos and source revisions remain available. Old projects default to HyperFrames.

New Remotion roughcuts ask the selected Agent to author native React visual modules (`visuals.tsx`, `scene-N.tsx`, and optional helper components). Approved storyboard content, visual direction, original embedded assets and measured narration timing guide the film; HTML layouts and bounded WAAPI effects no longer constrain native visuals. Camera moves, cuts within a scene, SVG/Canvas graphics and frame-driven animation are authored in source. Browser dependencies installed alongside the configured Remotion runtime are detected and pinned; missing dependencies or assets are reported instead of silently substituting a simpler film. The host preserves narration, captions, explicit MG exclusions and total duration. Natural-language edits still produce a plan for confirmation, and single-scene edits preserve other source modules. Final rendering reuses frozen source without calling the Agent. Legacy HTML-backed projects remain renderable. Exported projects include source, assets, `package.json` and Studio/render commands. Generated code is validated for syntax, imports and file paths; these checks are not an OS security sandbox.

Install the optional Remotion CLI separately from Electron. On macOS:

```sh
npm install --prefix "$HOME/Library/Application Support/my-dashboard/tools/remotion" --save-exact @remotion/cli@4.0.541 react@18.3.1 react-dom@18.3.1
```

This location is detected automatically. Alternatively, configure an existing `@remotion/cli/remotion-cli.js` in **执行环境**, together with Node.js, FFmpeg and FFprobe. Chrome / Chromium can be selected explicitly; leaving the browser field empty lets Remotion obtain its own browser on first use. Remotion does not require HyperFrames to be installed. The CLI runs with one rendering worker to limit background memory pressure. Remotion has its own [license](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md); it is not covered by MyDashboard's license.

Regression commands: `pnpm test:video-workflow`, `pnpm test:remotion:native`, `pnpm test:remotion:ui`, and `WORKFLOW_REMOTION_PATH=/absolute/path/to/remotion-cli.js pnpm test:remotion:render` / `pnpm test:remotion:native:render`. The render commands produce synthetic horizontal and vertical videos using the local CLI and browser.

Visual-template storyboard planning recognizes Markdown headings (levels 1–6), keeps their context across paragraphs, and accepts plain text without headings. Display titles stay within 32 Unicode characters; long headings remain intact in scene bodies. Paragraphs split into scenes of up to 90 characters without dropping text, with a maximum of 60 scenes. Generated storyboards still require review.

Video workflow generation supports **Codex CLI**, **Claude Code CLI**, and the official **[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)** (`dsh`). Choose **本地执行器** in a workflow stage or the motion modification panel. The choice is remembered on this computer, shared between stages, and used by AI copy, storyboards, narration scripts, motion plans, code covers, and publishing metadata. Existing rendering, voice synthesis, review, and publishing engines continue to handle their own work. Failed tasks preserve previous versions; switching providers is explicit and never triggers an automatic retry.

To use DeepSeek, install the official `@deepseek-ai/dsh` with Node.js **24.9+** (`npm install -g @deepseek-ai/dsh@0.2.1-rc.5`, the verified release), then set the executable in **执行环境 → DeepSeek Harness** if it is not discovered. On Windows, use the package's absolute `lib/bin.js` path and a compatible Node executable rather than an npm `.cmd` shim. The integration runs `dsh --profile headless --patch … --json -`, sends prompts through stdin, disables tools, and accepts only a successfully completed final result. Harness manages the model and credentials: headless reads `DEEPSEEK_API_KEY` from its startup environment or its home `.env` (default `~/.dsh/.env`; follow the installed Harness documentation), and does not automatically reuse a browser login. The app does not collect API keys. **保存并检测** checks CLI startup/version, not API authentication, balance, or model availability. Other Harness versions may change the developer-preview protocol and need revalidation.

When a generation request names `chinese-ink-elements`, the host loads its installed `SKILL.md` and painting references into the prompt for all three agents. It searches skills under `CODEX_HOME` (default `~/.codex`), `~/.agents`, and `~/.claude`; missing or incomplete references produce an error instead of silently falling back. Full storyboard regeneration requests new compositions while preserving facts, scene order, IDs, and the requested series style. These instructions do not replace visual review or guarantee illustration quality.

Regression checks: `pnpm test:video-workflow`, and `pnpm build && pnpm exec electron scripts/test-deepseek-workflow-ui.cjs`. The Electron fixture uses a temporary profile and synthetic CLI, blocks provider network traffic, and exercises settings, keyboard switching, persisted selection, real workflow IPC, success/failure preservation, themes, viewports, and zoom without using account credentials.

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

### Download internal installers

Open [Releases](https://github.com/Moosphan/MyDashboard/releases) while signed in with repository write access, then open the draft named **MyDashboard CI #…** for the desired build. Every main-branch push or manual main build creates a draft and uploads successful macOS, Windows and Linux installer packages with platform SHA-256 checksums. macOS includes Apple Silicon (`arm64`) and Intel (`x64`) DMG/ZIP files. CI never publishes the draft; failed platforms may leave a partial draft, so check the linked build status.

Draft releases and their files are visible only to collaborators with write access. Source code and Actions logs remain public; future installers are not uploaded to Actions Artifacts. Previously uploaded artifacts retain their original visibility until they expire or are deleted. These CI builds are unsigned; macOS packages are not notarized by Apple.

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

### Daily Local Use

```bash
pnpm daily:build
pnpm daily:start
pnpm daily:stop
pnpm daily:restart
```

Daily mode loads production files directly without a Vite server. Build again after source or runtime-resource changes; start refuses stale output. Each successful build activates a separate version under the ignored `.daily-runtime/` directory, and a failed build keeps the previous release. Restart uses the latest successful build; it does not build automatically. Earlier release directories remain available while processes may use them.

The launcher controls only this checkout through an authenticated local socket, preserving running tasks on other applications/checkouts. On macOS it retires a legacy launchd development service only when its recorded checkout matches. If another development or installed instance owns the same user profile, close it normally before starting daily mode; the app's single-instance lock prevents duplicate databases and publishing schedulers. Save active work before stopping. Existing local drafts persist; schedules missed while stopped remain missed and require rescheduling. A command interrupted during a build can leave `.daily-runtime/operation.lock`; remove that lock only after confirming no daily command is active.

`pnpm dev` remains the HMR development entry. Daily mode is an uninstalled local build; use the collaborator-only draft Release installers described above for installed use. Daily commands do not publish releases or videos.

Reproduce the isolated comparison with `node scripts/benchmark-daily-runtime.cjs` after a daily build. A synthetic empty-profile run (Electron 33, three samples per mode, median; later development samples share Vite cache) measured built/development startup at 703.8/561.9 ms, first Video navigation at 43.8/145.7 ms, warm navigation at 16.2/20.6 ms, and lightweight IPC P95 at 0.6/0.5 ms. Main-process idle CPU over 500 ms was 21.5/9.0 ms and RSS 126.8/128.3 MiB; these exclude renderer memory and are environment-dependent, not a guaranteed speed ratio. This comparison tests production versus development renderer loading using the same main bundle and synthetic data.

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
