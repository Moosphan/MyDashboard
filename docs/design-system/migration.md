# 设计规范 2.0 迁移台账

当前权威：[设计规范 2.0](spec-v2.md)。以下表格记录当前交付边界；下方“历史台账”只保留溯源，不约束新代码。

用户修订已纳入设计稿：现有主题适配、桌面布局恢复、HeroUI 自带图标与经确认的 Heroicons 补充。生产主题桥、图标和完整业务状态仍待分阶段迁移。[交互审核](interaction-audit-v2.md) 的待决项在对应功能开发前须确认。

| 阶段         | 范围                                                                   | 状态 / 退出条件                                       |
| ------------ | ---------------------------------------------------------------------- | ----------------------------------------------------- |
| 设计交付     | 真实 HeroUI 多页面设计稿、页面规格、规范 2.0、入口 / AGENTS / CI       | 本轮交付，证据见 verification-v2.md                   |
| 独立技术验证 | v2/ 内 React19 / Tailwind4 / HeroUI3.2.6                               | 独立构建与交互验证；不等于整个 A 阶段或 Electron 通过 |
| 生产底座     | 依赖、构建、legacy 变量隔离、主题桥、路由 / Toast / 中文适配           | 待实施；按采纳提案 B 阶段和实际 Electron 试点验收     |
| 优先页面     | Voiceover → AI Lab                                                     | 待实施；保留数据、克隆、降噪、任务恢复、试听与用量    |
| 全局收敛     | Dashboard / Writing / Video / Insights / Toolbox / Settings / 其他浮层 | 待实施；每页状态、明暗、键盘与业务验收后登记          |
| 工作台接入   | 将已验证基础示例接入现有 Toolbox 入口                                  | 待实施；设计资产 v2/ 不作为新的生产文档站             |

| ID              | 具体范围                                                | 理由                                     | 负责人          | 退出里程碑                        |
| --------------- | ------------------------------------------------------- | ---------------------------------------- | --------------- | --------------------------------- |
| LEGACY-UI-001   | 当前 src/renderer 中尚未迁移的共享 UI 与业务控件        | 存量 React18/TW3，不在设计交付中全量升级 | renderer 维护者 | 按提案 B–E 分页清理，每次缩小路径 |
| DESIGN-DEMO-001 | docs/design-system/v2/src/main.tsx 的示例数据与任务模拟 | 设计交付独立于生产 IPC，明确标注演示     | 设计系统维护者  | 生产页面迁移时用真实业务验证替代  |
| SYSTEM-FILE-001 | 系统文件选择与权限确认                                  | OS 能力边界                              | Electron 维护者 | 长期边界，非债务                  |

新增功能必须遵守 2.0，不能扩大 LEGACY-UI-001。主题、外观或页面结构例外必须说明具体文件、理由、负责人、退出时间及证据。

`LEGACY-UI-001` 焦点缺陷收敛（2026-10-26 用户授权）：`src/renderer/components/ui/button.tsx` 将存量共享按钮的 `:focus` 半透明方框改为 `:focus-visible` 单一主题色轮廓，纯图标尺寸默认圆形，显式调用方形状优先。`App.tsx` / `globals.css` 集中识别指针与键盘操作，仅在指针模式抑制按钮轮廓，处理 macOS 脚本聚焦继承。覆盖工作流预览/账号/审核、工具箱等复用入口，不扩展控件库或布局；保留自动聚焦、焦点限制、焦点返回及输入框编辑提示。负责人为 renderer 维护者，迁移到 HeroUI 3.2.6 时由上游公开焦点行为替代。验证记录见 [弹窗焦点验证](dialog-focus-verification.md)。

---

# 历史台账（旧自建 v3.2，不再生效）

版本3.2.0；状态：**规范与HTML评审阶段**。生产业务组件在本轮未进行全局改造。

