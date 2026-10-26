# 单镜 AI 启动反馈验证 · 2026-10-26

## 故障与修复

“修改此分镜”弹窗内点击 AI 修改时，未保存草稿会被父组件的生成门禁拦截；实际 IPC 启动错误也由父组件捕获。但错误只显示在弹窗背后的页面，子组件收到 false 后没有反馈，看起来没有反应。相邻的重绘按钮还会在启动失败时直接关闭弹窗。

本次将父组件的准确错误传入单镜编辑弹窗，沿用既有错误样式并添加 role=alert；AI 修改和重绘共用等待启动结果的流程，失败保留弹窗和意见，启动成功才关闭。没有自动保存、放弃用户修改或跳过审核。用户当次具体拦截原因尚未直接确认；未保存草稿与 IPC 版本冲突已分别复现。

## 验证证据

- `scripts/test-storyboard-ai-feedback-ui.cjs` 使用独立临时 profile、数据库和模拟 CLI，通过实际 Electron renderer 与 IPC 验证。修复前在“弹窗内未保存错误可见”断言失败；修复后通过。
- 覆盖未保存草稿不创建任务、准确原因在弹窗内出现、意见保留、重绘失败不关窗、实际 IPC 版本冲突、解除冲突后重试成功并生成待审核新分镜；模拟 CLI 收到修改意见，新 HTML 与修改日志被保存。
- 明暗主题、1440/1024 窗口及 200% 缩放截图已生成。1440 浅色截图确认错误位于意见和按钮之间；缩放后沿用弹窗滚动区域。Escape 关闭与入口焦点返回通过。
- `pnpm build`、受影响 renderer 文件 ESLint、`pnpm design:check` 与 `pnpm design:build` 通过；设计构建有既有 bundle 大小提示。
- `pnpm exec tsc -b --pretty false` 仍有 82 处现有诊断，未包含两个受影响 renderer 文件，不宣称全量类型检查通过。
- 较大范围的 `scripts/test-video-workflow-ui.cjs` 在分镜验证之前的 `keyboard copy retry` 超时。当前 macOS Electron 测试环境的 Enter 激活也未稳定触发；本次成功重试通过按钮 click 验证，不宣称 Tab/Enter/Space 全链路通过，不扩大修改范围。

通过记录：`/tmp/storyboard-ai-feedback-green4.log`。
截图与临时测试数据：`/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/storyboard-ai-feedback-ui-4SBMbW`。

重现命令：先 `pnpm build`，再 `pnpm exec electron scripts/test-storyboard-ai-feedback-ui.cjs`。测试不调用真实 AI、不修改用户项目。运行中的开发应用已通过 Vite HMR 加载 renderer 修复，无需为此重启并丢失当前输入。
