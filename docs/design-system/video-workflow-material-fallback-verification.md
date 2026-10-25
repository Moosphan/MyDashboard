# 分镜素材降级与审核原因验证

日期：2026-10-24。工作树：`/Users/dorck/.codex/worktrees/video-studio-workflow/MyDashboard`。

用户最后决定停止寻找和替换真实图片，保留当前原创分镜、独立元素和 MG 动画；仅提供一个统一降级按钮。已找到的照片没有写入生产分镜。生产项目“三分钟领略秦始皇的一生”仍为分镜 v3、项目 revision 8。

## 行为与边界

- 缺口列表仅有一个“接受原创示意图降级”按钮。弹窗列出所有受影响镜头，确认后批量保存一个待审核版本；取消或 Escape 不写入。审核仍需用户点击。
- 接受记录包含时间与原素材缺口，执行记录包含原/结果版本与逐镜差异。原缺口不被清空，也不表示真实照片已取得。
- 降级不修改 HTML、动效、文案或镜头顺序。普通保存、导入、AI 输出不能自行新增降级授权；本镜内容、要求或动效变更后清除旧授权。
- 后端在隔离 Electron 中检查可见原创标注与真实动效目标；批量中任一镜不合格则全部不保存。不会豁免缺失元素、关键帧或其他技术问题。
- 审核按钮旁使用 status 文本直接说明素材缺口数量，混合问题分别列出；未保存修改、运行中任务、版本冲突及前置审核保持原门禁。
- 复用 VIDEO-WORKFLOW-001 的现有 Button secondary/primary 与 Radix WorkflowDialog；没有新依赖、CSS 外观覆写或布局变更。

## 验证

- `pnpm test:video-workflow`：54/54，覆盖精确原因、原缺口保留、技术缺口不可豁免、内容变动和伪造授权失效。红/绿灯日志：`/tmp/video-fallback-red.log`、`/tmp/video-fallback-green.log`。
- `pnpm exec electron scripts/test-storyboard-motion.cjs`：实际 DOM 验证三个镜头一次接受、仅一个版本、HTML/MG 保持、待审核、幂等、版本冲突及批量失败原子性。额外红灯 `/tmp/fallback-css-label-red.log` 验证隐藏 CSS 标注不能视为可见。
- `pnpm exec electron scripts/test-storyboard-materials-ui.cjs`：实际主窗口 IPC、唯一按钮、审核旁“因 3 处素材缺口无法审核”、Space 打开、Tab 焦点限制、Escape 取消并返回焦点、Enter 确认、三镜一次保存及保留 HTML/MG 通过。
- UI 已检查明暗主题、1440/1024 宽度和 200% 缩放；截图在 `/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/storyboard-materials-ui-ZfCZHF`。隔离测试账户与数据库不修改生产项目。
- `pnpm build`、`pnpm design:check`、`pnpm design:build` 通过。生产类型检查仍有既存错误：web 52 条；`tsc -b` 共 82 条，未出现本次工作流文件诊断。日志：`/tmp/fallback-web-types.log`、`/tmp/fallback-all-types.log`。未处理无关模块。

不自动接受生产项目的降级，不自动审核、重新配音或合成视频。

最终复核：`/tmp/fallback-workflow-final.log` 为 54/54；`/tmp/fallback-dom-final.log` 和 `/tmp/fallback-ui-final.log` 均通过。ESLint 无警告、Prettier 和 `git diff --check` 通过。最终构建见 `/tmp/fallback-build-final.log`。23:38（Asia/Shanghai）在确认没有运行中的工作流或配音任务后，从正确工作树通过 `pnpm dev:launchd` 重启，日志确认 `window:ready-to-show`；生产分镜未被测试或图片检索改写。