**迁移方向已更新：** 后续采用 [HeroUI 3.2.6 原生风格方案](heroui-adoption-proposal.md)。以下为旧自建规范的迁移记录，其中8px圆角、统一控件密度及其他外观数值不再约束HeroUI组件；新迁移顺序与验收以HeroUI方案和试点计划为准。

## 1. 迁移次序与边界

| 阶段           | 修改边界                                                                                | 完成条件                                                             |
| -------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 0 · 本轮       | 规范、令牌、组件目录、HTML预览、AI Lab设计对比、阅读入口                                | 生成一致性通过；示例交互、深浅色与响应式检查通过                     |
| 1 · 主题适配   | `styles/globals.css`、`tailwind.config.ts`                                              | 消费同一令牌源；旧颜色角色映射；深浅色无缺项；surface-bright补全     |
| 2 · 基础控件   | `components/ui/button.tsx`、`input.tsx`、`select.tsx`、新增Checkbox/Radio/Switch/Slider | 8px/36px/13px500统一；所有状态与键盘通过；无布局跳动                 |
| 3 · 容器导航   | Card、Tabs、SlidingTabs、Modal、Menu、Toast、MainLayout                                 | 12px卡/16px弹窗；Tab与Segmented分开；焦点返回；移除统一缩放/抬起效果 |
| 4 · 代表页面   | AI Lab四个分区与表单                                                                    | 使用共享组件；14px正文/12px辅助；功能、数据、快捷键完整保留          |
| 5 · 专业工作区 | Video/Voiceover、Writing编辑器、Insights阅读与Dashboard                                 | 去除局部视觉重复；播放器与主操作固定；长任务不受影响                 |
| 6 · 全量收敛   | Settings、Toolbox、Search、Notification、其他弹层                                       | 全部组件调用清单已复核；例外清零或到期明确；回归基线建立             |

每阶段均需深浅色、键盘、1440/1024宽度验证；触屏或响应式路径额外验600/390宽度与目标尺寸。生产迁移不得以HTML示意替代真实页面测试。

## 2. 已知映射与风险

| 当前                                 | 目标                      | 注意                                               |
| ------------------------------------ | ------------------------- | -------------------------------------------------- |
| `Button.secondary`                   | neutral                   | tonal仅保留品牌强调；兼容别名迁移                  |
| `rounded-lg`/`rounded-xl`等          | shape.control/card/dialog | 当前别名lg=16、xl=24；不能全局替换为8导致卡片缩水  |
| `text-body-md=16`                    | body-md14/22              | 需审查长文阅读；编辑器保留16/28                    |
| `font-label-sm`、font700             | label-md12/16/500         | 区分font-family类与字号/字重；输入不继承label字重  |
| primary-container强紫+白             | 低饱和紫+深字（深色反向） | 旧白色图标随容器迁移为on-primary-container         |
| Voiceover `voiceover-action`、fields | 共享Button/Field主题      | 本轮此前的8px按钮保留；4px字段与36px按钮列为待迁移 |
| select原生/自定义混用                | 共享Select/Combobox       | 大选项集搜索；保留键盘与label关联                  |
| 表单提交后直接关闭Modal              | 成功后关闭                | 保存失败保留输入，不因为视觉改造破坏异步行为       |

## 3. 例外记录

`VIDEO-WORKFLOW-001` 同日后续修订（2026-10-26 用户授权）：播放按钮按用户新要求改为半透明黑色圆底与浅色 PlayIcon，40px 目标尺寸沿用现有按钮；业务媒体覆盖层局部使用圆形外观，不影响其他 Button。`BilibiliAccountsDialog.tsx`、`BilibiliPublishingPanel.tsx` 导出按平台复用的账号弹窗与投稿面板，抖音新增扫码、多账号和视频直接投稿；保留原桌面布局、发布审核、导出和回填。历史 B 站导出名和 IPC 仍兼容，不改变凭据路径。沿用现有 Button / Voice 控件 / WorkflowDialog、项目主题与 React 18 / Radix 例外，不引入新库。负责人为项目维护者，退出里程碑为 Video 工作流 HeroUI 3.2.6 迁移；覆盖此前“无圆底、抖音仅手工”的本次实现边界。验证见 [抖音发布验证](video-workflow-douyin-publishing-verification.md)。

