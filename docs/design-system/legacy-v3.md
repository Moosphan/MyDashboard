# MyDashboard · Quiet Workspace（历史存档）

> 已由 [设计规范 2.0](spec-v2.md) 取代。本文与旧令牌、HTML、生成器仅供溯源，不约束新增设计或开发。

**全局 UI 设计规范 v3.2.0 · 2026-10-22 · 适用：桌面 Electron 工作台及未来响应式页面。**

这是供后续设计与开发遵守的目标规范。本轮交付规范、可执行令牌及 HTML 预览；生产页面仍是现状，尚未完成全局迁移。预览中的 AI Lab 是设计提案，不是已上线功能。

**最新迁移决策（2026-10-22）：** [采用 HeroUI 3.2.6 原生风格](heroui-adoption-proposal.md)，配套 [一手来源与版本核实](heroui-research.md)。圆角、尺寸、颜色、排版与动效遵循组件默认规范，移除强制8px及旧卡片 / 弹窗形状定制；保留现有页面布局和必要的用户设置兼容。尚未安装依赖或迁移生产UI。

以下章节和现有HTML预览保留为旧自建规范记录；其中的8px控件、12px卡片、16px弹窗及其他视觉令牌不约束HeroUI迁移。后续接入按上述新方案执行，实际页面与预览待实施时同步。

## 1. 入口与权威性

| 文件                                           | 职责                                                 | 修改方式                           |
| ---------------------------------------------- | ---------------------------------------------------- | ---------------------------------- |
| `README.md`                                    | 设计原则、通用行为、可访问性与执行规则               | 人工维护                           |
| `tokens.json`                                  | 色彩、形状、字体、密度、空间、层级、动效的唯一数值源 | 修改后生成                         |
| `components.json`                              | 58 类组件的用途、参数引用、变体和行为                | 修改后生成                         |
| `components.md`                                | 可阅读的完整组件规格                                 | 自动生成，不直接编辑               |
| `tokens.generated.css`                         | 预览消费的 CSS 自定义属性                            | 自动生成，不直接编辑               |
| `system.generated.js`                          | 预览组件目录、令牌、对比度结果                       | 自动生成，不直接编辑               |
| `index.html` / `preview.css` / `preview.js`    | 可交互组件与 AI Lab 改造提案                         | 引用令牌，组件参数以目录为准       |
| `preview-controls.js` / `preview-controls.css` | Select/Combobox/日期/时间/颜色的统一交互与浮层       | 文档预览实现，生产迁移使用共享组件 |
| `migration.md`                                 | 与现状的映射、迁移顺序、例外及验收                   | 每次迁移更新                       |

发生冲突时：用户明确决策 → 本规范中的项目定制 → 组件源定义/令牌 → Material 3 基线 → 历史页面。`docs/*-page-design.html` 和旧版规范只作历史参考。新增 Material 官方组件时先登记用途、令牌、状态和键盘行为，再进入产品。

## 2. 风格与审计结论

**方向：以内容为中心的中性桌面工作台。** 参考 DSH Desktop 的中性表面与细边界，保留紫色品牌和 Material Symbols，以系统排版、克制色彩与紧凑控件提升质感。主次来自文字角色、表面层次和动作强度，不依赖大圆角、重阴影、满屏紫底或大号加粗字。

此次基于以下真实来源审计：

| 来源                                                     | 现状                                      | v3 决策                                                         |
| -------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| `docs/design-guidelines.md` v1                           | primary #8B5CF6，所有容器8px              | V3采用 #6941C6；按组件角色分配形状，非现状颜色记录              |
| `src/renderer/styles/globals.css`                        | 完整紫/琥珀语义色、深色主题；品牌容器偏强 | 保留主题骨架；tonal 容器采用浅紫配深字；补 success/warning/info |
| `tailwind.config.ts`                                     | rounded-lg=16、xl=24；正文16、标签经常700 | 改用明确语义令牌；正文14/400、按钮13/500                        |
| `components/ui/button.tsx`、`input.tsx`、`modal.tsx`     | 胶囊按钮、24px输入框、弹窗内16px按钮并存  | 普通控件8px、卡片12px、弹窗16px                                 |
| `components/ui/card.tsx`、`tabs.tsx`、`sliding-tabs.tsx` | 卡片16/24px、卡片浮起、胶囊页签并存       | 卡片按用途分型；页签与分段/单选职责分开                         |
| AI Lab 各组件                                            | 9–11px信息多、部分标题32px、局部多层色块  | 主体14px、辅助12px；分区标题16；收敛嵌套与边框                  |
| AI Voiceover 局部样式                                    | 已有8px按钮；字段4px、部分动作36px        | 目标字段8px、标准按钮36px；后续一次迁移共享边界                 |
| `assets/app-logo.svg`                                    | 紫色双层带琥珀色的 Ribbon Hub             | 原样保留品牌图形与固有色                                        |

