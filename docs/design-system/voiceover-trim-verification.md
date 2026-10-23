# 音色裁剪与工作流运行验证

日期：2026-10-23。

## 运行目录

视频工作流位于 `/Users/dorck/.codex/worktrees/video-studio-workflow/MyDashboard`，分支为 `feature/video_studio_workflow`。本地运行须在该目录执行 `pnpm run dev:launchd`。

主检出目录 `/Users/dorck/self-projects/MyDashboard` 属于 `codex/design-v2`，仍是旧素材页。两个检出共用 launchd 标签 `com.dorck.hulkdash.dev`；从旧目录启动会替换当前服务。本次已停止旧目录服务，从工作流目录重启，并检查服务 WorkingDirectory、Electron 进程与窗口 ready 日志。

仅同步音色裁剪相关共享类型、参考录音服务与 Voiceover 组件，以及裁剪测试；保留工作流页面、后端、八阶段合同和 Edge TTS 的独立更新。

## 验证结果

- `pnpm test:voiceover`：28/28 通过，包含 42 秒源音频完整波形、34–40 秒试听与保存、原文件保留及小数边界。
- `pnpm test:video-workflow`：27/27 通过。
- `pnpm build`、受影响生产文件 ESLint、`pnpm design:check`、`pnpm design:build`、`git diff --check`：通过。
- Electron 音色裁剪：工作流默认入口 → AI 配音 → 我的音色 → 系统导入 → 拖动 / 平移 / 缩放 / 键盘 → 选段试听 → 保存。检查 1440 明暗、1024 与 200% 缩放，手动校对保留、切换编辑及原始音频字节一致。
- Electron 工作流回归：创建、保存、审核门禁、阶段推进、分镜布局、Agent 输入、沙箱预览、键盘焦点、1440/1024/200% 与项目持久化通过。
- macOS arm64 本地未签名包构建与运行通过，确认工作流入口及 AI 配音可打开；未验证发布签名。
- 全量 web / project 类型检查仍失败，输出涉及原有 MainLayout、EmbeddedBrowser、数据库泛型等；本次修改的裁剪与配音文件无类型诊断。

UI 回归使用隔离的临时用户目录和合成录音。自动转写以固定测试结果替代；裁剪、波形、试听、保存和工作流 IPC 使用实际实现。未调用真实克隆模型。

证据日志：`/tmp/workflow-restore-voice-tests.log`、`/tmp/workflow-restore-tests.log`、`/tmp/workflow-restore-trim-ui.log`、`/tmp/workflow-restore-workflow-ui.log`、`/tmp/workflow-restore-packaged-ui.log`。