`VIDEO-WORKFLOW-001` 正片差异说明（2026-10-25 用户授权及截图修订）：`FinalRenderComparison.tsx` 与 `MediaPanels.tsx` 复用现有 Button ghost/icon、WorkflowDialog、表格文字和主题。按用户反馈在播放器规格旁以图标按钮打开对比弹窗，移除正文整块提示；补充可访问名称、提示标题、焦点返回与表格定位容器，修复隐藏 caption 撑大页面的问题。使用 HeroUI 缺少的比较业务图标 `@heroicons/react@2.2.0` outline，不引入新的控件库或布局断点。存量 React 18 例外负责人为项目维护者，退出里程碑为 Video 工作流 HeroUI 3.2.6 迁移。验证见 `video-workflow-final-comparison-verification.md`。
`VIDEO-WORKFLOW-001` 正式成片定位与发布预览（2026-10-25）：`MediaPanels.tsx` 复用现有工作流按钮、受管文件 IPC、WorkflowDialog 和原生 video，增加成片文件夹定位与发布封面播放弹窗；保留信息顺序、播放器和审核布局，关闭弹窗卸载媒体并返回触发按钮。AI 发布资料沿用现有平台表单保存投稿分区、可见性和稿件类型，B 站服务端核验已审核设置与实际投稿参数。HeroUI 迁移完成前沿用 React 18/Radix 局部例外。验证见本次工作流单元、B 站发布和正式成片 Electron 检查。

`VIDEO-WORKFLOW-001` 发布播放与多账号（2026-10-26 用户授权）：`VideoPreviewButton.tsx` 封装专用透明媒体覆盖入口，使用 Heroicons 2.2.0 outline 的 PlayIcon，单一三角、半透明白色和深色细描边，取消前一稿双圆环与厚阴影，封面不铺背景蒙层。`BilibiliAccountsDialog.tsx` 复用现有 Button / WorkflowDialog，整合绑定、切换、重新登录与解除确认，主页面只保留原账号摘要及管理入口；保留封面尺寸、表单顺序、主栏/审核栏与断点。沿用 React 18 / Radix 生产例外及现有主题；不引入控件库或依赖。责任为项目维护者，退出里程碑仍为 Video 工作流 HeroUI 3.2.6 迁移。验证见 `video-workflow-multi-account-verification.md`。

`VIDEO-WORKFLOW-001` 分镜素材降级（2026-10-24 用户授权）：`StoryboardEditor.tsx`、`StageWorkspace.tsx`、`ExecutionLog.tsx` 沿用本工作流现有 React 18 / Radix / Button 与主题例外。保留主栏、审核栏及操作位置；仅在既有缺口说明中增加一个批量降级按钮、确认弹窗和审核旁原因。接受仅创建待审核记录，不替换素材或改动 MG。负责人为项目维护者；退出里程碑为 Video 工作流 HeroUI 3.2.6 迁移。验证见 `video-workflow-material-fallback-verification.md`。

音色裁剪局部例外（2026-10-23，用户明确批准“允许本次局部例外，先完成音频裁剪”）：`VOICE-TRIM-001` 覆盖 `VoiceReferenceTimeline.tsx`、`VoiceProfilePanel.tsx`、`VoiceEngineFields.tsx`、`VoiceoverDialog.tsx` 与 `voiceover.css`。时间轴为专用音频业务组件，复用现有 VoiceButton、VoiceNumber 和主题，不引入 React 19 / Tailwind 4。责任为项目维护者，退出里程碑为 Voiceover 的 HeroUI 3.2.6 生产迁移。保留视频工作流与其既有例外；验证为 voiceover / workflow 测试、Electron 导入选段试听保存、明暗主题、视口与键盘。