审计覆盖共享基础组件、全局布局与 Dashboard/Writing/Video/Insights/AI Lab/Settings/Toolbox 的代表模式；“局部”表示存在相似模式，不代表已有完整可复用实现。

### 本版设计决策

V3 替代 V2 的大面积冷紫色表面与松散尺度。不是复制整页 DSH：主 Harness 与原生设置窗口使用不同组件栈。本版采用它们共同的中性层次；36px默认按钮参考主 Harness，8px控件/12px卡片/16px弹窗接近 native-ui；这些都是本项目明确选择。Material 3 继续提供颜色角色、选择语义、焦点、状态与组件覆盖，外观不宣称原样遵守 Google 默认尺寸。

| 层面   | V3 规则                                                                 | 对现有排版的影响 |
| ------ | ----------------------------------------------------------------------- | ---------------- |
| 表面   | Light #FAFAFA / #FFFFFF / #F4F4F5；Dark #18181B / #202023 / #27272A     | 无               |
| 强调   | Light #6941C6；Dark #C4ADF8；单个操作区仅一个主要强调                   | 无               |
| 边界   | 卡片1px outline-variant、静态阴影0/1；输入1px control-border、focus 2px | 无               |
| 控件   | 默认36px、紧凑32px、触控48px；8px圆角；标签13/20/500                    | 仅控件尺寸微调   |
| 容器   | 卡片12px、子分区8px、弹窗16px；卡片内距20px                             | 仅局部内距       |
| 框架   | 侧栏280px；顶部56px；主体padding48px/max1280px；gap24px                 | 保持             |
| AI Lab | Radar/Usage 5:7 → 横向订阅卡 → 工具目录；无新增页头                     | 保持             |
| 字体   | 系统字体优先，Inter仅已安装时可用；正文14/22/400，辅助12/18/400         | 无强制字体下载   |

详细一手源码与截图依据见 [参考分析](reference-analysis.md)。所有结构性建议与问题等级见 [布局审核](layout-audit.md)。表中 hex 为 V3 项目取值，不能当作 DSH 原始数值引用。

## 3. 与 Material 3 的关系

采用 M3 的语义颜色、五级表面、五类普通按钮、状态层、焦点、内容层级和可访问行为。**这是 M3 适配主题，不宣称逐像素复刻 Google 默认或完整实现 M3 Expressive。**

| 项目               | M3 基线参考                 | 项目规范及理由                                                |
| ------------------ | --------------------------- | ------------------------------------------------------------- |
| 普通按钮           | 高40px、全圆角、label-large | 定制36px/13px/500；圆角8px，适配紧凑桌面工作台                |
| 文本框             | 常规56px；典型轮廓框4px圆角 | 桌面36px、触屏56px、8px圆角，外置标签                         |
| 弹窗               | 典型28px形状                | 使用16px，与紧凑桌面组件一致                                  |
| Slider             | 有多代默认/Expressive视觉   | 冻结为4px轨道、16px白芯圆滑块；统一行为与状态，不混用多代造型 |
| 字体               | Roboto类型系统              | 中文与英文均使用系统原生字体栈；Inter仅已安装时使用           |
| 页面密度           | 触控优先                    | 桌面默认36px；紧凑32px限密集区域；触屏48px以上                |
| Logo/状态色/数据表 | 产品自定义                  | 保留品牌SVG，补全工具类工作台组件                             |

组件目录覆盖 M3 常见正式组件家族，并为按钮组、拆分按钮、FAB菜单、工具栏和加载指示等扩展预留项目规格。官方目录可能持续演进；本版清单为2026-10-21审阅快照，不能把未来新增组件默认为已定义。

### 3.1 组件精修规则（2026-10-22）

