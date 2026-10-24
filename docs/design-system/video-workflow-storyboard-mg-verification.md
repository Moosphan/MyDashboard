# 分镜 MG 开关与就绪契约验证

日期：2026-10-24。工作树：`/Users/dorck/.codex/worktrees/video-studio-workflow/MyDashboard`，分支 `feature/video_studio_workflow`。

## 原因与范围

生产项目“一天一个GitHub开源项目推荐”的失败任务 `f7c18404-594a-4902-acb9-ad745dccdf8a` 在粗剪规划阶段返回 `requiresUpstream`。分镜 v2 第 1 镜有独立对象，但使用尚未支持的 `scaleX`；其他多镜只有描述性 MG 注释，缺少动作所需独立对象；第 13 镜明确记载投稿封面抓取失败。过去分镜仅验收静态 HTML，没有共同的可执行动效契约。

按用户最新选择，在既有分镜创作设置增加 Motion graphics 动画开关与逐镜排除，没有新增“补齐 MG 元素”入口。沿用 VIDEO-WORKFLOW-001 的 React 18/Radix 局部例外、主题、主栏/审核布局及按钮位置。

## 行为

- `motionPolicy` 以稳定分镜 ID 保存排除列表，随分镜 revision 持久化。未设置的历史项目保持原行为；显式关闭或全部排除时不套用历史动效或默认标题入场。
- 开启后，分镜生成提示词自动要求未排除页创建独立可见对象、解释性 MG、可读停留与最终状态；模板生成也由本地 Agent 执行，无法配置 CLI 时明确报错。采用 HyperFrames Animation / Keyframes 的有限、确定性、可定位原则，保留受限 WAAPI 编译器，不执行 Agent HTML 脚本。
- 每镜 `motion` 保留 summary、归一化 0–1 的 effects 及 blockers。生成、保存和审核使用真实隔离 Electron DOM 校验 selector；开启时缺计划或有 blockers 不允许审核。就绪数量、当前镜的元素与相对时间、缺口在原主栏可查看。
- 粗剪直接将审核过的计划按实测配音时长编译，无需再次要求 AI 理解注释。`scaleX/scaleY` 校验 0–4 并编译为浏览器 CSS `scale: x y`，保持方向缩放与反向定位一致。
- 后续整片动效修改仅覆盖未排除镜头；关闭状态、目标已排除或 Agent 计划含排除镜头时明确报错，不能静默丢弃意见后报告视频更新。相关红/绿灯为 `/tmp/mg-exclusion-edit-red.log`、`/tmp/mg-exclusion-edit-green.log`。
- 不修改生产分镜或媒体，不自动审核、重新配音或生成用户视频。现有旧分镜需在开启开关后正常生成候选并审核；原口播及音频文件保留，可按已有沿用流程关联新分镜。真实网页/封面未取得时仍须如实报告缺口，不承诺自动抓取或用示意图替代。

## 验证

- `pnpm test:video-workflow`：48/48，`/tmp/mg-workflow-final.log`。覆盖方向缩放范围/冲突、计划持久结构、实测时长换算、开关/排除、全排除/关闭无默认动效、审核拦截、旧口播/音频内容和分镜历史保留。旧代码的红灯分别记录于 `/tmp/mg-directional-red.log`、`/tmp/mg-readiness-red.log`、`/tmp/mg-policy-red.log`。
- `pnpm test:voiceover`：30/30，`/tmp/mg-voice-regression.log`。
- `pnpm exec electron scripts/test-storyboard-motion.cjs`：通过。真实模板 → 本地测试 Agent → 内置规则 → 含排除的候选 → 审核；不存在的 selector 使任务失败并保留已审核版本。同时验证实际 DOM、横向缩放不改高度、纵向缩放不改宽度、0/1/2 秒和反向 seek。`/tmp/mg-motion-integration.log`；HTML、隔离 DB 和截图：`/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/storyboard-motion-NCXpvV`。
- `pnpm test:video-workflow:ui`（包含 `pnpm build`）：通过，`/tmp/mg-ui-final.log`。真实 Electron IPC、开关、逐镜排除、保存/重开持久化、取消、Space、焦点返回、明暗主题、1440/1024、200% 缩放及既有流程通过。截图：`/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/video-workflow-ui-G4DSqm/mg-settings-light-1440.png`（同目录有 dark、1024、200percent）。红灯 `/tmp/mg-ui-red.log` 验证原页面没有开关。
- 受影响生产文件 ESLint、Prettier 与 `git diff --check` 通过，日志 `/tmp/mg-lint-final.log`、`/tmp/mg-format-final.log`、`/tmp/mg-diff-check.log`。
- `pnpm design:check`、`pnpm design:build` 通过。它们只验证设计资产；实际生产交互由上述 Electron 测试覆盖。
- `tsc --noEmit -p tsconfig.web.json` 与 `tsc -b --pretty false` 仍被已有仓库错误阻断，包括 MainLayout IPC 清理回调、webview 类型、BaseRepository 泛型和缺失 `@swc/core` 等；本次共享模型、工作流服务及 renderer 文件没有类型诊断。日志 `/tmp/mg-ts-web.log`、`/tmp/mg-ts-all.log`。没有为本功能修改这些无关模块。

本次没有完整渲染用户的 16 镜视频；验证使用隔离素材、测试 Agent 和实际 Electron 动画，不产生生产执行记录或额外模型调用。

应用于 18:17（Asia/Shanghai）从上述正确工作树重启，启动前生产工作流与配音均无运行中任务；日志确认 `window:ready-to-show`。生产项目的分镜、配音和媒体文件未被本次测试改写。

交付复核：`/tmp/mg-workflow-delivery.log` 为 48/48，`/tmp/mg-motion-delivery.log` 实际 Electron 动画与 Agent 集成通过，`/tmp/mg-build-delivery.log` 构建通过，ESLint/格式/差异检查通过。18:20 用户已启动生产分镜任务 `456d89e0-2044-4ce0-a250-0d875cc134b7`，为避免中断未再次重启；最后追加的“排除镜头动效修改防静默忽略”服务端校验在下次重启加载。开关、分镜计划生成与审核校验已在 18:17 启动的应用中可用。