| ID          | 范围                       | 理由                                                 | 责任           | 退出里程碑               | 状态     |
| ----------- | -------------------------- | ---------------------------------------------------- | -------------- | ------------------------ | -------- |
| LEGACY-001  | 现有renderer全部未迁移代码 | 本轮只交付规范与预览                                 | 项目维护者     | 阶段6按页面逐项清理      | 开放     |
| PREVIEW-001 | HTML原生日期/时间/select   | V3.2已替换为项目统一浮层，隐藏原生select仅保留表单值 | 规范维护者     | 本轮HTML评审             | 已关闭   |
| SYSTEM-001  | 系统文件选择与权限窗口     | 保留OS文件访问和权限能力，应用内入口自绘             | 项目维护者     | 长期系统边界             | 固定规则 |
| BRAND-001   | 官方产品/第三方Logo        | 固有品牌资产色，不采用界面语义重染                   | 品牌资产维护者 | 长期资产规则，非迁移债务 | 固定规则 |

新增例外需补充具体文件、场景、负责人、理由和明确退出里程碑；不能扩大LEGACY-001来绕过新页面规范。

### VIDEO-WORKFLOW-001：视频创作工作流（2026-10-22）

封面紧凑布局与预览纠偏（2026-10-26 用户最新截图授权）：`PublicationCoverPanel.tsx`、`workflow.css` 将方式/短说明合并一行，缩略图与意见并排（预览宽 120–200px 随可用宽度调整，空间不足换行），覆盖前一稿通栏布局。修复原截帧被强制置于 4:3 框产生的补边，标记来源/像素，并始终允许预览切换；原截帧 4:3 仅裁切预览并明示不改投稿文件。缩略图及弹窗各用现有 Button ghost/icon 增加文件定位，复用受管 `showFile` IPC、错误反馈和 Heroicons 2.2.0 outline 的 FolderOpenIcon。沿用既有主题与控件例外，不改变审核和底部动作；责任及迁移退出里程碑同本条。验证见封面验证文档最新修订。

封面建议输入框排版修订（2026-10-26 用户截图授权）：`PublicationCoverPanel.tsx` 将修改建议移出预览右侧栏，独立置于预览与生成方式行下方，铺满主栏宽度并对齐标题左缘，消除左侧留白；复用原 VoiceTextArea、主题、间距及禁用/输入状态，不新增样式或控件。负责人及 HeroUI 迁移退出里程碑沿用本例外。验证见封面验证文档的排版修订记录。

封面生成增量（2026-10-26 用户授权）：`PublicationCoverPanel.tsx`、`MediaPanels.tsx`、`StageWorkspace.tsx`、`WorkflowSettings.tsx`、`ExecutionLog.tsx` 与 `workflow.css` 沿用本条已批准 React 18 / Radix / Button / Voice 字段 / WorkflowDialog 和项目主题。新封面区复用既有主栏，保留原共用视频缩略图尺寸、审核和底部操作位置；业务缩略图使用 200px 宽，放大入口为既有 40px icon Button，HeroUI 缺少的放大业务图标用 Heroicons 2.2.0 outline。支持两种生成方式、修改意见、历史预览/选用、明暗主题和键盘，不引入新控件库、主题或断点。负责人为项目维护者，退出里程碑为 Video 工作流 HeroUI 3.2.6 迁移。验证及平台能力边界见 [封面验证](video-workflow-publication-cover-verification.md)。

- B 站一键发布（2026-10-24 用户授权）：`BilibiliPublishingPanel.tsx`、`MediaPanels.tsx`、`WorkflowSettings.tsx` 复用当前 Button、VoiceInput/VoiceSelect、Radix WorkflowDialog、主题及既有信息顺序，加入账号扫码、显式投稿设置、投稿记录与核查。无新增 UI 依赖、样式、图标或主布局变更；保留原审核/手工导出/抖音。负责人为项目维护者，退出里程碑沿用工作流 HeroUI 生产迁移。验证见 [B 站发布验证](video-workflow-bilibili-publishing-verification.md)。

