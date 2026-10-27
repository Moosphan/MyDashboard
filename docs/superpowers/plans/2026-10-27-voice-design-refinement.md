# Voice Design refinement implementation plan

**Goal:** 删除无成品的终态配音任务，修复特征未生效和原始样音混淆，扩展可组合声线与情绪。

**Architecture:** 保留既有 Voiceover 布局及局部控件例外。任务删除只接受 failed / cancelled / interrupted 且无素材的记录；前端以已删除 ID 过滤迟到快照。结构化特征编译为可编辑的 VoxCPM2 描述；情绪强度也是文字引导，独立于后期实际语速和模型采样参数。

**Tech Stack:** Electron、React 18、TypeScript、VoxCPM2 MLX、FFmpeg。

- [x] 先添加并执行失败用例：终态删除及活动/成功任务保护、迟到快照、少女/软音/成熟声线差异、情绪强度和实际语速范围。
- [x] 实现受限任务删除 IPC 与前端同步，保留重试及成功素材回收流程。
- [x] 实现结构化声线/情绪描述、自动应用、原始样音隔离、新种子及实际后期语速，记录原始/处理音频。
- [x] 执行单元、真实模型对比、Electron 操作/键盘/明暗/视口/缩放、类型/构建/设计检查，更新证据和运行应用。

## Sources

- https://github.com/2177302423qqcom-byte/whale-voice/blob/main/docs/speaking.md ：IndexTTS2 八维情绪与预设、音色与 atempo 语速分离；其数值接口不能直接移植到 VoxCPM2。
- https://github.com/OpenBMB/VoxCPM#-voice-design ：无参考 `(description)text`；官方说明生成稳定性有限，可尝试多个结果。
- 已安装 MLX Audio 0.6.1 `voxcpm2.py` 443–445：`instruct` 包装为描述前缀；现有传输路径没有丢失描述。
