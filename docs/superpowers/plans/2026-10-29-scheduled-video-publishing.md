# Scheduled Video Publishing Implementation Plan

> Execute inline using executing-plans, test-driven-development and verification-before-completion; preserve unrelated changes.

**Goal:** 发布页增加默认收起的应用内定时发布块，两平台共用已审核投稿流程。

**Architecture:** 在既有投稿表的 JSON record 中增加 scheduledAt 和 scheduled/missed 状态，保留冻结媒体/资料/账号及请求幂等。PlatformPublishingService 负责每 15 秒扫描到期任务；到点原子转换 queued，复用执行和回执。无需数据库结构迁移，现有唯一活动索引继续约束单平台上传。启动时恢复未到期计划，已过期计划或休眠期间到期的计划标已错过，不补发、不后台自动重试不确定结果。

**Tech Stack:** Electron/SQLite/TypeScript；既有 React 18/Radix/Voice 控件 VIDEO-WORKFLOW-001 局部例外。

## Constraints

- 时间是开始上传投稿时间，非保证公开时间；应用关闭或电脑睡眠不会执行。
- 计划须保存/审核当前资料，冻结 UID 与版本；修改版本、归档、文件变更、失效账号均禁止发布。到期使用冻结账号，不因切换当前账号更换目标。
- 时间为带时区 ISO；服务端校验未来 1 分钟至 30 天，UI 明示本机时区。正常运行期间平台忙则最多等待 5 分钟，超时标已错过。关机/休眠错过则直接标已错过，不使用等待窗口补发。
- 用户点击“确认定时发布”授权该次将来投稿；取消尚未执行计划立即持久保存，已开始复用原停止/核查语义。
- 不向真实平台投稿测试素材；本地 fixture 验证两平台。

## Tasks

- [x] Add backend tests in `scripts/test-import-finished-video.ts` for future/no immediate publish, duplicate request, time bounds, restart/cancel, due frozen account and bytes, stale/archived/media/expired schedule failures, platform busy deferral and unknown result no duplicate.
- [x] Run test before implementation and observe missing scheduled behavior.
- [x] Extend `src/shared/bilibili-publishing.ts` with scheduled state, optional request scheduleAt and record scheduledAt; adapt `src/main/services/video-workflow/bilibili.ts` start, timer dispatch, cancellation and disposal. Instantiate lazy workflow service at app registration so persisted schedules run without visiting video page.
- [x] Add `ScheduledPublishing.tsx` foldout in existing platform panel: datetime-local with timezone text, future bounds, explicit confirmation and approved/current account/settings gates. Display planned time/account/status with existing submission records and allow cancellation, preserve original immediate button placement.
- [x] Extend isolated Electron UI test to create/cancel a schedule via real IPC and fixture account, verify keyboard/themes/viewport, no real uploads; run relevant regressions and build/ESLint/types/design checks.
- [x] Update page spec/migration/verification, inspect diff, restart when no user jobs active. Commit/push feature after verification as part of user's requested code delivery.

## Verification and delivery

2026-10-29：新增集成测试 10/10、既有发布回归 29/29、正常/损坏账号配置 Electron 检查、构建、受影响 ESLint/Prettier、设计检查通过；全仓类型仍为既有 52/82 项错误，受影响模块无新增报错。只读复核的三个问题已修复。重启前配音、工作流与两平台活动任务均为 0；`pnpm dev:launchd` 重启后主窗口于 14:27:06 就绪。测试仅使用本地 CLI fixture，未向真实平台投稿。代码交付在当前 `codex/import-finished-video` 分支进行。