- 粗剪动画修改与分镜定位（2026-10-24 用户授权）：`MediaPanels.tsx` 使用统一的实测分镜时间轴与视频帧定位，修复跳回上一镜；`RenderActions.tsx` 沿用原说明位置解释可修改的动画范围及预览来源。继续使用已批准的 React 18/Radix、原生播放器、主题与分栏，不新增控件、样式、图标或依赖。负责人和 HeroUI 迁移退出里程碑沿用本例外。验证见 [粗剪动画修改与分镜定位验证](video-workflow-motion-seek-verification.md)。

- 取消计划并沿用原视频（2026-10-24 用户纠偏）：移除误加的“不加 MG”合成按钮，仅由 `RenderActions.tsx` 原修改区域的“取消修改计划”恢复原粗剪的审核入口。`StageWorkspace.tsx` 沿用原审核按钮和弹窗，说明保留原画面、声音、字幕与时长；`ExecutionLog.tsx` 记录沿用原视频、未重新合成。沿用本分支 React 18/Radix、原主题、分栏与审核位置，不新增依赖、样式或图标。负责人及 HeroUI 生产迁移退出里程碑沿用本例外。验证见 [取消计划与沿用原视频验证](video-workflow-cancel-plan-retain-verification.md)。

- 分镜内置 MG（2026-10-24 用户授权）：`StoryboardEditor.tsx` 在原创作设置复用既有 Toggle、details 和按钮提供动画开关及逐镜排除，在原主栏解释计划与缺口；`StageWorkspace.tsx` 复用审核门禁，执行时锁定设置。React 18/Radix 局部例外、主题及布局沿用，不引入组件库、图标或新补齐入口。负责人为项目维护者，退出里程碑为工作流 HeroUI 生产迁移。验证见 [分镜 MG 开关与就绪契约验证](video-workflow-storyboard-mg-verification.md)。

- 旧配音沿用与环境缓存（2026-10-24 用户授权）：`StageWorkspace.tsx` 在既有审核位置提供“沿用并审核此版配音”及确认说明，`MediaPanels.tsx` 根据口播一致性开放历史恢复并解释单段重生成的前置动作，`ExecutionLog.tsx` 显示真实沿用记录。复用当前 Button/Radix、主题与布局，不增加组件库、样式或图标。服务端核实历史依赖和音频文件后创建新版本，环境状态自动恢复或重检。负责人和 HeroUI 迁移退出里程碑沿用本例外；验证见 [配音沿用与环境缓存验证](video-workflow-audio-reuse-runtime-verification.md)。

- 单镜口播与修改记录（2026-10-24 用户授权）：`StageWorkspace.tsx` 复用既有 Button 提供沿用口播及当前镜生成，在分镜选择与正文之间展示；`ExecutionLog.tsx` 沿用现有时间线与原生 details 展示真实修改目标、意见、源/结果版本、字段前后差异，`workflow.css` 仅为差异文本沿用现有中性主题。复用 React 18/Radix 已批准例外，不引入依赖、不调整字段/分栏/审核动作。负责人及退出里程碑同 VIDEO-WORKFLOW-001。验证见 [单镜口播与修改记录验证](video-workflow-scene-narration-verification.md)。

