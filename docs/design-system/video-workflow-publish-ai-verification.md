# 发布资料 AI 生成验收

日期：2026-10-23；分支：`feature/video_studio_workflow`。

## 功能与交互

发布页保持平台选择、共用成片、当前平台资料顺序。在资料标题右侧提供 AI 生成/重新生成入口，折叠区可填写标题方向、简介风格、标签受众及有来源和日期的热点背景；Bilibili 与抖音的要求在当前页面分别保留。沿用现有组件和主题，不引入 HeroUI 或新依赖。

本地 Codex / Claude Code 结合已审核简报、文案、分镜文字及口播创作。Bilibili 标题最多 80 字符，抖音最多 30 字符；简介最多 2000 字符，标签最多 10 个、每个最多 30 字符。提示词要求内容一致、避免夸大及编造热度；当前没有自动抓取实时热搜，未承诺热点的实时性。

每次仅替换当前平台资料，另一平台保持原值。成功保存为待审核新版本，历史可通过原有版本入口查看；失败/取消保留原版本。未保存修改时先保存或放弃；执行中禁止重复生成与编辑资料/切换平台，右栏显示真实阶段、不定进度与取消入口。成功后仍可人工编辑，审核通过才允许导出发布包，不自动上传。导出创作任务包含完整 `result.example.json`，便于本地执行后人工导入完整双平台资料。

## 验证

- 先补真实 SQLite 与 CLI 子进程测试，旧实现因“未知生成任务”失败；实现后工作流测试 28/28 通过。覆盖前置审核门禁、真实上下文与修改要求、双平台各自生成及隔离、多次生成和历史、超限结果失败保留、非法平台/要求、任务导出结构。
- `pnpm build`、受影响 TS/TSX 的 ESLint、`pnpm design:check` 与 `pnpm design:build` 通过。
- 真实 Electron 回归通过：原始发布页缺少入口的断言先失败；新增入口后验证 Space 键触发、未保存修改保护、处理时锁定与日志、结果回填、双平台隔离、连续生成、超限失败后保留原值、重试及主动取消。明暗 1440px、1024px、200% 缩放无横向溢出，生成按钮可获得键盘焦点。测试驱动曾有 IPC 响应解包、CSS 选择器字符串及 macOS 窗口焦点时序错误，修正测试后完整通过；未为此修改生产键盘行为。
- `tsc -b` 与 `tsc --noEmit -p tsconfig.web.json` 仍有既存错误；完整构建的诊断去除行列号后，与本轮前的基线相同（66 项），受影响工作流无新增错误。
- CLI 执行器使用隔离测试程序，没有消费用户模型额度；未验证模型实际创作质量、热点判断与营销效果，内容仍由用户审核。
- 确认生产视频/配音任务均无执行中记录后重启开发应用；`2026-10-23T14:47:18.676Z` 到达 `window:ready-to-show`，renderer HTTP 200。未修改生产项目和模型配置。

日志：`/tmp/workflow-publish-red.log`、`/tmp/workflow-publish-tests-final.log`、`/tmp/workflow-publish-ui-final.log`、`/tmp/workflow-publish-types.log`、`/tmp/workflow-publish-web-types.log`、`/tmp/workflow-publish-build.log`、`/tmp/workflow-publish-design-check.log`、`/tmp/workflow-publish-design-build.log`。

截图：[浅色](video-workflow-production/publish-ai-review-light-1440.png) · [生成后待审核](video-workflow-production/publish-ai-review-dark-1440.png) · [执行中](video-workflow-production/publish-ai-running-dark-1440.png) · [1024px](video-workflow-production/publish-ai-review-dark-1024.png) · [200%](video-workflow-production/publish-ai-review-dark-zoom200.png)。截图均为隔离测试项目，无生产项目数据改写。
