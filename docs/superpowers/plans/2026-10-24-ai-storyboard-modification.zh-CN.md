# AI 分镜修改 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在“修改此分镜”对话框中支持填写修改意见，由本地 Agent 生成指定分镜的新候选版本，并沿用人工审核门禁。

**Architecture:** 复用现有 storyboard 生成任务和安全预览链路，新增独立的 `storyboardModification` 输入，避免与动态粗剪的动效计划混用。AI 仅返回当前分镜并保持其 ID，服务端合并到已有分镜后创建待审核版本；界面保留手动编辑入口，AI 生成完成后回到分镜预览和审核流程。

**Tech Stack:** Electron IPC、React 18、Radix/现有 Button 与 VoiceTextArea、TypeScript、Node test runner、Electron UI smoke test。

## Global Constraints

- 保留现有 Video Studio 桌面布局、信息顺序、审核门禁和本地 Agent 选择。
- 使用现有项目主题和控件；不引入新的 UI 库或改变 HeroUI 迁移边界。
- AI 生成内容必须停在 `review`，不能自动审核或推进配音、粗剪阶段。
- 参考 HTML 作为数据传给 Agent，预览继续使用现有无脚本安全预览。

### Task 1: Define and test the storyboard modification contract

**Files:**
- Modify: `src/shared/video-workflow.ts`
- Modify: `src/main/services/video-workflow/storyboard.ts`
- Test: `scripts/test-video-workflow.ts`

- [x] **Step 1: Write failing tests** for a storyboard modification prompt requiring one existing scene ID and preserving the other scenes, and for rejecting a modification request without feedback or with an unknown scene ID.
- [x] **Step 2: Run `pnpm test:video-workflow`** and confirm the new assertions fail because the request type and prompt do not exist.
- [x] **Step 3: Add `storyboardModification: { feedback: string; sceneId: string }` to `WorkflowGeneration` and append explicit feedback and single-scene preservation rules to `agentPrompt`.
- [x] **Step 4: Run the targeted workflow tests** and confirm the prompt/validation assertions pass.

### Task 2: Generate an AI-modified storyboard candidate

**Files:**
- Modify: `src/main/services/video-workflow/service.ts`
- Test: `scripts/test-video-workflow.ts`

- [x] **Step 1: Add a failing service test** that starts a storyboard modification with a fixture Agent, verifies the returned scene keeps its ID while another scene remains unchanged, and verifies the revision is `review`.
- [x] **Step 2: Run the test** and confirm the service rejects the new input or ignores the feedback.
- [x] **Step 3: Validate storyboard modification inputs before `startJob`, require a current storyboard scene and a Codex/Claude executor, pass the feedback into `agentPrompt`, and reuse the existing single-scene merge path.
- [x] **Step 4: Run `pnpm test:video-workflow`** and confirm all workflow tests pass.

### Task 3: Add AI modification controls to the scene dialog

**Files:**
- Modify: `src/renderer/modules/video/workflow/StoryboardEditor.tsx`
- Modify: `src/renderer/modules/video/workflow/StageWorkspace.tsx`
- Test: `scripts/test-video-workflow-ui.cjs`

- [x] **Step 1: Add a failing UI assertion** that the “修改此分镜” dialog exposes an AI feedback field and an action that sends the selected scene ID plus feedback through IPC.
- [x] **Step 2: Run the focused UI test** and confirm the field/action is absent.
- [x] **Step 3: Add the feedback field, pending state, and “让 AI 按意见修改此镜” action; wire `StageWorkspace` to call `workflow:generate` with `storyboardModification` and preserve the existing manual edit action.
- [x] **Step 4: Run `pnpm test:video-workflow:ui`** and verify the dialog, safe preview, keyboard focus, responsive checks, and approval flow pass.

### Task 4: Verify and commit

**Files:**
- Modify: `docs/superpowers/plans/2026-10-24-ai-storyboard-modification.zh-CN.md`

- [x] **Step 1: Run `pnpm build`, `pnpm test:voice-runtime`, `pnpm design:check`, `pnpm design:build`, and `git diff --check`.**
- [x] **Step 2: Review the diff for unchanged layout and correct review gating.**
- [x] **Step 3: Commit with `feat(video): add AI storyboard scene revisions`.**