- 范围：`src/renderer/modules/video/workflow/` 与视频模块入口，分支 `feature/video_studio_workflow`。
- 用户明确批准：本分支沿用现有组件与主题；HeroUI 改版由另外分支执行。复用现有 Button、Card、Radix Select/Tabs/Dialog、配音字段及 Material Symbols，不更换全局依赖和样式。
- 布局批准依据（2026-10-23 明确纠偏）：用户指定 `video-workflow-ui-spec.md` 与高保真稿作为布局基线。此前将“复用组件”理解为可以重新组织页面有误；组件例外不涵盖信息顺序、网格比例、断点和动作位置。原封面/音频/演示布局保留于素材库。
- 负责人：项目维护者。退出里程碑：独立 HeroUI 生产迁移分支合入时逐项迁移这些组件。
- 验证：见 [生产布局对齐记录](video-workflow-production-alignment.md)；历史设计站测试与真实 Electron 页面验证分别记录。
- 2026-10-23 用户追加授权：仅重设计右侧审核资料与执行日志。`ExecutionLog.tsx` 使用真实任务时间/执行器/状态/phase，按任务组织日志；运行中 Spinner、不定进度与实时耗时，错误详情折叠且可键盘展开。复用当前 Button，不新增依赖；保留主栏、Stepview、分栏断点、审核与下一步位置。该增量仍随本例外的 HeroUI 迁移里程碑退出。
- 同日用户截图要求压缩返回区与步骤区间距：仅详情页 gap 24→16px、返回按钮水平内距 12→0px、步骤 gap 8→4px / 底部内距 24→12px，窄窗口步骤行距 24→16px；不改全局 Button 或页面外壳。
- 用户要求口播基于前序文案与分镜支持 AI 生成：将现有生成能力明确放到口播编辑区标题右侧，沿用 Button 与执行器；新增来源版本摘要，保留人工审核门禁和分镜/正文/读音顺序。未保存修改阻止覆盖，运行锁定编辑。无 HeroUI 或全局样式迁移。
- 配音追加授权及用户纠偏：逐段成功立即展示与试听；任务级真实完成段数、加载/失败提示；播放中的段落标题和按钮高亮，媒体事件同步暂停/结束/互斥状态。`AudioTrackPlayer.tsx` 按用户最新要求恢复原生 `audio controls`，仅覆盖当前播放按钮的主题色圆形背景与标题 700 加粗/主色；所有进度条及非播放按钮保持原生中性色，保留时间、音量和菜单。保持段落标题→时长→正文→播放控制的顺序，不扩大依赖和全局布局迁移。持久片段不替代待审核完整产物。验证见 [配音增量与播放验证](video-workflow-audio-progress-verification.md)。

- 配音停顿与单段重生成（2026-10-24 用户授权）：`VoiceoverDialog.tsx`、`AudioTrackPlayer.tsx`、`MediaPanels.tsx`、`StageWorkspace.tsx` 复用现有 VoiceNumber、Button、Radix DropdownMenu 和原生播放器，加入 VoxCPM2 参考尾部停顿参数及逐段重新生成入口。保持主栏、段落信息顺序、播放器和审核门禁；不引入新库或主题。`audioTrackId` 只允许指向当前完整配音的受管文件，成功重建合并音频/字幕并创建待审核版本，失败/取消保留旧版本。责任、退出里程碑和局部例外沿用 VIDEO-WORKFLOW-001。验证见 [配音参数与单段重生成验证](../video-workflow-audio-regeneration-verification.md)。
- 分段配音版本与 Qwen3 一致性（2026-10-24 用户追加）：`MediaPanels.tsx` 复用现有 VoiceSelect、Button 和原生播放器，显示音频版本号、生成时间、历史试听及安全恢复入口；服务端复用阶段 revision，校验口播依赖和受管文件后创建待审核新版本。Qwen3/VoxCPM2 工作流保留基础种子并按片段派生，单段重生成加入任务盐值，避免第九段异常音色因固定 `42` 重复。沿用 React 18/Radix 局部例外与现有布局，不引入新库。验证见 [分段配音版本历史与 Qwen3 音色一致性验证](../video-workflow-audio-history-qwen3-verification.md)。

## 4. 评审与回归清单

