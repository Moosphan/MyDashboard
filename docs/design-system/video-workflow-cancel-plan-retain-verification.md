# 取消计划并沿用原视频

日期：2026-10-24。分支：`feature/video_studio_workflow`。组件例外：`VIDEO-WORKFLOW-001`。

## 用户决定与行为

用户明确要求撤销修改计划后，保留上次生成的视频，直接使用原有审核按钮进入正式成片。此前增加静态重合成入口是理解错误，本次删除该按钮及其输出模式。

取消接口保留计划原文和历史，在项目版本及运行任务门禁下放弃计划。原粗剪已经有效时保持其状态；若因后续上游变化失效，则校验已有媒体和冻结工程指纹，保留同一粗剪 ID、版本和完整 payload，将其恢复为待审核，并绑定本次用户选择沿用的审核上下文。项目 revision 增加，记录“取消修改计划并沿用粗剪”事件。文案、分镜、口播和配音的现有版本不变。

这表示用户选择继续使用预览里的原视频；后续分镜或配音修改没有被应用。来源 ID、画面、配音、字幕及实测时长保持原样，取消不会新增粗剪版本、启动渲染或自动审核。界面明确解释这一点，使用原“审核通过此版本”确认后解锁正式成片。

正式成片读取原冻结工程，使用原粗剪时长进行输出校验，保留原来源 ID；动效校验使用工程真实来源分镜及配音，避免错误套用后来版本的镜头或时长。上游再次修改仍使粗剪失效。

## 验证

- `scripts/test-video-workflow.ts`：50/50。修改前新用例失败于取消后仍为 `stale`；修改后恢复 `review`，保持原视频 ID、版本、payload 和当前上游版本。必须人工审核，随后可保存正式成片；再次修改上游仍会使原视频失效。日志 `/tmp/cancel-keep-video-red.log`、`/tmp/cancel-keep-video-green.log`。
- `scripts/test-video-workflow-ui.cjs`：实际 Electron IPC 与 Space 取消，验证无静态合成按钮、草稿清除、焦点回修改区标题、原视频不变、原审核按钮可用、审核后解锁下一步，没有新增 HyperFrames 粗剪任务；明暗主题、1440/1024、200% 缩放通过。日志 `/tmp/cancel-keep-video-ui-green.log`，截图目录 `/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/video-workflow-ui-rVGn5h`。
- `scripts/test-cancel-motion-plan.cjs`：复制隔离工程，改变上游分镜和音频时长，加入 MG 要求及计划，以失败陷阱阻止取消/审核过程调用 Agent、TTS 或 HyperFrames；取消后原粗剪 ID、版本、文件和工程完全相同。必须审核后才实际渲染正式成片，确认使用原来源与原时长。通过日志 `/tmp/cancel-keep-video-render.log`，隔离产物 `/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/cancel-keep-roughcut-iUGd5N`。

测试不改生产项目，不替用户取消计划、审核或重新生成视频。真实操作流程：取消修改计划 → 审核通过此版本 → 正式成片。

## 交付复核

- 旧版只取消任务但未恢复审核的项目仍显示取消入口，用户重新点击后恢复原视频待审核；不会要求重新合成。该兼容场景的实际 Electron、审核解锁、Space、主题及缩放验证通过，日志 `/tmp/cancel-keep-video-ui-final.log`，截图目录 `/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/video-workflow-ui-6wN0FF`。普通待确认计划的取消已在前一轮 UI 验证通过。
- 最终回归 50/50：`/tmp/cancel-keep-video-tests-final.log`。实际正式成片使用原来源和时长的验证通过，未重合成粗剪。
- 生产粗剪 v2 的 19 个受管文件及冻结工程指纹经只读校验通过，原时长 252.067 秒；生产项目尚未被本次测试恢复或审核。
- 构建、ESLint、Prettier、差异检查、设计检查及设计站构建通过；日志前缀 `/tmp/cancel-keep-video-`。全量类型检查仍有既有错误（main 29 条、web 52 条），本次工作流文件无类型诊断；没有修改无关模块。
