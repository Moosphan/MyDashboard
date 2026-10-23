# 口播 AI 生成验收

日期：2026-10-23；分支：`feature/video_studio_workflow`。

## 实现

口播编辑区标题右侧明确提供 AI 生成/重新生成入口，下方展示文案、分镜版本、镜数与目标时长，右侧继续选择 Codex / Claude Code 或导入/导出任务。

主进程复用已有 Agent 执行链路，新增口播专用提示词：把已审核文案作为事实依据，结合分镜标题、正文和 HTML 画面含义组织自然口播，保持分镜数量、顺序和 ID；正文与可选读音提示分离，按目标时长控制篇幅。前置阶段未审核禁止生成，存在未保存修改时禁止覆盖，运行中锁定口播编辑。生成完成只创建待审核版本，不自动配音。

## 验证与边界

- 新增 service 测试先在旧提示词上失败，再通过：真实 SQLite 仓库和子进程执行链路，验证未审核门禁、传入文案/分镜、JSON 回填、分镜对应、待审核状态及无自动音频生成。执行器为本地测试程序，不访问模型。
- UI 新入口断言先在旧页面失败；完整真实 Electron 回归验证按钮可见与门禁、来源版本、未保存草稿保护、点击发起任务、运行中加载/禁用、结果自动回填和人工审核门禁。含明暗主题、1024px、200% 和键盘焦点。
- `pnpm test:video-workflow`：19/19；`pnpm build`、受影响文件 ESLint/Prettier、`pnpm design:check`、`pnpm design:build` 通过。
- 全项目两项类型检查仍存在既存错误；完整 `tsc -b` 归一后与上一轮均为 65 项，无新增。未宣称全项目类型通过。
- 没有调用真实付费模型；本轮不验证具体模型的文案质量和时长遵从性，仍需用户审核。执行日志的测试条目明确是隔离 fixture。
- 确认无运行中的视频/配音任务后重启开发应用，新主进程在 `2026-10-23T07:15:22.188Z` 到达 `ready-to-show`。

日志：`/tmp/video-narration-red.log`、`/tmp/video-narration-ui-red.log`、`/tmp/video-narration-tests.log`、`/tmp/video-narration-ui-final.log`、`/tmp/video-narration-types.log`。

截图：[浅色](video-workflow-production/aligned-narration-light-1440.png) · [深色](video-workflow-production/aligned-narration-dark-1440.png) · [运行中](video-workflow-production/narration-ai-running-dark.png) · [生成后待审核](video-workflow-production/narration-ai-review-dark.png)。截图为隔离 Electron 测试视口，不是用户项目数据。
