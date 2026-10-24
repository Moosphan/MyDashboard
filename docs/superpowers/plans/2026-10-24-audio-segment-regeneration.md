# 配音停顿参数与单段重生成实施计划

**Goal:** VoxCPM2 的 320ms 续说停顿可配置，视频工作流可从单段菜单重新合成所选段。

**Architecture:** 在现有 VoiceOptions 中增加 `promptPauseMs`，默认 320，0 表示关闭，范围 0–1000ms。沿用工作流 generate、任务队列、文件校验、版本和下游失效规则，增加 `audioTrackId` 定位当前完整版本中的单段。保留其他段文件，重新合并音轨、生成字幕并创建待审核版本。原生播放器保持不变，业务动作使用段落右侧现有 Radix 菜单。

**Tech Stack:** Electron / React18 / 现有 Radix 与 Voice 控件 / TypeScript / Python stdlib。

## 约束

- 在 `feature/video_studio_workflow` 现有 worktree 内执行，不改旧 checkout；保留其他未提交修改，不提交代码。
- 遵守设计规范2.0，复用 VIDEO-WORKFLOW-001 与已授权配音局部组件范围，不迁移依赖、主题或播放器。
- 失败/取消保留旧完整音频；执行中不可重复生成；过期音轨不能重生成。
- 分镜内拆成多段时只生成选中的片段，不按 sceneId 全部重做。
- 当前阶段完整产物成功后仍需人工审核；成功使粗剪及后续阶段失效。

## 任务一：停顿参数

Files: `src/shared/voiceover.ts`, `resources/voice-runtime/adapters/voxcpm2.py`, `scripts/test-voiceover.ts`, `scripts/test-voice-runtime.py`。

- [ ] 加入失败测试，验证 VoxCPM2 默认320、支持0/自定义、拒绝非有限数和越界，其他模型拒绝该参数。
- [ ] 类型接口增加 `promptPauseMs?: number`；VoxCPM2 参数解析采用 `number('promptPauseMs', 320, 0, 1000)`。
- [ ] Python 采用 `request['options'].get('promptPauseMs', 320) / 1000` 换算静音帧；0保持原提示。
- [ ] 运行 `pnpm test:voice-runtime`、`pnpm test:voiceover`。

## 任务二：单段生成

Files: `src/main/services/video-workflow/audio.ts`, `src/main/services/video-workflow/service.ts`, `scripts/test-video-workflow.ts`。

- [ ] 失败测试：完整音轨中第二段重生成只调用一次声音引擎；其他段file/text/duration不变；新时长、合并音轨、字幕时间全部更新。
- [ ] `WorkflowGeneration` 和 `createWorkflowAudio` 输入增加 `audioTrackId?: string`。校验只能用于audio、当前非stale完整配音中存在该ID、不得与批量导入并用。
- [ ] `createWorkflowAudio` 建立当前完整版本的片段任务列表，对未选中段直接复用文件；所选段按原片段text生成和规范化。
- [ ] 沿用合并/字幕/300秒验证，生成结果经原 finishJob 保存；任务初始进度保留旧全部片段，更新时复用未修改播放器。
- [ ] 集成测试验证成功新建review版本和下游失效；失败/取消保留旧版本；非法/过期目标在创建任务前拒绝。
- [ ] 运行 `pnpm test:video-workflow`。

## 任务三：参数与菜单界面

Files: `VoiceoverDialog.tsx`, `MediaPanels.tsx`, `StageWorkspace.tsx`, `AudioTrackPlayer.tsx`，均位于 `src/renderer/modules/video/` 下现有组件位置。

- [ ] AI Voiceover 高级参数和工作流配音参数均增加 `VoiceNumber`，标签“参考尾部停顿（毫秒）”，最小0、最大1000、步长10、默认320，只对VoxCPM2显示和传参。
- [ ] AudioPanel 接收 `(fileId: string) => void` 单段回调；StageWorkspace 通过 `workflowCall('generate', {...generationInput(), audioTrackId})` 提交。
- [ ] 段落右侧增加现有 DropdownMenu，菜单项“重新生成此段配音”；当前引擎/音色/参数用于新段，运行中/非完整当前音轨/前置未审核时禁用并说明原因。
- [ ] 不修改原生audio controls、播放互斥、标题/时长/正文顺序，其他段不重新挂载。
- [ ] Electron 回归覆盖参数传递、菜单键盘打开/Escape焦点返回、禁用态、单段替换及失败保留；明暗、1440/1024、200%截图。

## 验证与记录

- [ ] 运行 `pnpm design:check`、`pnpm design:build`、`pnpm build`、受影响源码lint、规范要求的两条tsc命令（记录既有失败）。
- [ ] 在隔离数据库的真实Electron窗口验证；不使用用户生产数据触发生成或覆盖音频。
- [ ] 更新 page-specs-v2.md、migration.md 和本次验证记录，列出未解决项与实际运行结果。

本轮按用户直接实施请求在当前会话顺序完成，不分派代理、不停在计划阶段。