在 V3 布局基础上进一步参考 DSH native-ui 的轻边界、图标与文字比例、inset tabs 和中性次要操作。8px控件圆角、36px默认按钮、280px侧栏及原模块顺序不变。

| 组件             | 统一后的细节                                                                             | 来源与取舍                                                   |
| ---------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Button           | 左右12px、图标16px、间隙6px；普通次要动作用neutral；危险操作默认柔和底                   | DSH native Button 的px3/gap1.5/icon4；本项目保留品牌主动作   |
| Input / Select   | 36px，compact32px；1px control-border，focus独立2px外环+3px柔和光环；外置标签13px        | DSH原生框的尺寸、状态层级；边界为保证3:1主动增强，非照搬浅灰 |
| Switch           | 36×20px、16px同尺寸滑块、左右2px内距；整行label提供32/48px点击区域                       | 本项目桌面适配，不能当作DSH原始数值                          |
| Slider           | 4px中性轨道、16px白芯/2px品牌边滑块；独立键盘焦点；数字12px等宽                          | 本项目精修；保留原生range语义与方向键                        |
| Tabs             | 默认inset：外40px/12px圆角/padding4px，内32px/8px；选中中性实底+阴影1；保留underline变体 | 直接对照DSH native Tabs层级与形状                            |
| Segmented        | 中性底/padding3px/内6px，selected实底；connected拆分按钮独立处理                         | 避免视图切换与按钮组混为一个视觉实现                         |
| Checkbox / Radio | 16px图形、1px边界；原生输入语义；禁用、键盘与forced-colors保留                           | 桌面紧凑适配；图形尺寸与命中区域分离                         |
| Menu / Toolbar   | 菜单32px行、图标16px、圆角6px；4px容器内距，快捷键靠右、危险项用分隔线                   | DSH中性紧凑风格；不依赖厚阴影表示层级                        |
| Badge / Chip     | 低强度混色底、细边；组件成熟度使用中性标签                                               | 不把“已有组件”显示为业务成功状态                             |
| 工作台展示       | 标题/使用场景 → 有边界的交互示例 → 3项核心参数 → 可展开完整规格                          | 减少参数墙，让控件可辨；12px规格正文，完整58类保留           |

参考源码固定链接见 [reference-analysis.md](reference-analysis.md)。本轮更新令牌、组件定义和HTML预览，未迁移生产组件。

## 4. 颜色系统

### 4.1 使用语义角色

从 `tokens.json.color.light/dark` 读取，不在业务组件复制 hex。原始品牌SVG中的 #8457FF/#9167FF/#F5BF2F 是资产固有色，不替代界面 primary。

| 角色                                     | 使用                                                        |
| ---------------------------------------- | ----------------------------------------------------------- |
| primary / on-primary                     | 主动作、当前焦点、关键选中；高强度色每区最多一处主动作      |
| primary-container / on-primary-container | tonal按钮、选择态、选中导航；浅紫/深紫正确配对              |
| secondary / secondary-container          | 琥珀品牌点缀、重点摘要；不作错误或全局第二主按钮            |
| tertiary                                 | 补充分类/图表；界面不为装饰叠加第三种强色                   |
| surface / surface-lowest                 | 页面背景 / 内容卡片                                         |
| surface-low / container / high / highest | 分组、控件底、层级表面；不能每层都套彩色卡片                |
| on-surface / on-surface-variant          | 主要文字 / 帮助、时间、次级信息；使用实色而非任意降低透明度 |
| control-border                           | 输入、单选、复选、开关的功能边界；基础表面对比度≥3:1        |
| outline / outline-variant                | 强边界、拖放区 / 装饰分隔和容器框；二者不可混用             |
| error / success / warning / info         | 明确的语义反馈；配对应 on-\* 与 container，不只靠颜色表达   |
| inverse-surface / inverse-on-surface     | Snackbar、普通Tooltip；其动作采用 inverse-primary           |
| chart-1..4                               | 图表分类；附标记、线型、图例和数据表                        |

禁止把“secondary按钮”映射到琥珀色：普通次要动作使用 **neutral（中性底）或 outlined**；需要品牌强调时才使用 tonal。原有 `Button.variant=secondary` 在迁移中映射为 neutral，保留兼容别名后逐步移除。原有 primary-fixed 系列可兼容指向浅紫品牌固定值；应用动态主题用 primary-container。

### 4.2 深浅色与对比度

