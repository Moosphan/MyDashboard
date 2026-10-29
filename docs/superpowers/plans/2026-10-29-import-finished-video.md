# Import Finished Video Implementation Plan

> **For agentic workers:** Execute inline with executing-plans; use test-driven-development and verification-before-completion. Preserve unrelated workspace changes.

**Goal:** 新建窗口折叠导入外部成品视频，直接进入现有平台发布页。

**Architecture:** 受管成片记录保存明确的 imported 来源、内容说明与实测视频信息；仅创建 render/publish 版本，不伪造前六阶段。导入是用户接受成片的操作，发布资料保持待审核。发布依赖仅绑定该成片；原创作项目仍要求完整前置审核。

**Tech Stack:** Existing React 18/Radix workflow exception VIDEO-WORKFLOW-001, Electron IPC, SQLite, FFmpeg/FFprobe, TypeScript.

## Global Constraints

- 保留原弹窗字段、页栏、动作位置和两平台投稿/幂等/回执机制，不真实投稿测试视频。
- 仅支持普通本地 MP4、≤1 GiB、≤300 秒，实际检测 H.264 视频和可选 AAC 音轨；无音轨视频可导入。原文件复制到受管目录后检测，校验失败清理新项目与文件。
- 任意合理实测分辨率保留，不裁剪、缩放或重新生成原视频；封面用 FFmpeg 抽帧。
- 折叠区提供文件选择、文件名、可选内容说明。取消选文件保留原选择；导入失败保留输入，期间锁定提交/关闭，双击不重复创建。
- 其他前置阶段显示不适用；外部成片不能调用分镜、配音或 HyperFrames 渲染。发布资料可手填/AI 生成、审核、封面生成、导出、投稿。
- AI 只能使用用户提供的内容说明和资料，不宣称已观看视频或存在已审核分镜；导出无独立字幕时不伪造字幕。

## Task 1: Import and durable publication dependencies

Files: `src/shared/video-workflow.ts`, `src/main/database/repositories/video-workflow-repository.ts`, new `src/main/services/video-workflow/import-video.ts`, `service.ts`, `publish.ts`, `covers.ts`, test `scripts/test-import-finished-video.ts`.

- [x] Add service tests generating short H.264 MP4 fixtures with real FFmpeg. Assert render approved + publish review, only two stages, byte-identical managed video, decoded cover, measured portrait/square dimensions, publication gate, save/approve/export, restart, and rejected invalid/oversized/unsupported inputs without orphan projects/files.
- [x] Run `ELECTRON_RUN_AS_NODE=1 pnpm exec electron --import tsx --test scripts/test-import-finished-video.ts`; observe missing `importFinishedVideo` failure.
- [x] Add `RenderPayload.imported: { filename: string; description: string }`. Centralize `isImportedVideo` + `workflowDependencies` and use them for unlocked stages and repository dependency fingerprints. Add atomic completion of fresh imported project after file registration; reject forged imported render in regular save.
- [x] Implement managed copy → FFprobe → PNG extraction → completion; cleanup on error. Expose service method; protect lifecycle with abort/dispose tracking.
- [x] Adapt publication and cover prompts to missing upstream content and optional subtitle export. Run import tests and existing workflow/publishing suites.

## Task 2: Creation dialog and publication UI

Files: `src/main/ipc/video-workflow.ts`, `src/renderer/modules/video/workflow/{WorkflowStudio.tsx,StepView.tsx,useWorkflow.ts,MediaPanels.tsx}`, test `scripts/test-import-finished-video-ui.cjs`.

- [x] Add isolated Electron test with system picker stub: expand via keyboard, cancel selection, invalid import preserves input, successful import directly displays publishing page, original video preview, no fake stages, edited metadata save/review and existing export/post gates.
- [x] Run built UI test and observe missing foldout before implementation.
- [x] Add `workflow:selectFinishedVideo` and `workflow:createFromVideo` main-window-only handlers; validate all values server-side. Add collapsed native details inside current creation form, local selection + optional description, pending state/ref guard and clear file action. Ordinary create remains original IPC.
- [x] Imported projects open publish and show an external-source summary in place of non-applicable step controls; existing field/action order unchanged. Correct source/spec strings for arbitrary imported dimensions and no scene versions.
- [x] Test light/dark at 1440/1024, 200% zoom, reduced motion/high contrast, Tab/Shift+Tab/Space/Enter/Escape and focus return, errors/selection persistence. No real platform writes.

## Task 3: Verification and documentation

- [x] Update `page-specs-v2.md` and append feature evidence to `migration.md` without disturbing existing edits.
- [x] Run `pnpm design:check`, `pnpm design:build`, `pnpm build`, affected ESLint/Prettier, `pnpm exec tsc --noEmit -p tsconfig.web.json`, `pnpm exec tsc -b --pretty false`; report pre-existing failures separately.
- [x] Inspect diff and run final import/workflow/publishing regressions. Restart development app only when no jobs are active. Leave reviewable code changes without committing or publishing unless asked.

## Verification notes

Completed inline. See `docs/design-system/video-workflow-import-verification.md` for test evidence and existing type/focus assertion failures. Development app restart is performed only after checking active production jobs. No real platform publishing or Git commit/push is part of this task.
