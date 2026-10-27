# 原创文字造声试听

四款内置声音由本机 VoxCPM2 8-bit 根据原创描述和同一段原创试听文案生成，没有使用参考录音或第三方说话人样本：

- 砚声：温暖沉稳的历史旁白。
- 听澜：柔和自然的女性讲述。
- 知行：明亮利落的男性知识解说。
- 晴语：清爽活泼的女性主持。

`samples.json` 保存描述、seed、模型固定 revision、生成参数、真实时长、采样率与 SHA-256。WAV 为 48 kHz、单声道 PCM16；模型输出经现有 worker 归一化为约 −1 dBFS 峰值。

重新制作：`pnpm exec tsx scripts/generate-voice-design-samples.ts [模型目录] [Python路径]`。本机需已安装项目现有 MLX 运行环境和 VoxCPM2 模型；不下载模型或上传文案。

校验：在项目 MLX Python 环境运行 `python -B scripts/verify-voice-design-samples.py`，检查哈希、时长、有效采样、非静音并用本地 Whisper 核对正文。2026-10-27 四款均完整识别到试听正文，差异仅标点，没有读出声音描述。

“试听内置声音”播放冻结的文件；“使用内置音色”将该样本加入本机“我的音色”，后续可用现有克隆引擎保持音色。选择方案直接文字造声时是描述引导，实际音色会受文本、seed 和模型环境影响，不承诺与内置样本逐次一致。克隆使用的文字记录是试听正文，不包含声音描述。

来源与接口依据：[VoxCPM 官方说明](https://github.com/OpenBMB/VoxCPM#-voice-design)、[MLX Audio](https://github.com/Blaizzy/mlx-audio)、[模型卡](https://huggingface.co/mlx-community/VoxCPM2-8bit)。外部模型权重与 Python 环境独立安装，不随样音分发。