深色主题逐个语义角色配对，不使用滤镜反相。普通文字≥4.5:1；大字≥3:1；有功能的边界、图标与焦点≥3:1。装饰边框 `outline-variant` 不承担输入控件的唯一识别作用。禁用内容可按38%状态呈现，但不能承载必要说明。

生成器验证38组深浅主题常用文字配对≥4.5:1，以及 outline、control-border 对基础表面的3:1；这只验证令牌配对，业务叠加透明度、照片、图表和hover仍需逐页面验证。

## 5. 排版与信息层级

全部15种 display/headline/title/body/label角色见令牌与HTML排版页。中文正文使用系统字体回退（PingFang SC / Microsoft YaHei）；英文跟随平台字体，Inter仅在已安装时使用。预览不强制联网加载字体，图标字体本地提供。

| 场景             | 角色         | 默认规格                 |
| ---------------- | ------------ | ------------------------ |
| 普通页面标题     | headline-md  | 24/32/600                |
| 弹窗标题         | title-lg     | 20/28/600                |
| 卡片、分区标题   | title-md     | 16/24/600                |
| 列表小标题       | title-sm     | 14/20/600                |
| 主体、输入文字   | body-md      | 14/22/400                |
| 帮助、时间、来源 | body-sm      | 12/18/400                |
| 标准按钮、页签   | label-lg     | 13/20/500                |
| 紧凑操作、表头   | label-md     | 12/16/500                |
| 徽标计数         | label-sm     | 11/16/500，仅用于短徽标  |
| 阅读文章         | 产品阅读样式 | 16/28/400，最大列宽760px |

`大小/行高/字重` 均为px/px/数值。正文最低12px；9–11px只允许不可替代的非正文微标记。中文不增加大写英文常用的 tracking；字重不通过父级label继承给输入内容。数字用 tabular-nums，代码/时间码用 mono。h1–h3按内容层级使用，视觉大小与HTML级别分开。

## 6. 形状、空间、布局与密度

### 6.1 形状按角色分配

普通按钮/输入/选择器/Chip为8px；子面板/菜单8px；卡片12px；弹窗16px；工具图标按钮8px，主播放按钮与头像可全圆。状态Badge为4px。页面主体不套额外大圆角。嵌套卡片内圆角应小于外侧，不用“所有东西同一圆角”来表示统一。

密度改变高度和内距，不改变圆角、主次颜色和焦点规则。8px指实际CSS值，不以 rounded-lg 等可能改变含义的旧别名替代。

### 6.2 空间和响应式

- 4px基础网格：4/8/12/16/20/24/32/40/48/64；同组间距8/12，分区24，页面48。
- ≥1024px：侧栏280px、顶栏56px、内容最大1280px；12列内容网格、24px沟槽。
- 600–1023px：80px导航轨或折叠侧栏；内容留白24px；2列卡片优先。
- <600px：页面16px，单列，导航抽屉或3–5项底部导航；表格保留局部滚动。
- 断点由 `layout.break*` 提供；它们是桌面产品的响应式定制，不是Material窗口类的逐字复制。
- 组件允许文案换行与用户200%缩放；可滚动区域负责自己的溢出，不出现页面级横向溢出。

### 6.3 三种密度

| 密度     | 按钮/选择器      | 列表行 | 使用                                     |
| -------- | ---------------- | ------ | ---------------------------------------- |
| standard | 36px             | 48px   | 桌面默认                                 |
| compact  | 32px；标签12px   | 40px   | 表格/工具栏/历史操作，非全局缩小所有正文 |
| touch    | 48px；文本框56px | ≥56px  | 粗指针、平板与触屏                       |

桌面可点击目标至少32px且不互相重叠；图标按钮默认32px。触屏目标至少48px。Checkbox/Radio图形虽小，点击标签与容器共同形成40/48px目标。仅通过padding扩大目标时，不得覆盖相邻项。

## 7. 通用交互状态

所有可交互组件定义 rest、hover、focus-visible、pressed、disabled；可选择组件另有 selected，表单另有 error/read-only，异步动作另有 loading。hover、focus、selected可以组合；焦点不能被选中背景替代。

