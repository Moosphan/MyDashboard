# 视频工作流投稿封面验证

日期：2026-10-26。入口：平台发布 → Bilibili → B 站投稿封面。

## 行为与生成配置

- 官网最新双封面比例及尺寸依据见 [封面要求核验](publication-cover-requirements.md)。生成 1600×1200 / 1600×900 PNG，单张 ≤4 MiB。
- AI 代码复用右侧 Codex / Claude；输出双比例静态 HTML，关闭脚本、网络、Node、弹窗与权限，在隔离 Electron 画布截图。设计 JSON 是受管文件，后续修改把当前源码与建议一起传给 Agent。
- Image2 通过本机 `baoyu-imagine/scripts/main.ts` 的 OpenAI provider 调用 `gpt-image-2`，复用其 API、环境变量与配置。Bun 与脚本路径自动发现，也可在“执行环境”调整。不新增密钥表单。需要可用图片 API / 模型额度，可能产生费用；此验证没有真实付费请求。
- Image2 生成 4:3 后规范化尺寸，按中央 y=150–1050 截取 16:9；提示词要求所有关键信息位于安全区。生成质量仍需人工核对文字和构图，可分别放大两版并按建议重生成。
- 成功只新建发布待审核版本，保留成片、文案、分镜、口播、配音及其他平台资料；生成发布文字时保留封面。失败/取消不替换旧版。历史显示生成时间及首次出现的发布版本，选用需保存和重新审核，旧成片封面不能用于新成片。
- 审核、保存、导出及上传检查来源、文件指纹、实际 PNG 尺寸。Catbus 0.2.1 仅一个 `--cover`，自动投稿使用 16:9；发布包另存 `cover-4x3.png`，README 说明在创作中心单独设置首页推荐封面。

## 验证证据

- `pnpm test:video-workflow`：58/58，覆盖双比例数据契约、错误尺寸/格式/大小、生成参数、风格与内容提示、修改建议及过期来源；日志 `/tmp/cover-unit-final.log`。
- `pnpm test:bilibili-publishing`：26/26，两平台原投稿、账号、回执与重试逻辑回归；日志 `/tmp/cover-bili.log`。
- `pnpm test:publication-covers:ui`：真实生产构建 Electron、独立数据目录和假 CLI。覆盖实际双尺寸 PNG、修改后 hash 变化且引用旧设计、其他阶段和平台不变、错误输出和取消保留、Image2 实际 CLI 参数、历史切换保存、来源拦截、审核导出双图与上传快照选择。无真实生成收费或投稿。
- 同一 UI 测试覆盖 light/dark、1440/1024、200% 缩放、Tab/Space/方向键/Enter/Escape 和焦点返回；最终日志 `/tmp/cover-ui-final.log`，截图目录由 `PUBLICATION_COVERS_OK` 行给出。使用可访问名称、状态文本及原有 WorkflowDialog；现有桌面信息顺序和审核布局保留。
- macOS arm64 `electron-builder --mac --dir` 打包运行通过；独立用户目录中实际完成代码封面生成、实际双图尺寸检查、明暗预览、键盘开关和焦点返回，检查强制高对比及 reduced-motion。日志 `/tmp/cover-package-final.log`、`/tmp/cover-packaged-smoke.log`，截图目录由 `PACKAGED_PUBLICATION_COVERS_OK` 行给出。测试构建未签名，不作为发布安装包。
- `pnpm design:check` 与 `pnpm design:build`：通过，日志 `/tmp/cover-design-check.log`、`/tmp/cover-design-build.log`。设计检查仅代表设计资产合同。
- `pnpm exec tsc -b --pretty false` 仍为 82 项既有诊断，按文件/错误内容与 `/tmp/douyin-types-final.log` 基线比对无新增；renderer 单独检查仍为 52 项。日志 `/tmp/cover-types-final.log`、`/tmp/cover-web-types.log`。本次变更的 src 文件 ESLint 与 Prettier 检查通过，日志 `/tmp/cover-lint.log`、`/tmp/cover-format.log`。
- 现有 `test:bilibili-publishing:ui` 首轮在鼠标焦点断言失败；重跑已通过视频预览、B 站及抖音发布、账号和回执流程，但在该脚本第 496 行等待工具箱“管理工具”可用时超时（`/tmp/cover-bili-ui-retry.log`）。未将此跨页脚本记为整体通过，也未改动工具箱。封面专项 Electron 与打包运行均独立通过。
- 本次受影响页面沿用 `VIDEO-WORKFLOW-001` 局部例外，不宣称生产全面完成 HeroUI 迁移或完整 WCAG 审核。

## 状态检查

旧项目截帧、首次生成、执行中、成功待审核、未保存修改、无效输出、取消、文件缺失、旧成片历史、预览加载失败均有状态或错误反馈。关闭预览不取消任务，任务从右侧执行记录取消；没有隐式投稿或自动审核。

## 修改建议排版修订

