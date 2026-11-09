# Remotion 合成引擎实施计划

**Goal:** 在现有视频工作流中选择 HyperFrames 或 Remotion，保留动效计划审核、粗剪、正式成片、配乐和发布。

**Architecture:** 复用安全分镜 HTML、实测配音时间轴和受限动效协议；Remotion 使用可信 React Composition 按帧驱动相同画面及 Web Animations，并由官方 CLI 输出视频。引擎写入粗剪冻结版本，正式成片沿用来源引擎，旧工程缺省为 HyperFrames。外部工具与 HyperFrames 一样配置绝对路径，不捆绑第二套 React 到 Electron 窗口。

**Tech Stack:** Electron、现有 React 18、TypeScript、官方 Remotion CLI 4.0.541、FFprobe。

## 约束

- 用户已选择现有工作流切换方案，不包含导入任意 React/TSX 项目。
- 保留旧审核版本及乐曲、字幕、文案、配音和发布门禁；失败不切换引擎、不覆盖旧版。
- 不提交推送；不改不相关素材或画廊修改。
- 沿用 VIDEO-WORKFLOW-001 控件例外和既有布局；选择项放在原粗剪合成动作区，正式成片显示来源引擎。
- 原始 Agent 内容只能作为已清理的画面数据，不能成为 React 源码；Remotion 入口由应用固定生成。

## 1. 引擎契约及兼容性

修改 `src/shared/video-workflow.ts`、`service.ts`、`cli.ts`、`files.ts`，新增 `scripts/test-remotion-workflow.cjs`。

- [x] 先编写失败断言：`assert.equal(validatePayload('roughcut', {...fixture, renderEngine:'remotion'}).renderEngine, 'remotion')`；未知引擎拒绝，旧版本仍有效。
- [x] 增加 `VideoRenderEngine = 'hyperframes' | 'remotion'`、引擎标签、可选 runtime.remotionPath 和冻结 renderEngine；只有生成粗剪可选择新引擎，正式成片不允许跨引擎覆盖来源。
- [x] 冻结允许固定 React 入口文件，文件仍需受管验证及指纹校验。

## 2. 官方 Remotion CLI 输出及冻结工程

新增 `src/main/services/video-workflow/remotion.ts`，修改 `render.ts`。

- [x] 测试可信入口可在真实 Remotion 浏览器按帧渲染；包含横/竖版、元素透明度/缩放、字幕、非零配音及配乐，检查输出流和时长。
- [x] `renderRemotion(runtime, cwd, signal, final, phase)` 只调用配置的官方 CLI；低并发，沿用进程树取消和超时；依赖及浏览器缺失时提示配置入口。
- [x] `writeRemotionComposition(cwd, duration, frame, music?)` 写入固定 `remotion.tsx`、`composition.json`、`package.json`，HTML 和媒体使用已经验证的冻结资源。
- [x] 正式成片复制原冻结工程，校验指纹，配乐改写独立 JSON；无需重新解释或生成分镜。导出包含 npm 安装说明与入口。

## 3. 选择入口及回归

修改 `StageWorkspace.tsx`、`RenderActions.tsx`、`WorkflowSettings.tsx`，新增 `useRenderEngine.ts`。

- [x] 粗剪原动作区增加“合成引擎”，默认 HyperFrames，有新版来源时优先沿用；每项目保留本地选择，运行期间禁用。动效计划确认使用同一选择。
- [x] 最终成片展示冻结来源引擎，导出工程说明匹配引擎，旧历史仍可预览。
- [x] Electron 回归检查键盘选择、重新载入、IPC 参数、两种主题、1024/1440 视口、200% 弹窗、错误保留旧视频；执行 `pnpm test:video-workflow`、受影响类型检查、`pnpm build`、`pnpm design:check`、`pnpm design:build`。
- [x] 更新 README、页面规格、迁移记录和验证记录；安装并配置本机 Remotion CLI，构建并重启日常应用。

完成证据：工作流 85/85；真实外部 CLI 横竖版粗剪/成片及音频混合通过；Electron 业务、主题、键盘和高对比/减少动效检查通过；导出两个合成工程的依赖、入口与 public 检查通过；独立只读代码审查无重要发现。全量类型检查仍被不相关模块既有错误阻塞，不标为通过。详见 `docs/design-system/remotion-workflow-verification.md`。
