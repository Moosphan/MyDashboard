# DeepSeek Workflow CLI Implementation Plan

**Goal:** 视频工作流可在 Codex、Claude Code 和官方 DeepSeek Harness (`dsh`) 间切换，并保留当前产物和人工审核。

**Architecture:** 继续通过现有 `workflowCommand` 启动本地 CLI。共享执行器类型与名称；DeepSeek 使用已核实的官方非交互协议独立适配，不假定与第三方同名 CLI 兼容。选择保存在本机，生成请求冻结所选执行器；自动 MG 必须使用同一选择。

**Tech Stack:** Electron、TypeScript、React 18、现有 VoiceSelect / Radix 与项目主题；不添加运行时依赖。

## Global Constraints

- 遵循设计规范 2.0、视频工作流 VIDEO-WORKFLOW-001 既有兼容边界，不改变布局、信息顺序、动作位置。
- 默认 Codex；已有项目和旧执行环境配置向后兼容。失败不自动转交其他提供商，不自动审核。
- CLI 取消、超时、进程树清理、4 MB 输出上限继续共用现有实现。提示词通过 stdin 或受管文件传递，不能通过 shell 拼接。
- 本机凭据由 CLI 管理，不写入仓库或日志；不自动安装第三方同名包。
- 保留工作树中素材画册等无关修改；本轮不自动提交推送。

## Tasks

- [x] 核实官方发行版的非交互输入、输出、错误、会话和工具禁用协议，研究记录保存于 `docs/design-system/deepseek-cli-integration-research.md`。
- [x] 在 `scripts/test-video-workflow.ts` 增加模拟 CLI 回归：DeepSeek 参数/输入、成功 JSON、失败/截断输出、取消/超时、配置恢复，以及模板 MG 使用显式选择；先运行确认失败。
- [x] 在 `src/shared/video-workflow.ts` 建立 `WorkflowAgent` 与标签；`cli.ts` 增加 `deepseekPath` 自动发现/配置/检测和选择校验，按研究协议接入 DeepSeek；`service.ts` 和 `covers.ts` 贯通所有生成链路。
- [x] 在 `src/renderer/modules/video/workflow/useWorkflowAgent.ts` 统一记忆与同步选择；`StageWorkspace.tsx`、`RenderActions.tsx`、`WorkflowSettings.tsx` 和 `ExecutionLog.tsx` 沿现有控件显示并传递 DeepSeek。`PublicationCoverPanel.tsx` 更新可用执行器说明。
- [x] 新增合成 Electron 回归，验证配置、切换、跨阶段记忆、提交到 DeepSeek、失败保留、键盘/主题/视口；不访问用户项目或真实提供商。
- [x] 更新 README、页面契约与迁移台账；执行工作流、类型、构建、设计检查和 Electron 回归。构建并重启日常应用，明确本机尚未配置 CLI/凭据时的实际可用范围。

## 交付验证

工作流回归 83/83、合成 Electron 回归、官方发布 CLI 禁网 smoke、应用构建与设计检查/构建通过；日常应用已重新构建并重启。类型检查执行后仍报告仓库其他模块的既有错误，修改的工作流文件没有错误。尚未执行真实提供商的收费生成；使用 DeepSeek 前需在执行环境配置本机 dsh 与兼容 Node，并由 Harness 提供 API 凭据。详细证据见 `docs/design-system/deepseek-workflow-verification.md`。