`VIDEO-WORKFLOW-001` MG 要求与 AI 修改传参纠偏（2026-10-24）：保留现有分镜弹窗、控件、主题与审核布局，仅修复 `StoryboardEditor.tsx` 未取出 `onAiModify` 回调及 `StageWorkspace.tsx` 未转交第三个参数的问题。文案创作要求与单镜修改意见随版本持久保存，动态粗剪读取简报、文案、分镜创作要求及 MG 注释并生成真实元素计划；漏镜、无变化关键帧和原样分镜拒绝作为成功修改。已有明确确认的动效在仅配音变化时复用。继续沿用本例外的负责人和 HeroUI 迁移退出里程碑，无新增组件、样式或依赖。验证见 [MG 要求与修改意见验证](video-workflow-motion-requirements-verification.md)。

`VIDEO-WORKFLOW-001` 错误复制修订（2026-10-24 用户授权）：`ExecutionLog.tsx` 在原生 details 中复用既有 Button 添加“复制错误信息”，显示成功或失败反馈；`workflow.css` 仅允许错误原文选择。沿用工作流已批准的 React 18 / Radix 局部例外，无新增库、图标或主题，记录信息顺序与审核动作不变。负责人为项目维护者，退出里程碑为工作流 HeroUI 生产迁移。验证见 [粗剪字体与错误复制验证](video-workflow-font-copy-verification.md)。

`VIDEO-WORKFLOW-001` 追加（2026-10-23）：用户确认自然语言＋分镜/时间定位＋计划确认＋新版预览审核。新增 `RenderActions`，复用现有 Button、Radix WorkflowDialog 与 Voice 表单；预览后展开修改区，不新增工作台栏目。正片审核后保存风格模板，分镜设置选择“我的模板”。保留所有既有布局、主题、八阶段和门禁。HyperFrames 原生 WAAPI 编译仅处理受限动效数据，不放开用户 HTML 脚本；导出工程是副本，Studio 回导另行确认。验证见 [动效与模板验证](video-workflow-motion-template-verification.md)。

`VIDEO-WORKFLOW-001` 反馈修正（2026-10-23）：截图与生产记录证实仅生成动效计划，尚未确认合成，播放器仍是已审核粗剪 v1。在现有预览中复用 `workflow-notice` 和 Button 说明计划未应用，并定位已有确认区域；计划自动展开，显示修改镜数。复用现有主题和信息顺序，不引入新组件库。补充受限镜间转场与真实重叠画面交接，保持人工确认、版本保留和审核门禁。验证见同一验证文档的转场回归章节。

`VIDEO-WORKFLOW-001` 发布资料增量（2026-10-23 用户授权）：`StageWorkspace.tsx`、`MediaPanels.tsx`、`ExecutionLog.tsx` 复用现有 Button、Voice 字段、原生 details 与任务日志，增加当前平台 AI 生成/重新生成、可选修改要求与来源说明。平台→成片→资料及审核、底部保存位置不变，不引入新依赖/主题/图标。各次生成仅更新选定平台并创建待审核版本，失败/取消保留原资料。负责人及退出里程碑沿用本例外；验证见 [发布资料 AI 验证](video-workflow-publish-ai-verification.md)。

`VIDEO-WORKFLOW-001` 列表控件修订（2026-10-23 用户截图授权）：仅调整 `WorkflowStudio.tsx`、`workflow.css` 的视频列表搜索框高度/圆角、筛选行居中和可见标签；归档视图/环境入口使用现有图标 Button，项目归档/恢复使用现有 Radix DropdownMenu，不引入库或全局主题改动。菜单保留归档门禁、错误反馈与恢复行为，可访问名称及按下状态完整。责任及退出里程碑沿用本例外；验证见 [列表控件验证](video-workflow-list-controls-verification.md)。

`VIDEO-WORKFLOW-001` 文案 AI 入口修订（2026-10-24 用户授权）：用户截图表明右侧底部“重新生成”难发现，要求工作台直接生成并按建议修改。`StageWorkspace.tsx` 将主操作放至文案标题右侧，常驻修改建议、来源与状态说明；沿用现有 Button、VoiceTextArea 和执行日志，右侧仅保留执行器与导入/导出，不改变主分栏和审核操作。`copy.ts` 为初稿/修改稿共用提示词，复用本地 CLI 和版本门禁；未保存保护、执行锁定、失败/取消保留与下游失效沿用既有业务。无新库、主题或图标。负责人和退出里程碑沿用本例外；验证见 [文案 AI 验证](video-workflow-copy-ai-verification.md)。

