# 配音沿用与本地模型环境缓存验证（2026-10-24）

## 原因与行为

配音原先只比较上游版本 ID，即使口播完全相同，新口播版本也会使旧配音过期，且审核入口直接禁用。现在从配音保存时的历史顺序还原输入快照并核实依赖指纹，逐镜比较口播正文、读音、ID 和顺序。内容一致时用户可在原审核位置选择“沿用并审核此版配音”；确认后校验受管音频/字幕文件，事务内创建并审核新版本，保留旧版和来源/结果记录，不调用模型。正文或读音变化、顺序变化、来源无法核实、文件缺失或被修改均拒绝沿用。

模型路径配置原本已持久保存，但检测结果仅在内存。现在 `voice-runtime-status.json` 缓存实际检测结果及配置、平台、工具、模型文件和 Python 包元数据指纹。重启恢复前与使用前检查指纹，环境变化自动检测；首次读取、配置保存与本地生成均自动确保环境已检测。手动检测强制重检，并发检测共享一次任务。权重仅读取文件元数据用于缓存失效判断，完整模型检查仍走原逻辑；不在每次启动读取多 GB 权重。

## 证据

- Red：`/tmp/audio-reuse-red.log`（旧配音无法审核）、`/tmp/runtime-cache-red.log`（缺少自动检测入口）。
- 工作流：`pnpm test:video-workflow` 43/43，`/tmp/audio-reuse-green-final.log`。包括沿用旧音频、保留原文件和版本、请求重试幂等，以及正文/读音变化、文件篡改和来源指纹异常拒绝。
- 配音环境：`pnpm test:voiceover` 30/30，`/tmp/runtime-cache-green-final.log`。包括并发去重、重启恢复、保存相同配置、包元数据变化、权重删除、强制检测及配置变更。
- 本机真实检测：`/tmp/runtime-cache-local-final.log`，VoxCPM2、Qwen3-TTS、Whisper Small、ZipEnhancer 均就绪；重建管理器后 `commandsAfterRestart: 0`。
- 生产项目只读核实：`一天一个GitHub开源项目推荐` 当前 audio v10 为 stale，但口播内容一致且历史来源指纹有效；没有替用户审核或生成媒体。
- Electron：`pnpm test:video-workflow:ui` 通过（含生产构建），日志 `/tmp/audio-reuse-ui-final.log`。隔离配置中创建已审核音频，再保存相同口播制造过期状态，通过真实 IPC 和键盘操作沿用并审核；确认音频文件/字幕原样保留、旧版仍过期、新版通过并解锁下一步，执行记录保存沿用详情。覆盖 light/dark、1440/1024、200%、Space 打开、Escape 取消及焦点返回。
- 截图：`/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/video-workflow-ui-l6wnhC/audio-reuse-{light,dark}-{1440,1024,200percent}.png` 和审核弹窗截图。通过真实设置切换主题、重新打开项目后验证；测试的复制操作改用前台窗口及真实鼠标事件，避免后台文档被浏览器拒绝剪贴板访问；产品复制逻辑未改动。
- 设计检查和设计构建通过，日志 `/tmp/audio-reuse-design-check.log`、`/tmp/audio-reuse-design-build.log`。
- 全项目 `tsc -b --pretty false` 与 web 类型检查仍被已有 BaseRepository、MainLayout cleanup、缺失 `@swc/core` 等错误阻塞；本次修改文件无诊断，日志 `/tmp/audio-reuse-tsc-final.log`、`/tmp/audio-reuse-web-tsc.log`。
- 受影响生产文件 ESLint 通过，日志 `/tmp/audio-reuse-lint-final.log`；`git diff --check` 通过。
- 2026-10-24 17:35:21（Asia/Shanghai）从 `feature/video_studio_workflow` 所在 worktree 执行 `pnpm dev:launchd`，主窗口于 17:35:23 ready-to-show。重启前工作流和配音活动任务均为 0；生产 audio v10 全部文件通过校验，未更改其审核状态。

## 范围

沿用 VIDEO-WORKFLOW-001，保持 React 18 / Radix、现有主题、信息顺序、主栏/审核栏及底部动作；不引入依赖或改变布局。生产项目的媒体和审核记录保持原状，测试在临时数据目录执行。