- hover：在底色上叠加当前内容色6%；pressed12%；dragged16%；focus状态层12%。
- focus-visible：2px `focus`外轮廓，offset2px，始终高于hover；避免被overflow裁切。
- disabled：内容 on-surface 38%，容器 on-surface12%；不是给整个组件 opacity=.5。
- loading：禁用重复提交、保留宽度和动作标签，设置aria-busy；允许取消的任务保留取消入口。
- 状态层不靠brightness滤镜实现；不使用统一scale(.95)、按钮抬起或卡片跳动，避免密集界面位移。
- 只给实际变化的属性过渡：状态150ms；进入250ms；退出200ms；曲线 `(0.2,0,0,1)`。
- `prefers-reduced-motion: reduce` 下关闭位移、轮播自动播放和骨架呼吸；状态变化即时或淡入≤100ms。
- 表单保留错误输入，错误紧邻字段并用aria-describedby关联；阻断错误才使用alert。

## 8. 图标与Logo

统一 Material Symbols Outlined，本地 `assets/material-symbols-outlined.woff2` 与已有许可文件配套。默认18px，inline16px，小标记16px，hero32px；wght400、GRAD0、opsz跟随尺寸；选中FILL1。导航、关闭、更多、删除等同义动作复用同一符号。第三方服务使用项目已有的官方SVG标志，可依据品牌提供light/dark版本，不套主题重染色。

产品Logo固定使用 `assets/app-logo.svg`，保持原始画布比例；最小24px、默认32px；四周安全区为容器尺寸1/4。深色放在中性浅底座，以保留原始紫/琥珀色。不得随主题改变品牌固有色、拆分、拉伸或附加发光。工具图标容器是功能分类，不冒充第三方Logo。

## 9. 弹层、层级与工作区

z-index固定为base0、sticky10、dropdown30、scrim40、modal50、popover60、toast70、tooltip80。弹窗内浮层使用Portal并正确绑定当前焦点范围；嵌套弹层由统一管理器排序。阴影只用于浮起层：卡片0/1、菜单2、Dialog3、保留4/5用于临时高浮起层。

Dialog最大高度 `100dvh - 48px`，头部与主操作固定、内容内部滚动；复杂工作区最大1120px。Voiceover使用编辑区+固定试听区，小于1024px改为上下布局；播放器、生成入口与任务状态不可因长内容丢失。标准侧面板不阻断背景；modal侧面板才加遮罩和焦点陷阱。

危险操作说明对象与结果，可撤销优先；删除确认默认聚焦取消。提交失败保留弹窗，成功后再关闭并返回触发点。全局通知不抢焦点，完成任务允许直接定位结果。

## 10. 组件覆盖与语义

[58类组件完整目录](components.md)逐项定义了名称、场景、变体、参数、状态与键盘要求。HTML中每类都有示例与规格表；部分预留控件仅展示外观/局部交互，不等于生产实现。

关键区分：Tabs导航平级内容；Radio选择互斥表单项；Segmented切换同一数据的视图；Chip筛选或辅助动作；Badge是不可交互状态。Dropdown Menu用于命令，Popover可容纳表单，Tooltip不承载必要操作。图标按钮必须有名称；卡片不能嵌套交互按钮。

采用Radix等成熟无障碍基础库或原生语义元素承载行为，视觉必须通过项目共享组件统一。禁止直接展示系统默认Select、datalist、日期/时间/颜色弹层；只给触发器加CSS不足以达标。Checkbox/Radio/Switch/Slider保留原生输入语义，但使用统一图形、轨道、状态和焦点；forced-colors模式可为可访问性回退系统外观。

### 10.1 V3.2 系统默认外观清理

| 控件                           | 规范与预览实现                                                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Select / 密度选择 / 弹窗服务商 | 统一combobox触发器与listbox；32px选项行、8px弹层圆角、4px内距、6px条目圆角；选中check、禁用跳过、字符定位；表单提交值保持同步          |
| Combobox                       | 自绘可过滤结果浮层、无结果反馈；输入保留焦点，aria-activedescendant表示活动项；兼容中文输入法                                          |
| Checkbox / Radio               | appearance:none；16px图形，复选4px圆角；未选/选中/半选/禁用/焦点/hover；保留Space与同组方向键                                          |
| 日期                           | 手输YYYY-MM-DD与自绘日历；312px桌面浮层、36px日期格；上下月、今天、方向键、Home/End、PageUp/Down                                       |
| 时间                           | 手输HH:mm到分钟与自绘30分钟快捷列表；输入越界显示行内错误；不调用系统时钟弹层                                                          |
| 颜色                           | 自绘色板与HEX输入、颜色预览、校验和选中check；不调用系统调色盘                                                                         |
| 其他                           | 数字输入移除平台步进箭头；Tooltip统一浮层，取消title系统气泡；树与规格折叠统一展开图形；滚动条使用细轨道与语义色；表单校验使用行内消息 |

