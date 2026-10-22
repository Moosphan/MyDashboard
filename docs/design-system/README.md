# MyDashboard 设计系统

**当前权威：[设计规范 2.0 · HeroUI edition](spec-v2.md)** · 2026-10-22。适用于后续全部设计、组件、页面、主题和交互开发；生产 UI 按阶段迁移，设计稿交付不代表应用迁移完成。

本版按用户要求命名为“设计规范 2.0”，替代历史自建 v1 / Quiet Workspace v3.2；采纳提案中的“UI v4”是早期工作名，不是并行规范。HeroUI 版本独立固定为 **3.2.6**。

用户修订：沿用当前项目主题，优先保留现有紧凑桌面布局；HeroUI 自带图标优先，缺项补已确认的 Heroicons；不确定业务与布局先确认。逐页状态与待决项见 [交互审核](interaction-audit-v2.md)。

| 入口                                                                     | 用途                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------ |
| [规范 2.0](spec-v2.md)                                                   | 必须遵守的设计、开发与验收规则                               |
| [页面交付规格](page-specs-v2.md)                                         | 7 个主页面、写作编辑器、AI Voiceover、组件工作台的结构与状态 |
| [真实 React 设计稿](v2/README.md)                                        | HeroUI 原生组件、多页面、浅深色、状态预览                    |
| [迁移台账](migration.md)                                                 | 当前状态、技术门槛、例外与退出条件                           |
| [验证记录](verification-v2.md)                                           | 实际结果、截图和验证边界                                     |
| [采纳提案](heroui-adoption-proposal.md) / [一手调研](heroui-research.md) | 版本、许可证、58 类组件映射依据                              |

在仓库根目录运行：

```bash
pnpm --dir docs/design-system/v2 install --frozen-lockfile
pnpm design:preview
pnpm design:check
pnpm design:build
```

设计稿地址：`http://127.0.0.1:3046/`，默认 AI Lab；侧栏切页，顶部评审栏切换主题和状态。设计稿使用内存示例数据，不访问 Electron IPC、个人数据库或外部 AI 服务。构建产物在 `v2/dist/`，通过 HTTP 预览。

历史自建资料：[旧规范](legacy-v3.md)、[旧组件目录](components.md)、[旧 HTML](index.html)、`tokens.json`、`components.json`、`preview*`、`system.generated.js`、`tokens.generated.css`。历史文档不约束新组件；当前生产主题和布局继续作为 2.0 适配依据。`pnpm design:legacy:check` 仅检查历史生成物。
