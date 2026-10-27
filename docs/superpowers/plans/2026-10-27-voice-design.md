# VoxCPM2 Voice Design Implementation Plan

**Goal:** 在 AI 配音面板通过文字描述造声，提供原创内置试听、定制方案持久保存及生成后音色复用。

**Architecture:** 复用现有本地任务队列、VoxCPM2 MLX 0.6.1、音频素材和音色存储。新增可选 voiceDesign 描述，设计模式不读取参考音、不执行参考降噪；声音方案是描述和固定 seed，生成样本可另存为冻结参考音色，供视频工作流复用。

**Tech Stack:** Electron / React 18 / 现有 Radix 与 Voice 控件（VIDEO-WORKFLOW-001）/ Python MLX。

## Constraints

- 保留配音 / 我的音色 / 本地模型标签、304px 任务栏、现有文案及播放器布局。
- 正文仍最多 300 Unicode 字符，声音描述单独校验且仅 VoxCPM2 接受；不同时接受参考音与造声描述。
- 文字指令是模型风格指导，不承诺精确声学数值或任意声音；跨段一致性用试听后冻结音色。
- 本轮不提交其他正在进行的素材画廊改动，不自动提交代码或覆盖用户项目。

## Steps

- [x] 在 `scripts/test-voiceover.ts` 与 `scripts/test-voice-runtime.py` 先复现无参考造声失败；验证错误引擎、空描述、超长描述、混合克隆参数、队列及生成元数据。
- [x] 修改 `src/shared/voiceover.ts`、`voiceover/python-adapter.ts`、`job-manager.ts`、`resources/voice-runtime/{worker.py,adapters/voxcpm2.py}`：独立设计路径，使用已核实的 MLX instruct 参数，保留原克隆逻辑。
- [x] 新增共享原创方案 catalog 与 `voiceover/design-store.ts`，在 `tts-service.ts` 接入方案列表 / 保存 / 试听 / 保存生成声音为音色；限定受管文件与成功任务。
- [x] 本机模型生成至少四款不同风格的真实样音，保存 WAV、生成参数和来源说明，加入 Electron extraResources。
- [x] 新增 `VoiceDesignPanel.tsx` 并接入 `VoiceoverDialog.tsx` 第三种配音方式：预设选择、试听、声音特征编辑、说明、保存方案；复用原文案、任务与播放器。
- [x] 运行 Python、配音、工作流回归；真实 Electron 验证无参考生成请求、预设试听、保存、失败输入保留、明暗 / 1440 / 1024 / 缩放 / 键盘；构建、设计检查及类型检查记录边界。
- [x] 更新页面规格、migration 和验证记录，在运行应用中加载功能。

## Primary sources

- https://github.com/OpenBMB/VoxCPM#-voice-design ：无参考声音描述格式。
- 本机 `mlx_audio/tts/models/voxcpm2/voxcpm2.py` 0.6.1：`generate(instruct=...)`，将描述包装为 `(instruct)text`，无 ref/prompt 时走 Voice Design。
