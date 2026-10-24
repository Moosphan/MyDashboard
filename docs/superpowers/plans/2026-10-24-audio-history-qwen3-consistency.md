# 分段配音版本历史与 Qwen3 一致性修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为视频工作流的分段配音提供带版本号和生成时间的历史查看、切换能力，并修复 Qwen3-TTS 单段重生成因固定种子导致异常音色稳定复现的问题。

**Architecture:** 复用现有 `video_workflow_revisions` 的阶段版本记录，不新增重复的音频版本表；在音频面板中选择历史音频 payload，只有依赖仍匹配当前口播的版本可以恢复为新当前版本。生成时保留基础种子，但按片段稳定派生种子；单段重生成使用新的任务盐值，使异常片段不会因固定 `42` 永远复现，同时仍保持同一音色档案、模型和参数。

**Tech Stack:** React 18、Radix 现有控件、Electron IPC、TypeScript、SQLite better-sqlite3、Node test runner、Qwen3-TTS MLX runtime。

## Global Constraints

- 遵守 `docs/design-system/spec-v2.md`、`docs/design-system/page-specs-v2.md`，本次沿用现有工作流控件并记录局部例外。
- 不修改原始参考音频；Qwen3 必须继续使用冻结的音色档案版本和准确参考文本。
- 历史版本只能引用受管文件；恢复过期依赖的音频必须拒绝。
- 失败或取消的单段重生成不得覆盖当前完整音频版本。
- 先写失败测试并确认失败，再实现生产代码。

### Task 1: 锁定 Qwen3 片段种子行为

**Files:**
- Modify: `src/main/services/video-workflow/audio.ts`
- Test: `scripts/test-video-workflow.ts`

**Interfaces:**
- `createWorkflowAudio` 接收原始工作流音色参数，生成请求使用基础种子和稳定片段索引派生值。
- 同一完整生成任务对同一片段得到稳定种子；新的单段重生成任务得到不同任务盐值。

- [ ] **Step 1: Write the failing test**

在现有 `workflow cloning freezes one resolved seed...` 测试中断言同一完整任务的不同片段种子可复现但不相同，并增加两个不同 `job.id` 的单段重生成请求种子不同。

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:video-workflow`

Expected: the new seed assertions fail because every request currently uses the same `42` or caller seed.

- [ ] **Step 3: Write minimal implementation**

在 `audio.ts` 增加无外部依赖的稳定字符串哈希，将 `baseSeed` 与 `job.id`、片段序号和文本组合后映射到 `0..0xffffffff`；保留 Edge 不带本地随机种子的行为。Qwen3 和 VoxCPM2 都使用派生值，保证同一片段的声学条件不会被其他片段共享同一个随机流。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:video-workflow`

Expected: all existing tests pass，新增断言通过，Qwen3 单段重生成不再固定复现同一采样。

### Task 2: 增加音频历史选择与安全恢复

**Files:**
- Modify: `src/main/services/video-workflow/service.ts`
- Modify: `src/main/database/repositories/video-workflow-repository.ts`
- Modify: `src/main/ipc/video-workflow.ts`
- Modify: `src/renderer/modules/video/workflow/StageWorkspace.tsx`
- Modify: `src/renderer/modules/video/workflow/MediaPanels.tsx`
- Modify: `src/shared/video-workflow.ts`
- Test: `scripts/test-video-workflow.ts`

**Interfaces:**
- 新增 IPC 操作 `workflow:restoreAudioVersion(projectId, revisionId, expectedRevision, requestId)`。
- 服务方法验证目标版本属于当前项目的 `audio` 阶段、文件仍受管、依赖指纹等于当前口播依赖，然后复制 payload 创建新的 `review` 音频版本。
- 音频面板接收当前项目和恢复回调，历史选择只改变预览；确认切换后生成新当前版本并使粗剪及后续阶段失效。

- [ ] **Step 1: Write the failing test**

在工作流测试中构造两个音频版本，断言 `restoreAudioVersion` 能按版本 ID 创建新版本、保留创建时间和旧版本历史；同时断言跨项目、缺失文件和依赖过期版本均被拒绝，当前音频 payload 不被修改。

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:video-workflow`

Expected: `workflow:restoreAudioVersion` 不存在，测试以“未知工作流操作”或缺少服务方法失败。

- [ ] **Step 3: Write minimal implementation**

在 repository 中增加仅供音频使用的 `restoreRevision` 事务封装，复用已有版本号、依赖计算、失效下游和 CAS 检查；在 service 中先 `verifyPayload` 再调用 repository；IPC 注册操作并让 `StageWorkspace` 将结果刷新回当前项目。

- [ ] **Step 4: Add the history UI**

在 `AudioPanel` 增加音频版本选择器，选项显示“当前 vN”或“历史 vN · YYYY/MM/DD HH:mm:ss”；历史 payload 用于试听和段落列表，过期版本显示不可恢复原因。提供“切换为当前版本”按钮，切换期间禁用生成、审核和单段重生成。

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test:video-workflow && pnpm build`

Expected: 版本恢复测试、现有工作流测试和生产构建全部通过。

### Task 3: 增加 Qwen3 诊断信息与回归覆盖

**Files:**
- Modify: `resources/voice-runtime/adapters/qwen3.py`
- Modify: `resources/voice-runtime/worker.py`
- Modify: `src/main/services/voiceover/python-adapter.ts`
- Test: `scripts/test-voice-runtime.py`
- Test: `scripts/test-video-workflow-ui.cjs`
- Create: `docs/video-workflow-audio-history-qwen3-verification.md`

**Interfaces:**
- Qwen3 请求保持 Base 模型的 `ref_audio + ref_text` 克隆路径，不传 preset speaker。
- 生成元数据记录片段种子、音色档案版本、参考 SHA-256 和 Qwen3 采样配置，便于定位某一段是否使用了错误参考。

- [ ] **Step 1: Write the failing test**

扩展 Python 适配器测试，断言 Qwen3 请求收到 `ref_audio`、`ref_text`、语言和派生种子；扩展 UI 测试，断言音频版本选择器显示时间/版本，并能触发恢复 IPC。

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -B scripts/test-voice-runtime.py && pnpm exec electron scripts/test-workflow-audio-controls.cjs`

Expected: 新增诊断字段和历史控件断言失败。

- [ ] **Step 3: Write minimal implementation**

保持 Qwen3 Base API 的 `model.generate` 调用，显式传入 `lang_code`、`temperature`、`max_tokens`，并在 worker 事件/生成元数据中记录最终请求摘要；不要把参考文本当作目标文本，也不要传 `voice` 参数。

- [ ] **Step 4: Run focused validation**

Run: `pnpm test:voice-runtime && pnpm test:video-workflow && pnpm build && pnpm design:check && pnpm design:build && git diff --check`

Expected: 所有聚焦测试、构建、设计检查和差异检查通过；记录当前无法在未安装本地 Qwen3 模型的环境中完成真实女声相似度试听。
