# 内容文案 AI 生成与修改验证

日期：2026-10-24（Asia/Shanghai）。分支：`feature/video_studio_workflow`。

## 范围与交互

- 用户截图中的右栏底部“重新生成”移动为文案主卡片标题旁的主操作，初稿/后续版本分别显示“AI 生成文案 / AI 重新生成文案”。右侧保留执行器、执行记录和人工导入/导出，主操作只有一处。
- 文案上方常驻可选创作要求/修改建议（5000 字符以内），生成提示词结合已审核简报、当前已保存文案与建议，返回完整文案。
- 未保存修改需先保存或放弃；运行时锁定文案和建议，按钮显示加载，执行记录提供真实阶段、不定进度和取消；失败/取消保留文案与建议。
- 成功进入待审核状态、保留历史；改写已审核文案会使下游版本失效，不自动审核、配音或合成。

## 验证结果

- `pnpm test:video-workflow`：29/29；新增回归先因修改建议未传入提示词失败，实现后通过。覆盖门禁、首稿、改写、输入类型/超限、历史、下游失效、导出一致性、失败/取消保留。
- `pnpm exec electron scripts/test-video-workflow-ui.cjs`（带既有 smoke seed，独立临时用户目录）：通过。新增 UI 回归先因主卡片无入口失败，实现后通过；真实 IPC、SQLite、本地 CLI 子进程，使用确定性测试 CLI，不调用付费模型、不修改生产数据/配置。
- Electron 实测：键盘 Space 生成；生成中两个文本框锁定、按钮禁用、进度可见；结果进入编辑框并待审核；未保存保护、放弃恢复、修改建议进入提示词、第二版、失败重试和取消；原文与建议保留。既有分镜、口播、配音、动效、成片及发布回归继续通过。
- 明暗主题均检查 1440/1024 和 200% 缩放，主按钮可聚焦、可达，无页面横向溢出；窄视口按钮在标题下换行。保留审核分栏与底部下一步。
- `pnpm build`、受影响 TypeScript 文件 ESLint、CommonJS runner ESLint（沿用 Node globals / require）、`pnpm design:check`、`pnpm design:build` 通过。
- `pnpm exec tsc -b --pretty false` 和 web 类型检查仍有既有错误。全量诊断去掉行列后与上一轮基线完全一致（66 条不同诊断）；本次变更文件无新增类型诊断。
- 当前开发实例：renderer 已热更新；检查到生产数据有执行中的分镜任务，未重启进程以免中断。新增修改建议的后端处理需在任务结束后重启应用加载；上述端到端验证运行在加载新版后端的独立 Electron 实例。

## 截图与日志

截图位于 `video-workflow-production/copy-ai-*.png`，包含浅色加载、明暗 1440/1024 和 200% 缩放。

本机日志：`/tmp/workflow-copy-ai-red.log`、`/tmp/workflow-copy-ai-green.log`、`/tmp/workflow-copy-ui-red.log`、`/tmp/workflow-copy-ui.log`、`/tmp/workflow-copy-build.log`、`/tmp/workflow-copy-types.log`。UI 临时目录：`/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/video-workflow-ui-9W9nab`。