2026-10-26 根据用户截图，将修改建议从预览右侧移到预览行下方，输入框通栏并与标题、缩略图左缘对齐；右侧生成方式和说明顶部对齐，保持原控件和输入状态。封面专项生产构建 Electron 回归通过，包含明暗主题、1440/1024、200% 缩放和键盘；日志 `/tmp/cover-feedback-layout-ui.log`。macOS arm64 打包实际运行通过，额外核对输入框位于预览下方、左缘及宽度与内容区一致、可填写修改建议；日志 `/tmp/cover-feedback-package.log`、`/tmp/cover-feedback-packaged-smoke.log`。设计检查/构建与组件 ESLint/Prettier 通过；renderer 类型检查仍为 52 项既有诊断（`/tmp/cover-feedback-web-types.log`）。开发窗口已收到此组件热更新。

## 紧凑布局、比例与文件定位最新修订

2026-10-26 用户再次指出右侧留白、疑似补边、原图弹窗无法切换及缺少文件定位。截图处仍是原成片截帧（按钮为首次生成，尚无独立封面），根因为原 16:9 截帧被固定放在 4:3 的 `contain` 框内，并且比例控件仅在生成封面存在时渲染。

- 方式和短说明合并一行；下方为 120–200px 自适应缩略图与修改建议并排，空间不足才换行。缩略图与放大图均按所选比例展示，无额外补边。显示“成片截帧 / 独立封面”及真实像素，区分文件与裁切预览。
- 原截帧默认 16:9，弹窗也提供 4:3 切换并明确仅居中裁切预览、不改上传文件。生成封面切换真实 1600×1200 / 1600×900 文件；AI 代码两图独立渲染，根节点强制零 margin/padding，内层文字保留安全边距。Image2 仍按既有安全区生成/裁切规则。
- 缩略图和弹窗文件夹图标复用受管文件校验 IPC，定位当前所见的比例文件；原截帧的裁切预览定位其原文件，不伪造新的 4:3 文件。异常就近反馈，按钮有可访问名称、tooltip、pending 防重复。
- 新增行为先在旧构建运行失败（`/tmp/cover-compact-red.log`），修复后 `pnpm test:publication-covers:ui` 通过（`/tmp/cover-compact-ui.log`）。覆盖未生成/已生成两种状态、两种比例真实显示尺寸、PNG 实际尺寸、两处定位返回路径、历史/修改/导出/投稿，以及明暗主题、1440/1024、200% 和键盘焦点。
- `pnpm test:video-workflow` 58/58（`/tmp/cover-compact-unit.log`）；设计检查/构建通过（`/tmp/cover-compact-design-check.log`、`/tmp/cover-compact-design-build.log`）；变更组件 ESLint/Prettier、差异空白检查通过。全项目仍为 82 项既有类型诊断，内容比对无新增，renderer 仍 52 项（`/tmp/cover-compact-types.log`、`/tmp/cover-compact-web-types.log`）。
- macOS arm64 打包运行通过，并在真实打包窗口核对并排布局、输入保留、定位路径、明暗比例预览、焦点返回、高对比和 reduced-motion；日志 `/tmp/cover-compact-package.log`、`/tmp/cover-compact-packaged-smoke.log`。截图目录由两项专项日志的成功行给出；开发界面已热更新，无真实付费生成或投稿。

## 封面生成报错与弹窗最新修订

2026-10-26 用户截图中的“请选择需要生成发布资料的平台”来自旧 Electron 主进程的发布资料校验。开发主进程 PID 76016 从当日 00:57 一直运行，封面功能新增后日志只有 renderer HMR；旧代码对所有 publish 请求执行 `publicationOptions`，新界面发送的独立 cover 请求因此被错误归类。当前服务已区分封面与发布资料生成，专项真实 IPC 验证可以生成封面而不提交 publication 参数。