浮层支持视口避让、Escape关闭并返回焦点、外部点击/Tab收起；嵌套在Dialog内时优先关闭浮层。文件选择、系统权限等OS任务保留系统窗口，应用内导入入口统一设计。文件选择器是系统文件访问能力，不模拟文件系统窗口。原生dialog元素可保留焦点管理，但不展示浏览器默认边框和间距。

HTML中的隐藏select仅保存表单值，datalist只作选项数据源；运行时不展示其系统弹层。该无依赖实现用于设计评审，不替代生产共享组件、完整读屏或全平台回归。

## 11. 统一变更与验收

1. 先改 `tokens.json` 或 `components.json`；组件共用参数必须引用 `{{shape.control}}` 等令牌，不能复制数值到每项。
2. `npm run design:generate` 同步CSS、HTML数据和Markdown目录；`npm run design:check` 阻止引用缺失、主题角色遗漏、关键对比度不足及生成物过期。
3. 生产迁移时由共享组件消费同一生成令牌，建立 `--color-*` / Tailwind角色适配，移除模块级视觉覆盖。当前生成CSS只用于预览，未导入生产。
4. 调整共享组件时检索全部调用点；迁移台账记录受影响页面、截图、例外和验证，不只修改一个Dialog。
5. 按钮/字段等视觉变化更新工作台样例与至少一个实际页面截图；浅色/深色、1024与1440宽度、200%缩放、键盘操作均应验证。粗指针额外验48px目标。
6. PR验收列出：令牌变更、组件变体变化、全部调用点、键盘/读屏结果、对比度、截图、例外期限。无证据不声称“全局一致”。

版本：新增向后兼容组件为minor；纯说明/无视觉变化为patch；令牌角色、默认尺寸、形状或组件API的破坏性变更为major。临时例外必须记录责任人、理由、范围、退出条件；不能只新增局部CSS覆盖。

`src/renderer/AGENTS.md` 已为后续UI开发添加强制阅读入口。文档、令牌检查和工作台能约束规范来源，但不能替代正式迁移后的视觉回归与CI。完整迁移计划见 [migration.md](migration.md)。

## 12. AI Lab 对比说明

对比页左侧为现有应用代码启动的隔离实例实拍，使用示例账户/订阅；右侧为 HTML 设计提案。V3 保留侧栏宽度、搜索位置、5:7 两列、横向订阅卡片、工具目录顺序与四列桌面网格；不新增页面大标题，不将订阅转换为表格。数据模型和截图内容并非同一实时状态：After 使用演示数据，工具目录包含本次音频研究工具。新增搜索明确标注为预览辅助，不默认为产品新增功能。

预览提供Before / After / 并排切换。并排模式使用同为1440px窗口宽度的浅色标准密度截图等宽展示，避免一侧进入窄屏布局而另一侧缩放截图的误导；After单独视图保持可交互。添加订阅、工具搜索、分类、主题和密度为演示交互，不会写入生产数据库或调用真实服务。

## 13. 依据

审阅日期2026-10-21；M3网站部分页面为客户端渲染，本次具体按钮/形状数值同时以Google维护的Material Web版本化令牌核对。

- [DSH Desktop源码与提炼依据](reference-analysis.md)
- [Material 3组件目录](https://m3.material.io/components)
- [Material 3颜色角色](https://m3.material.io/styles/color/roles)
- [Material 3字体](https://m3.material.io/styles/typography/overview)
- [Material 3形状](https://m3.material.io/styles/shape/overview)
- [Material Web按钮指南](https://github.com/material-components/material-web/blob/main/docs/components/button.md)
- [Material Web v0_192 filled-button令牌](https://github.com/material-components/material-web/blob/main/tokens/versions/v0_192/_md-comp-filled-button.scss)
- [Material Web v0_192 shape令牌](https://github.com/material-components/material-web/blob/main/tokens/versions/v0_192/_md-sys-shape.scss)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)；本项目触屏目标48px是产品标准，高于WCAG2.2 AA部分目标尺寸条件。
