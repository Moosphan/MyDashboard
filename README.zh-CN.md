<p align="center">
  <img src="./assets/app-logo.svg" alt="MyDashboard" width="128" />
</p>

<h1 align="center">MyDashboard</h1>

<p align="center"><strong>本地优先的桌面生产力工作空间</strong></p>

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

## 项目简介

MyDashboard 是一款基于 Electron 的桌面应用，试图把项目管理、写作、
媒体素材、RSS 阅读、社交洞察和 AI 工具整合进同一个本地优先工作空间。
当前实现以 SQLite 和本地文件存储为基础，默认不依赖云端账户和同步服务。

它目前仍然从作者自己的日常工作流中持续生长，因此产品方向会优先服务真实的
个人使用场景。

## 这个项目解决什么问题

很多个人工作流会分散在多个应用里：任务管理、写作、素材整理、信息订阅、
社交数据查看，以及 AI 工具使用彼此割裂。MyDashboard 想做的是一个统一的
桌面工作台，而不是一组松散的网页标签页。

## 核心能力

### Dashboard

- 聚焦项目、优先级任务和活跃度追踪
- 实时时钟与天气组件
- 全局命令面板（`Cmd+K`）快速搜索

### Writing Studio

- 基于 Tiptap 的富文本编辑
- HTML 源码模式
- 自动保存与本地草稿存储
- 面向博客、Notion、掘金、微信公众号、Medium 的发布辅助

### Video Studio

- 视频封面管理
- 音频素材库
- HTML 演示文稿素材管理

### Insights

- RSS 订阅与文章阅读
- 订阅源预设与定时抓取
- 指定社交平台的数据追踪

### AI Lab

- AI 订阅管理
- AI 工具目录与快速访问
- 内嵌浏览器式工具工作流

## 当前架构

MyDashboard 当前是一个模块化 Electron 应用，内置 6 个功能模块：

- `dashboard`
- `writing`
- `video`
- `insights`
- `ai-lab`
- `settings`

模块启用状态由 [feature.config.ts](./feature.config.ts) 控制。

运行时结构遵循标准 Electron 分层：

- **主进程**：数据库访问、后台服务、IPC 处理器与原生能力
- **Preload 层**：类型化的 `electronAPI` 桥接
- **渲染进程**：基于 React 的工作空间界面

仓库中还包含更大范围的插件化设计说明：
[docs/plugin-architecture.md](./docs/plugin-architecture.md)。这份文档更适合作为
架构规划参考，而不是已经完整上线的运行时插件能力说明。

## 技术栈

| 层级 | 技术 |
|---|---|
| 运行时 | Electron 33, Node.js |
| 前端 | React 18, TypeScript 5.7, React Router 6 |
| 样式 | Tailwind CSS 3.4, Radix UI |
| 状态管理 | Zustand 5 |
| 编辑器 | Tiptap 3, lowlight |
| 数据层 | `better-sqlite3` 驱动的 SQLite |
| 构建 | electron-vite, Vite 6, pnpm |
| 打包 | electron-builder |

## 本地数据存储

应用数据存储在 Electron 的 `userData` 目录下。

- SQLite 数据库：`<userData>/database/dashboard.db`
- 应用初始化的文件目录：
  - `articles`
  - `notes`
  - `drafts`
  - `media/covers`
  - `media/audio`
  - `media/presentations`
  - `exports`
  - `cache`
  - `config`

SQLite 初始化时会启用 WAL 模式和外键约束。

## 快速开始

### 下载 macOS 安装包

打开 `main` 分支最近一次成功的 [Build & Release 构建](https://github.com/Moosphan/MyDashboard/actions/workflows/build.yml)，登录 GitHub 后，在 **Artifacts** 中下载 **macos-build**。压缩包包含 Apple Silicon（`arm64`）与 Intel（`x64`）的 DMG、ZIP 安装包，以及 `SHA256SUMS.txt` 校验文件。产物保留 30 天，也可通过 **Run workflow** 手动构建。这些 CI 安装包未签名、未经过 Apple 公证。

### 环境要求

- Node.js `>= 18`
- pnpm `>= 9`

### 安装

```bash
git clone https://github.com/Moosphan/MyDashboard.git
cd MyDashboard
pnpm install
```

### 开发运行

```bash
pnpm dev
```

### 构建

生成生产构建产物：

```bash
pnpm build
```

生成 Electron Builder 打包产物：

```bash
pnpm dist
```

生成 macOS 分发包：

```bash
pnpm dist:mac
```

当前 `electron-builder.yml` 只配置了 macOS `arm64` 的 `dmg` 和 `zip` 目标。
之前 README 中的 `build:win` 和 `build:linux` 命令已移除，因为
`package.json` 里并没有这些脚本。

由于项目基于 Electron 构建，代码层面并不天然只支持 macOS；只是当前仓库中的
打包配置主要聚焦在 macOS 目标上。

## 项目结构

```text
src/
├── main/        # Electron 主进程、数据库、IPC、后台服务
├── preload/     # 类型化上下文桥接
├── renderer/    # React 应用外壳、功能模块、共享 UI
└── shared/      # 跨进程共享常量与类型
```

补充文件：

- [feature.config.ts](./feature.config.ts)：模块开关配置
- [electron.vite.config.ts](./electron.vite.config.ts)：应用构建配置
- [electron-builder.yml](./electron-builder.yml)：打包配置
- [docs/](./docs/)：设计与架构文档

## 参与贡献

1. Fork 仓库
2. 创建功能分支
3. 提交修改
4. 运行 `pnpm lint` 和 `pnpm typecheck`
5. 发起 Pull Request

## 开源协议

本项目基于 Apache License 2.0 开源，详见 [LICENSE](./LICENSE)。
