# Publication Cover Implementation Plan

**Goal:** 在平台发布步骤生成、预览、修改和选择 B 站双比例封面，同时保留视频、配音、发布资料与人工审核。

**Architecture:** 封面作为 B 站发布资料中的可选受管产物随发布版本保存，任务复用现有执行、取消与历史机制。AI 代码通过现有 Codex/Claude 返回静态 HTML，由隔离 Electron 截图；Image2 通过用户本机 baoyu-imagine CLI、已有配置和 gpt-image-2 生成，再规范化尺寸。上传与导出读取已审核的封面。

**Tech Stack:** React 18 / Tailwind 3、现有 VIDEO-WORKFLOW-001 例外控件、Electron nativeImage、SQLite、既有 CLI 执行器。

## Constraints

- 官方 2026-10-26 投稿前端核验：首页推荐 4:3、个人空间 16:9；推荐 ≥1200×900，输入最小 960×600，原图上限 20 MiB。项目采用 1600×1200 / 1600×900 PNG，各 ≤4 MiB（现有受管图片上限）。
- Catbus 当前仅一个 cover 参数，上传 16:9 版本；导出额外 4:3 文件，不虚称已自动设置双封面。
- 保留布局与封面视频预览入口；新增独立封面区；旧项目未生成时继续使用原截帧。
- 不变更已审核视频、口播、配音或分镜；封面生成或选择只创建待审核发布版本。
- 无真实投稿、无自动收费生成测试、无自动提交代码。

## Tasks

- [x] Shared contract and tests: extend PlatformMetadata with generated cover files, source render revision, method and feedback. Reject invalid sizes/metadata and stale source; preserve optional legacy behavior.
- [x] Generator and tests: build style-aware prompt using frozen final render context; code captures 1600×1200 and 1600×900 HTML; Image2 uses 1600×1200 safe layout and central 16:9 crop. Validate actual PNG and reject invalid/small/oversize outputs; preserve old version on failures and cancellation.
- [x] Service and integration tests: add cover request to existing generation lifecycle, preserve current publication metadata and other platform, keep cover when metadata regenerates; enforce frozen source and verify files at save/review/upload/export.
- [x] UI and Electron tests: publishing cover controls, method selection, feedback, expand preview with ratio switch, historical cover selection, explicit pending/review/error states; no unsaved edits overwritten.
- [x] Verify design checks, build, scoped lint/format, known type baseline, themes/viewports/keyboard and packaged Electron; document evidence and limitations.

Evidence and known unrelated regression blockers: `docs/design-system/video-workflow-publication-cover-verification.md`.