`VIDEO-WORKFLOW-001` 配音文件定位与动态截图稳定性（2026-10-24 用户授权）：`AudioTrackPlayer.tsx` 的“更多操作”增加“打开所在文件夹”，通过工作流文件校验后调用 Electron 系统定位；动态粗剪的隔离分镜截图增加场景定位、短暂等待和最多三次独立窗口重试，避免瞬时空画面直接失败。保留原布局、播放器和审核门禁；无新依赖或主题改动。

- 令牌单源：执行 `npm run design:generate` 与 `npm run design:check`，生成物与源定义一致。
- 组件：全部变体、hover/focus/pressed/disabled/loading/error；可选择控件的选中态及组合态。
- 语义：label/id、accessible name、aria-busy/invalid、role、读屏顺序、焦点陷阱和返回。
- 布局：长中文/英文、空值、加载、失败、离线、溢出、200%缩放、窗口窄化。
- 主题：正确的on-\*配对，文字4.5:1、功能边界3:1；检查状态层叠加后的实际颜色。
- 业务：模型切换、音色导入与转写、任务生成/取消、试听/导出、订阅增改删、会话与数据刷新。
- 截图：组件工作台、代表页面、全部受影响的高风险弹窗；记录版本与密度。

`VIDEO-WORKFLOW-001` 封面生成弹窗修订（2026-10-26 用户授权）：`PublicationCoverPanel.tsx` 将生成方式、费用说明和修改建议收进既有 `WorkflowDialog`，主区仅保留缩略图、状态、规格与历史选用，复用 Button / Voice 控件和既有主题。打开或取消不启动任务，关闭保留建议，启动失败可重试，成功后关闭；两个弹窗均有焦点返回。紧凑摘要限定在主栏内，保留右栏、审核和底部布局。沿用本例外的负责人及 HeroUI 迁移退出里程碑，验证见 [封面验证](video-workflow-publication-cover-verification.md)。

## 5. 后续CI建议

将 `npm run design:check` 加入仓库既有CI；共享组件稳定后增加真实组件截图基线与使用检查，禁止业务组件新写私有主题值。当前检查会阻止规范生成物漂移，但不会扫描并证明全部TSX/CSS符合v3；这一边界必须保留在发布说明中。

## 6. V3 布局约束

不得将本轮视觉迁移扩大为信息架构重排：保持280px侧栏、顶栏搜索、48px页内距、1280px最大宽度、Radar/Usage 5:7、横向订阅卡片、工具目录顺序。具体建议与等级见 [layout-audit.md](layout-audit.md)。现有响应式行为若无问题应优先复用；预览中的80px导航轨仅为窄窗口示意。

## 7. V3.1 精修映射

优先迁移16px操作图标、12px按钮水平内距、neutral次要按钮；其次同步输入边界、36×20开关、16px滑块、inset Tabs和独立connected按钮组。规范页3项核心参数与折叠规格属于文档呈现，不改变生产表单结构。36×20开关的命中区由label行提供，不放大图形代替扩大可点范围。

## 8. V3.2 自绘控件迁移

生产优先建立共享Select/Combobox/DatePicker/TimePicker/ColorPicker，再替换页面调用；不得只美化select触发器却留下系统弹层。先覆盖设计工作台顶部密度与Dialog中的嵌套表单，再覆盖业务页面。Checkbox等原生input保留键盘语义，统一appearance与状态；原生语义不等于允许平台默认外观。验收包含表单值、IME、disabled/indeterminate、Escape分层关闭、焦点返回与视口避让。日期范围、12小时制、透明度等预留变体在生产实现时另验，不视为本轮已完成。
