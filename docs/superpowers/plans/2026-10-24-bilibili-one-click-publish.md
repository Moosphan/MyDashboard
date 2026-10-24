# Bilibili One Click Publishing Implementation Plan

> Execute sequentially in the existing `feature/video_studio_workflow` worktree. No commits, branch changes or real account publication are part of implementation verification.

**Goal:** Publish an approved final video to an explicitly connected Bilibili account from the existing publishing panel and persist the real submission receipt.

**Architecture:** A fixed-version Catbus subprocess adapter owns authentication and platform requests. A separate durable publishing service freezes approved inputs, serializes submissions, prevents duplicate intents and preserves unknown outcomes. Existing metadata generation, export and manual receipt paths remain available.

**Tech Stack:** Electron, TypeScript, SQLite, Catbus CLI 0.2.1. Existing React 18/Radix workflow UI follows the already approved VIDEO-WORKFLOW-001 exception; no global theme or dependency migration.

## Constraints

- Read design specification 2.0 and actual workflow page contracts before UI changes; preserve field order, columns and review placement.
- Explicit account UID, category, copyright and visibility; no inferred publishing account or category.
- Publishing returns reviewing, never immediate public success. Unknown outcomes require reconciliation and cannot be automatically retried.
- Cookie files live outside backed-up media; errors and progress never expose raw credentials or CLI stderr.

## Tasks

- [x] Add failing adapter/service tests using a local fake CLI and migrated temporary SQLite database. Cover approved inputs, account mismatch, category validation, successful BV receipt, duplicate clicks, post-submit uncertainty, restart recovery and frozen history.
- [x] Add typed publishing requests/status, migration 38 and durable publication records. Persist intent and request identity separately from generation jobs.
- [x] Add structured Catbus process handling, explicit runtime/version checks, safe argument arrays and isolated CATBUS_HOME; implement QR login/status/cancel and categories.
- [x] Add one click publishing, durable state updates, cancellation/disposal and exact-BV status refresh through explicit IPC channels.
- [x] Add connection, required publishing settings, action and task receipt UI inside the existing publishing panel; extend runtime configuration for Catbus.
- [x] Run focused tests, workflow regression, type checks, design checks/build, production build and Electron UI checks. Record actual evidence and limits in the design verification/migration documents.

## Validation

Focused adapter/service tests run with Electron's Node ABI and a fixture CLI, never a real publishing account. Existing `pnpm test:video-workflow` verifies generation/export compatibility. UI tests use temporary userData, generated media and fixture CLI, exercise keyboard selection and screenshots in light/dark, 1440/1024 and 200% zoom. Required checks: `pnpm design:check`, `pnpm design:build`, `pnpm exec tsc --noEmit -p tsconfig.web.json`, `pnpm exec tsc -b --pretty false`, `pnpm build`, plus main/preload type checks if not covered by project references. Real Bilibili platform acceptance remains a separately identified verification limit unless an actual account submission is explicitly requested.