- 确认真实用户库没有 queued/running 工作流任务后，完整重启当前 launchd 开发应用，让新界面与封面服务同时生效。启动说明明确 renderer HMR 不会更新 main/preload，后台变更后保存草稿并重新运行 `pnpm dev:launchd`。试验 `--watch` 时发现 electron-vite 不等待旧进程退出即启动新实例，而现有 Electron 退出流程会滞留，因此不保留该配置；沿用已有启动脚本的旧进程清理机制。证据为 `/tmp/cover-modal-dev-restart.log` 及 `.dev-logs/launchd.out.log`。未在用户项目中启动额外生成任务。
- 主区取消常驻生成方式和修改建议，改为缩略图加状态、规格及历史选用的紧凑组合；生成按钮打开既有 WorkflowDialog，方式、费用说明、修改建议和开始按钮集中在弹窗。打开/取消不创建任务，关闭保留建议并返回触发器，启动失败保留输入且可重试，任务受理后关闭。预览比例、历史、文件定位及审核流程保留。
- 新弹窗行为先在旧构建失败（`/tmp/cover-modal-red.log`）；真实 Electron 验证通过（`/tmp/cover-modal-ui-final.log`），额外覆盖 Image2 缺少 Bun 配置时不创建任务、保留弹窗/建议、恢复配置后重试，以及第二版通过弹窗提交修改建议。代码与 Image2 均使用本地测试执行器，无真实收费或投稿。
- 截图发现 1024px 下摘要 grid 的隐式最小轨道会溢出主栏，新增元素边界断言先失败（`/tmp/cover-modal-bounds-red.log`）；将该轨道设为 `minmax(0, 1fr)` 后通过。明暗 1440/1024、生成/预览弹窗、主区及弹窗 200% 缩放、Tab/Space/方向键/Enter/Escape 和焦点返回均已覆盖。截图目录 `/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/publication-cover-ui-6T9K8I`。
- `pnpm build`、组件 ESLint/Prettier、shell 语法及差异空白检查通过；`pnpm design:check` / `pnpm design:build` 通过（`/tmp/cover-modal-design-check-final.log`、`/tmp/cover-modal-design-build-final.log`）。全项目类型检查仍为 82 项既有诊断，忽略行号后与既有基线一致；renderer 仍为 52 项（`/tmp/cover-modal-types.log`、`/tmp/cover-modal-web-types.log`）。
- 最终 macOS arm64 打包运行通过：弹窗输入保留、实际生成双比例文件、主区无常驻输入、摘要在主栏边界内、明暗 1440/1024、预览、定位、焦点返回、高对比与 reduced-motion；日志 `/tmp/cover-modal-package-final.log`、`/tmp/cover-modal-packaged-final-smoke.log`，截图目录 `/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/publication-cover-packaged-suzeGc`。测试包未签名，沿用 VIDEO-WORKFLOW-001 局部组件例外。

## Image2 下载超时排查（2026-10-26）

- 用户任务 `1f8cc6d8-8e4d-4df2-a383-e1ee051102c8` 从 14:59:45 到 15:14:45，恰为主进程 900000ms 超时。鉴权与编辑接口参数校验正常；用原项目提示词与截帧实际请求后，`/v1/images/edits` 返回 200，再请求 `oss.codexzh.com` 图片链接。下载测试可出现仅约 1.7 KiB/s 的传输、正文停顿和中断；生图成功与图片下载是不同阶段，不能将模型列表 200 当作完整生图验证。
- 试验网关 `response_format=b64_json` 后仍收到 URL，故已撤回本地该配置及试验代码，不宣称绕过 OSS。一次实际调用已完整取得 1448×1086 PNG，校验后规范化为 1600×1200 和中央裁切 1600×900，单张均小于 4 MiB。
- 本机 `/Users/dorck/.codex/skills/baoyu-imagine/scripts/providers/openai.ts` 对返回 URL 的下载增加每次 120 秒、最多 5 次尝试、保留已收到字节并用 Range/If-Range 续传；服务忽略 Range 返回 200 时清空旧片段重新下载，异常范围不拼接。真实下载复测中前 3 次已从 442368 字节续传至 2225869 字节，仍未下完 2501755 字节，因此增至 5 次以覆盖本次观测速度；真实网络完成时间仍取决于下载站点。`scripts/main.ts` 不再因下载失败自动重复付费生图。此为本机技能补丁，升级技能时需保留或上游合并；网络持续拥塞仍可能失败，不能保证第三方接口可用性。
- 工作流 `covers.ts` 保留脱敏后的具体错误，区分超时和“图片已生成，但下载失败”；不再统一吞成 API 配置/额度提示。`process.ts` 支持 stderr 进度和超时诊断保留，封面任务将下载/重试映射为明确阶段，不把原始凭据写入阶段文案。回归覆盖 HTTP 503 细节、密钥脱敏、失败保留旧封面、超时保留下载阶段。
- 本机技能测试 27/27（`/tmp/image2-download-green.log`），包含中断后字节续传、If-Range、有限重试和不自动再生图。工作流串行回归 60/60（`/tmp/image2-recovery-unit-serial.log`），生产构建 Electron 封面专项通过（`/tmp/image2-recovery-ui-final.log`）；ESLint、Prettier 和差异空白检查通过。并行构建/启动时，既有 MG 和模板测试的 2 秒轮询曾未等到任务结束，不改动这些无关断言；停止并行负载后完整回归通过。全项目仍 82 项既有类型诊断，忽略行号与基线一致。无 renderer 控件或布局改动。
- 已将实际生成结果复用入用户项目 `fd8b6e13-5350-472c-a0b4-57d362dda664`，新增平台发布 v2 待审核及成功执行记录 `36438fe5-3194-4239-bbe7-1595f88c6136`，意见明确说明“恢复已生成并下载的封面，不重复调用生图接口”。保留先前两条失败记录，其他七阶段 ID 与抖音资料核对未变；证据 `/tmp/image2-recovered-artifact.log`。本轮确实使用实际图片 API 排查，不属于纯模拟验证。
