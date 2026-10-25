# 正式成片与粗剪对比验证

日期：2026-10-25。工作树：`/Users/dorck/.codex/worktrees/video-studio-workflow/MyDashboard`。

## 行为与边界

- 正式成片播放器规格行工程指纹旁提供对比图标，点击弹窗显示“相较粗剪的变化”，随当前/历史预览版本更新。展示来源粗剪的版本与时间，以及编码质量、分辨率/帧率、实测时长、文件大小和浏览器布局抽样检查结果。
- 新渲染记录实际传给 HyperFrames 的 `looks` / `delivery` 质量预设、30 fps 及正片的来源粗剪 ID。同一冻结工程明确说明画面、动画、配音和字幕沿用；文件指纹相同明确没有新增改进。文件体积变化不作为画质提升的证据。
- 旧记录只按冻结工程、素材文件指纹、来源阶段和生成时间匹配粗剪，无法匹配则明确提示。历史未记录的编码参数不从当前实现推断，不使用后生成的最新粗剪冒充来源。
- 正片仍以交付编码重新渲染已审核粗剪；本次不改变视频内容、MG 动画、编码设置、审核流程或布局。没有自动重跑、修改或审核生产项目。
- 复用 VIDEO-WORKFLOW-001 的现有 Button ghost/icon、WorkflowDialog、文字、主题和表格样式；比较业务图标使用固定 `@heroicons/react@2.2.0` outline。无新控件库、主题或 CSS 覆写。表格保留 caption、行列标题及局部溢出滚动。

## 验证

- `pnpm test:video-workflow`：55/55。覆盖明确来源与较新粗剪隔离、历史匹配、缺失来源、参数校验与持久化、相同文件、相同编码档位、工程/时长变化及不同配音来源。日志 `/tmp/render-comparison-final-unit.log`。并发 UI 测试期间曾有两项旧异步测试超过短轮询期限；停止并发 Electron 后完整重跑通过，未修改这些测试的等待条件。
- `pnpm exec electron scripts/test-final-render-comparison-ui.cjs`：实际 Electron 主窗口、隔离数据库及 IPC 验证来源粗剪、编码说明、内容沿用、历史版本未知参数、审核 Space/Escape 与焦点返回。明暗主题、1440/1024 宽度和 200% 缩放没有页面横向溢出；截图已人工查看，证据目录 `/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/final-render-comparison-ui-GrQzzM`，日志 `/tmp/render-comparison-ui-green.log`。
- `pnpm test:video-workflow:render`：使用固定 HyperFrames 0.8.181 完成真实粗剪与正式成片渲染、发布包及失效检查，断言两阶段实际预设及来源粗剪持久化。日志 `/tmp/render-comparison-smoke.log`。仅使用隔离测试项目，不调用真实克隆配音。
- 构建、受影响源文件 ESLint、Prettier、`git diff --check`、`pnpm design:check` 与 `pnpm design:build` 通过。设计构建有既存大 chunk 提示。
- 生产类型检查仍有既存错误：web 52 条，`tsc -b` 82 条；本次变更文件无诊断。日志 `/tmp/render-comparison-web-types.log`、`/tmp/render-comparison-types.log`。不将此描述为全项目类型检查通过。

范围限制：抽样浏览器布局检查不等同逐帧画质评估或全片听审；页面没有推断具体视觉改善、添加动画或自动修复声音。

格式化后再次构建并运行 Electron UI 检查通过，日志 `/tmp/render-comparison-final-build.log`、`/tmp/render-comparison-final-ui.log`；来源对比、历史参数提示和审核键盘行为均保持正常。

## 图标弹窗与底部空白修订

用户截图反馈对比区过长，改为规格行内图标入口，不再在正文展开。只读弹窗复用现有关闭按钮，保留版本比较数据，无需重新渲染视频。

实际 Electron 中复现了多出的外层滚动：窗口高 900px，`main` 自身滚动范围正常，但根文档高 1193px；超出视口的唯一节点是 `sr-only` 表格 caption，其绝对定位没有近邻定位容器。仅在运行时给表格增加 `position: relative` 后，根文档高度恢复 900px。正式修复在表格使用 `relative`，保留隐藏标题语义，不修改全局 overflow 或裁掉真实内容。红灯日志 `/tmp/final-scroll-baseline.log`、定位候选 `/tmp/final-scroll-candidates.log`、单变量验证 `/tmp/final-scroll-hypothesis.log`。

修订验证使用 16 分镜：默认详情不渲染；图标 Space 打开、Tab 限制焦点、Escape 关闭并返回触发器；历史版本仍显示未知参数。明暗主题、1440/1024 宽度、200% 缩放下反复打开/关闭后，根文档不产生外层滚动，`main` 在原底栏与正常 48px 页面内距结束。截图人工查看，证据 `/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/final-render-comparison-ui-b0LtUN`，日志 `/tmp/final-dialog-ui.log`。

受影响文件 ESLint、Prettier、设计检查与设计构建通过。类型检查仍为既存 web 52 条、全项目 82 条，本次 UI 文件没有诊断；日志 `/tmp/final-dialog-web-types.log`、`/tmp/final-dialog-all-types.log`。

补充高对比和减少动态效果的 Electron 媒体模拟验证通过，Shift+Tab 焦点仍限制在弹窗，Enter 关闭并返回图标；日志 `/tmp/final-dialog-accessibility-ui.log`。最终格式化后构建和完整 UI 测试见 `/tmp/final-dialog-final-build.log`、`/tmp/final-dialog-final-ui.log`。
