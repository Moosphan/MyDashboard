# 配音增量与播放验证

2026-10-23，分支 `feature/video_studio_workflow`。遵循规范 2.0、页面合同及 `VIDEO-WORKFLOW-001`；保留原组件、分栏和审核位置。

## 同日播放器与粗剪纠偏

用户要求恢复原生播放按钮和进度条。已恢复 `audio controls`，仅播放中的按钮增加主题色圆形背景；标题明确设置 700 字重与主题主色。所有进度条及未播放按钮恢复原生中性色，保留音量、定位、菜单和逐段生成能力。

新增 Electron 验证通过原生控件真实鼠标点击、Space 播放、方向键定位、暂停、结束、单音源互斥及逐段追加；检查播放标题计算字重至少 700。明暗主题、1024 窗口、200% 缩放均通过。截图使用 `native-audio-*` 前缀，保留本报告初次迭代证据。

粗剪失败记录 `cef54d26-c059-4c36-836d-a50f3fcd93d6` 在调用 CLI 前失败，用户执行环境仅配置 Codex，`hyperframesPath` 为空。本机已存在 0.8.181，现已为用户配置验证过的该入口与 Node 24 路径，保留 Codex 设置；不自动安装或升级。新增 `assertRenderRuntime` 在启动渲染前明确列出缺失的 HyperFrames、Node、FFmpeg 或 FFprobe，并指向右上角执行环境。

本轮工作流 22 项回归、真实 HyperFrames 两镜音频→粗剪→成片→发布包隔离测试、构建、ESLint/Prettier 与设计资产检查通过。真实用户项目没有自动重新生成或审核；可直接重试粗剪。类型相对上一轮 65 条归一源码诊断无新增。日志：`/tmp/workflow-native-ui.log`、`/tmp/workflow-roughcut-tests.log`、`/tmp/workflow-roughcut-smoke.log`。原生 UI profile：`/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/video-workflow-ui-rjHZpt`。

- [原生播放浅色](video-workflow-production/native-audio-playing-light-1440.png)
- [原生播放深色](video-workflow-production/native-audio-playing-dark-1440.png)
- [原生播放 1024](video-workflow-production/native-audio-light-1024.png)
- [原生播放 200%](video-workflow-production/native-audio-light-200percent.png)

## 修改与根因

- Edge 403：`msedge-tts@2.0.5` 的旧合成地址已被服务拒绝；[上游修复说明](https://github.com/Migushthe2nd/MsEdgeTTS/pull/39) 与真实请求一致。固定使用官方 2.1.0，锁文件仅随之更新该包及其 WebSocket 依赖。未覆盖私有成员、未改原工作区依赖。本 worktree 的 node_modules 已由指向原工作区的符号链接改为独立安装。
- 增量：原来 `createWorkflowAudio` 全部完成才创建版本，Renderer 无法获知成功片段。现在每段校验、归一化并登记受管文件后，将 `{ tracks, total }` 写入任务的 `audio_progress`（迁移 35），再发送现有刷新通知。
- 保留：失败、取消和恢复为中断时保留已完成片段；关闭重开可重新读取。新任务使用独立任务 ID；上游版本变化隐藏过期片段。全部完成、合并及字幕校验后才建立正式待审核版本。已有完整音频重做时，旧完整产物明确单列，不与当前片段混用。
- 播放：稳定文件 ID 保持已有 audio 元素；追加片段不中断试听。实际 play/pause/ended/error 事件驱动标题、按钮和加载状态；切换音源暂停前一段并还原高亮。保留键盘播放、进度调整、静音与就近错误提示，新片段不自动播放。

## 自动与真实验证

| 验证 | 结果 |
| --- | --- |
| Edge 地址回归 | 升级前准确失败于 `speech.platform.bing.com` 与预期新域名不一致；升级后通过，检查合成路径及参数名 |
| 429 错误回归 | 修改前准确失败于原始 WebSocket 报错；修改后提示服务限流和稍后重试，不改变引擎 |
| 逐段持久化回归 | 修改前第二段失败时收到 0 次片段回调；修改后覆盖失败、取消、中断、成功，回调时首段受管文件可访问且尚无正式音频版本，终态后拒绝追加 |
| `pnpm test:video-workflow` | 21 项通过 |
| `pnpm test:voiceover` | 26 项通过 |
| 真实 Edge 中文 | 隔离目录两镜逐段通知 1→2，WAV/SRT 完整性及真实时长通过，共 8.736 秒；最终待审核，无粗剪。过程中确实遇到服务端 429，冷却后同一脚本完整通过 |
| Electron 实际媒体 | 明暗主题中播放、暂停、结束、Space 播放、切换音源高亮与互斥通过；任务片段从 1→2 时音频 DOM 和播放状态保持；失败保留、过期隐藏、恢复完整结果通过 |
| 窗口/键盘 | 实际 CSS 视口 1440×944，1024×900，以及后者 200% 缩放；播放控制可见且无横向溢出，缩放时方向键调整真实音频位置通过。截图尺寸与 DPR 见同名 `.png.json` |
| 构建/样式 | `pnpm build`、受影响源文件 ESLint、Prettier、`git diff --check` 通过 |
| 设计资产 | `pnpm design:check`、`pnpm design:build` 通过；设计工作台有既存 bundle 大小提示 |
| macOS 包 | arm64 目录包构建成功（未签名），隔离 profile 实际启动到 `window:ready-to-show`；测试实例已关闭 |
| 类型 | `tsc -b` / web 仍受既存类型问题阻塞；相对前轮基线，65 条归一后的源码诊断无新增，不宣称全项目类型通过 |

真实 Edge smoke：`ELECTRON_RUN_AS_NODE=1 pnpm exec electron --import tsx scripts/smoke-workflow-edge.ts`。产物为 `/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/workflow-edge-GjM4zq`。在线请求仍可能受服务可用性和限流影响。

Electron 测试 profile：`/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/video-workflow-ui-bBQOFW`。使用合成音频固定样本，不改用户项目。命令结果保存在 `/tmp/workflow-audio-ui.log`、`/tmp/workflow-edge-real.log`、`/tmp/workflow-audio-tests-final.log`、`/tmp/workflow-audio-voice-tests.log`。

## 画面证据

- [浅色播放高亮](video-workflow-production/audio-playing-light-1440.png)
- [深色播放高亮](video-workflow-production/audio-playing-dark-1440.png)
- [后台继续生成与首段试听](video-workflow-production/audio-progress-dark-1440.png)
- [1024 窗口](video-workflow-production/audio-light-1024.png)
- [200% 缩放与可访问进度](video-workflow-production/audio-light-200percent.png)

开发应用已在无活动任务时安全重启，2026-10-23 16:18:50（Asia/Shanghai）到达 `ready-to-show`，用户数据库已应用迁移 35。旧成功音频和失败记录保留，没有重写历史错误；没有提交、推送或合并。
