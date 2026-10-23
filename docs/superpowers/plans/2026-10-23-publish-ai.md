# 发布资料 AI 生成实施计划

**Goal:** 按当前平台生成吸引人的标题、简介和标签，支持修改要求、多次生成、人工编辑和审核。

**Architecture:** 复用 WorkflowGeneration、CLI 子进程、任务日志和修订仓库。发布专用提示词只使用已审核内容；每次只替换选定平台，另一平台保持原值，结果生成待审核新版本，失败不覆盖。

**Tech Stack:** Electron、React 18、现有 Button/Voice 字段、SQLite；沿用 VIDEO-WORKFLOW-001，不引入依赖或改变布局。

## Tasks

- [x] 在 `scripts/test-video-workflow.ts` 添加真实仓库/子进程测试：前置审核门禁、平台隔离、提示词上下文、重复生成、失败保留和历史版本。运行 `pnpm test:video-workflow`，观察发布任务尚不支持的失败。
- [x] 新建 `src/main/services/video-workflow/publish.ts` 构建发布提示词/请求校验；扩展 `service.ts` 接入发布任务与完整发布 JSON 导出。输出以 `validatePayload('publish', ...)` 校验，保留平台字数和标签限制。
- [x] 扩展 `StageWorkspace.tsx` 与 `MediaPanels.tsx`：当前平台 AI 生成入口、可折叠修改要求、本地执行器、真实加载/禁用、未保存草稿保护和审核提示；保留平台→共用成片→资料顺序。
- [x] 在 `scripts/test-video-workflow-ui.cjs` 运行真实 Electron 测试，覆盖点击生成/重试、锁定、失败保留、平台切换、明暗1440/1024/200%与键盘。先观察新入口缺失，再实施 UI。
- [x] 更新 page-specs/migration/验收记录；运行受影响 lint、格式、类型基线比较、build、design:check/build，确认后台空闲后重启应用。无提交、合并、推送或生产数据修改。
