# VoxCPM2 文字造声验证 · 2026-10-27

## 能力与边界

官方 README 明确 Voice Design 不需要参考音，通过 `(description)text` 控制声音。本机已安装 MLX Audio 0.6.1 的 VoxCPM2 `generate(instruct=...)` 实现相同格式，因此复用现有 VoxCPM2 模型，无需升级运行环境或下载新模型。参考：[官方接口](https://github.com/OpenBMB/VoxCPM#-voice-design)。

设计描述独立于配音正文和 300 字符限制，最多 600 Unicode 字符，仅 VoxCPM2 接受。设计请求不能同时携带参考音色，不能开启参考降噪；原克隆路径继续校验音色版本和文件 SHA-256。设计任务沿用排队、取消、失败重试、素材登记和元数据，记录完整描述 / seed / 模型来源，界面不显示伪造进度。

四款原创预设及真实 WAV 随应用资源分发；描述方案可编辑和本地保存。内置样音可直接加入“我的音色”，同原始样本重复操作返回已有音色。自定义造声完成后可将 3–30 秒完整短句保存为冻结参考，直接在现有视频工作流中使用。模型接受描述是风格指导，不承诺任意声音或数值化声学精度；跨正文生成不保证只凭描述 / seed 完全保持身份。

## 自动与真实模型验证

- 修复前：无参考请求被 `REFERENCE_INVALID` 拦截，Python adapter 读取不存在的 `referencePath`，真实 Electron 不存在文字造声模式。均先记录失败再实现。
- 配音测试 33/33、Python adapter 测试 5/5、工作流测试 67/67 通过。新增覆盖描述 / 正文分离、拒绝不支持引擎、空白 / 超长描述、混合参考音 / 降噪、无参考任务登记、设计元数据和方案持久化。
- 真实本地模型生成四款 48 kHz PCM16 样音，时长分别 7.20 / 7.52 / 4.64 / 6.88 秒。SHA-256、有效波形、非静音通过；本地 Whisper 对四款均完整识别到原创试听正文，仅标点不同，无描述外读。记录 `/tmp/voice-design-sample-qa.json`，可由 `scripts/verify-voice-design-samples.py` 重现。
- `scripts/smoke-voice-design.ts` 通过完整 VoiceoverService / 本地运行环境 / worker 生成原创短句，成功登记音频、保存声音方案并转为真实音色；转存的参考文字等于配音正文，音频可读。使用临时数据，未改用户项目。结果：`/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/voice-design-smoke-WgB8mR/result.json`。
- 真实 Electron 回归 `scripts/test-voice-design-ui.cjs`：无参考生成参数、内置真实音频试听、加入我的音色及重复去重、方案持久化、失败输入保留、文案生成、明暗主题、1440/1024、200% 缩放、原生 Escape 关闭和焦点返回通过。截图目录：`/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/voice-design-ui-WJCZJn`。启动失败为传输边界替身；样音、保存与音色导入使用真实 IPC / 文件 / 数据库。
- 早期 Escape 回归误用了 `.voiceover-dialog`，匹配到视频页外层同名类，导致关闭成功后仍误报；改用 `[role=dialog].voiceover-dialog` 后原生键盘验证通过，无需修改产品 Escape 行为。
- 应用构建、受影响生产代码 ESLint、`pnpm design:check` 和 `pnpm design:build` 通过。全量 `tsc -b` 仍有 82 条原有诊断，受影响配音文件未出现诊断；不宣称全量类型通过。设计构建有既有大 bundle 提示。
- macOS arm64 目录包构建通过，`Contents/Resources/voice-design` 四款样音与 manifest 的 SHA-256 一致；未进行安装包 UI 验收。开发应用已通过 `pnpm dev:launchd` 重启并加载新接口，日志确认窗口就绪。

## 特征与任务删除修订

用户反馈“特征相似”后追踪 renderer → IPC → Python → MLX：描述完整传入 `generate(instruct=...)`，没有丢参数。已证实的交互问题是修改特征仍需点应用、修改后还可使用原始内置声音，以及旧样音在编辑后继续播放。现在自动编译描述、自定义状态隔离原始样音，编辑参数停止并清空原始样音，新种子用于显式探索。最近生成不再只匹配描述，还匹配 seed / 步数 / CFG / 增益 / 实际语速。

参考 [whale-voice 的 speaking 文档](https://github.com/2177302423qqcom-byte/whale-voice/blob/main/docs/speaking.md)，其八维情绪向量属于 IndexTTS2，无法作为 VoxCPM2 数值参数直接接入。本轮借鉴其情绪组合与音色 / 后期语速分离方式，独立编写十种情绪描述组合、八项 0–3 强度、七种声线配方及十类声音特征；不声称向量控制、精确音高或软糯程度保证。VoxCPM 官方也声明设计结果有随机性，跨片段固定音色仍建议冻结样本。

新增回归先失败后实现：无删除接口 / 迟到快照复现记录 / 不支持实际语速 / 方案丢失语速 / 旧样音未清空；配音测试扩至 38/38。删除只允许 failed / cancelled / interrupted 且 assetId 为空，活动 / 成功任务受保护，删除幂等；前端过滤迟到事件和快照。真实 FFmpeg 正弦波测试确认 0.8 倍只改变时长，音高约 440 Hz，原始文件逐字节保留。

真实模型对比：`scripts/smoke-voice-design-contrasts.ts` 经完整 VoiceoverService，使用同正文 / seed 23456 / 20 步 / CFG 2，分别生成动漫软音与成熟男声。`scripts/verify-voice-design-contrasts.py` 验证两份原音 SHA 不同、48 kHz、有效非静音；本地 Whisper 转写均与正文一致，仅标点不同。自相关估测基频中位数约 340.4 Hz / 134.5 Hz，仅为这两个样本的客观差异，不据此保证主观软糯听感。软音 0.85 倍后处理由原始 4.160 秒变为 4.874 秒，估测音高不变。结果 `/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/voice-design-contrasts-L3I2Wv/results.json`，报告 `/tmp/voice-design-contrasts-qa.json`。

工作流回归 67/67、Python adapter 5/5、构建、受影响 ESLint、设计检查 / 设计构建通过。全量类型检查仍为 82 条既有诊断，renderer 单独检查 52 条，受影响配音文件无诊断；不宣称全项目类型通过。

最终真实 Electron 回归覆盖删除确认 / 保留、三种终态真实 IPC 删除、自动特征 / 少女软音 / 情绪键盘调节、新 seed / 实际语速请求、内置样音真实播放以及编辑后停止 / 清空、方案保存 / 音色导入、失败输入保留、明暗主题 / 1440 / 1024 / 200% 缩放 / Escape 和焦点返回。截图目录：`/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/voice-design-ui-gIe8Le`，生成启动失败仍为测试替身。

macOS arm64 目录包重新构建成功，并实际启动安装包运行 `scripts/test-voice-design-package.cjs`：打包后的配音 IPC、四款内置真实 WAV、原始样音标识、自定义编辑停止 / 清空样音、八项情绪控件通过；使用临时用户目录，截图与日志位于 `/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/voice-design-package-pktVed`。包无代码签名，不代表已验证签名安装流程。

开发应用已重启加载修订接口，启动日志确认 `2026-10-27T06:37:23Z window:ready-to-show`；重启前只读确认用户数据库无进行中的配音 / 视频任务。本轮未提交推送，也未删除用户已有的失败任务，删除由用户逐项确认触发。

## 重现命令

`pnpm test:voiceover`、`pnpm test:voice-runtime`、`pnpm test:video-workflow`。

先 `pnpm build`，再 `pnpm exec electron scripts/test-voice-design-ui.cjs`。

真实模型：`ELECTRON_RUN_AS_NODE=1 pnpm exec electron --import tsx scripts/smoke-voice-design.ts`。会占用本机模型计算资源，使用临时数据库。

对比造声：`ELECTRON_RUN_AS_NODE=1 pnpm exec electron --import tsx scripts/smoke-voice-design-contrasts.ts`；使用本地 MLX Python 运行 `scripts/verify-voice-design-contrasts.py <results.json>` 验证音频、转写和估测音高。

安装包回归：`node scripts/test-voice-design-package.cjs /absolute/path/MyDashboard.app`，使用独立临时用户目录，完成后退出该测试进程。

本轮未提交或推送代码，没有修改并行进行的素材画册内容。
