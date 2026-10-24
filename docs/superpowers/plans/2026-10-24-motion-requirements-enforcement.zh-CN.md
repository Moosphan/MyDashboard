# MG 动效要求执行与修改意见 Implementation Plan

> **For agentic workers:** Use the test-driven-development skill. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让初始粗剪读取创作简报与分镜 HTML 中的 MG/动效要求，并让后续分镜修改后的动效要求继续进入 AI 计划，避免要求只停留在注释中。

**Architecture:** 保留静态 HTML 与动态粗剪分离的边界，新增受控的动效要求提取器和初始计划提示。检测到明确动效要求时，粗剪生成会用已配置的本地 Agent 生成覆盖全部分镜的计划后再渲染；未检测到要求时继续使用默认动效。分镜修改会重新从最新审核分镜和简报提取要求，动效计划不会复用过期输入。

**Tech Stack:** Electron 主进程、TypeScript、React、HyperFrames、Node test runner。

## Global Constraints

- 保持现有人工审核、历史版本和动效修改确认门禁。
- 不执行 HTML 中的脚本、网络资源或注释内容，只把注释作为数据传给受限 Agent。
- 每镜动效计划必须使用真实可见元素选择器，并通过现有 `validateMotionPlan` 校验。

### Task 1: 动效要求提取与提示词

**Files:**
- Modify: `src/main/services/video-workflow/motion.ts`
- Test: `scripts/test-video-workflow.ts`

- [x] 添加失败测试：明确的“每页 MG 动画”和 HTML `MG规划` 注释被提取，普通“动效修改”不误触发；初始提示包含要求和每镜覆盖约束。
- [x] 实现纯函数提取要求与初始/修改提示上下文。
- [x] 运行聚焦测试并确认通过。

### Task 2: 粗剪执行初始动效计划

**Files:**
- Modify: `src/main/services/video-workflow/service.ts`
- Test: `scripts/test-video-workflow.ts`

- [x] 添加失败集成测试：检测到 MG 要求时，粗剪调用本地 Agent，提示包含简报和分镜注释，结果保存为带动效的粗剪；缺少 Agent 时给出明确错误而不静默退回默认方案。
- [x] 实现首次粗剪的自动计划生成，并继续复用已有计划确认和渲染路径。
- [x] 运行视频工作流测试。

### Task 3: 分镜修改后的动效约束

**Files:**
- Modify: `src/main/services/video-workflow/storyboard.ts`
- Modify: `src/main/services/video-workflow/motion.ts`
- Modify: `scripts/test-video-workflow.ts`

- [x] 添加失败断言：单镜 AI 修改的意见真实送达 CLI，初始/修改动效提示包含原始 MG 要求和最新 HTML 注释。真实 UI 点击覆盖此前遗漏的回调与第三参数。
- [x] 补充提示词和结果校验，确保修改后的分镜重新进入动效要求提取，不复用旧 HTML 或旧计划。
- [x] 运行完整工作流、UI、构建和设计检查。全项目类型检查受既有错误阻塞，本次工作流文件无报错。

### Task 4: 记录与交付

**Files:**
- Modify: `docs/design-system/migration.md`
- Create: `docs/design-system/video-workflow-motion-requirements-verification.md`

- [x] 记录输入要求、自动计划、修改后重算和无 Agent 错误路径的验证证据。
- [x] 交付本次修复，保留为未提交修改，不纳入其他工作区改动。
