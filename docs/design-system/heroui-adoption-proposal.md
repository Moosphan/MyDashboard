# MyDashboard UI 新版方案：采用 HeroUI

> 用户修订生效：沿用现有主题和紧凑桌面布局；HeroUI 自带图标优先，缺项允许 Heroicons。下文默认颜色 / 原图标等历史建议冲突时，以 [规范 2.0](spec-v2.md) 和 [交互审核](interaction-audit-v2.md) 为准。不确定业务和布局先确认。

> 设计交付已收敛为 [设计规范 2.0](spec-v2.md) 与 [真实组件设计稿](v2/README.md)。下文“UI v4”保留为提案工作名；后续设计和开发统一遵守 2.0。独立设计工作台与生产迁移状态分别记录，不将设计稿构建等同于 Electron 接入完成。

状态：**组件风格已确定，待技术实施** · 2026-10-22。按最新用户决策采用 HeroUI 3.2.6 原生风格；本文不表示依赖已安装或生产页面已迁移。

## 1. 结论

**可以采用，以 HeroUI React v3.2.6 作为新的基础组件库，并遵循组件本身的默认风格规范。** 它与 Electron 的 React renderer 架构相容，覆盖表单、选择、导航、弹层、反馈和常用数据展示。项目维护页面布局、业务组件和必要的设置适配，基础组件的视觉、交互及可访问性主要交给上游。

但“可以使用”不等于“当前项目安装最新版即可直接替换”：当前 React 18.3.1 / Tailwind 3.4.15 低于 v3.2.6 的 React 19 / Tailwind 4 要求；现有 Radix API、RGB 三元组颜色变量和页面内原生控件也需要迁移。**推荐先验证技术升级，再迁移组件；不推荐为避开升级长期绑定旧版。**

设计方向确定为 **HeroUI 3.2.6 原生风格 + 现有页面布局与业务能力**。组件圆角、尺寸梯度、字体角色、颜色、阴影、间距与动效沿用上游默认和公开变体；不继续叠加旧自建规范的8px控件、12px卡片、16px弹窗等固定外观。DSH Desktop 与 Material 3 留作历史设计参考，不作为重塑 HeroUI 组件外观的约束。

本次核实了 npm 精确版本元数据、发布包 CSS / 类型声明 / LICENSE 和官方源码；尚未在本项目完成安装、构建或 Electron 回归。源码与出处见 [一手资料调研](heroui-research.md)。

## 2. 版本与接入条件

| 项目                 | 当前实际状态                               | 目标 / 判断                                                                           |
| -------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------- |
| HeroUI React         | 未安装                                     | 固定 `@heroui/react@3.2.6`，本轮 registry 的 `latest`，非 beta / rc                   |
| HeroUI Styles        | 未安装                                     | 固定 `@heroui/styles@3.2.6`，与 React 包配套                                          |
| React / ReactDOM     | `^18.3.1`                                  | 同步升级到经试点验证的 React 19 精确版本，类型包也同步                                |
| Tailwind             | `^3.4.15`                                  | 升级 Tailwind 4，采用对应构建插件；不可继续使用 Tailwind 3 的 PostCSS 插件方式处理 v4 |
| Vite / Electron-vite | `^6.0.0` / `^2.3.0`                        | 保留为首轮验证基线，只在构建插件 peer 冲突时调整；不要求使用 Next.js                  |
| Electron             | `^33.2.0`                                  | 组件运行于 renderer；主进程、preload 和 IPC 无需因引入 UI 库重写                      |
| 主题                 | `html.light/.dark`，支持系统模式与用户主色 | 保留设置能力；让 HeroUI 和旧页面消费同一主题状态                                      |
| 路由                 | React Router 6 / BrowserRouter             | 保留；导航类组件显式适配路由，测试无整页刷新                                          |
| 动画                 | 自有 CSS / Radix                           | v3 不要求照搬 v2 的 Framer Motion 依赖与 Provider 初始化                              |
| 组件交付             | 自写 React UI + 原生标签 + HTML 示例       | 改为真实 HeroUI React 工作台；HTML 规范页保留作历史参考                               |

上表版本来自 `package.json` 声明，并非保证当前锁文件中每个包恰好等于最低版本。实施时记录锁文件解析版本，使用 `pnpm` 并提交 `pnpm-lock.yaml`，不混用包管理器。

### v2 与 v3 的选择

| 路线                           | 条件与代价                                                                                                                         | 建议                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| v3.2.6 + React 19 + Tailwind 4 | 初期包含技术栈升级；采用当前稳定版、compound API 和 CSS 主题；避免之后再迁一次大版本                                               | **推荐主路线**                                                   |
| 历史 v2.7.11 + 对应主题依赖    | React 18 可用；它依赖的 `@heroui/theme@2.4.17` 声明 Tailwind `>=3.4.0`；需要 v2 Provider / plugin / 动画配置，且仍要验证完整依赖树 | 仅在明确不能升级 React / Tailwind 时评估的退路                   |
| 随意安装 `@heroui/react@2`     | v2 的不同小版本主题 peer 不一致；不能笼统认为所有 v2 都适配 Tailwind 3                                                             | 不采用                                                           |
| v2 / v3 混装                   | `@heroui/button` 等独立包可能属于另一代，API 与主题容易混用                                                                        | 不采用；v3 按发布包 exports 使用 `@heroui/react/button` 等子路径 |

不以 `--force`、关闭 peer 检查或“React 18 上似乎能跑”作为接入方式。依赖无法正常解析时先处理版本，而非把问题隐藏到运行期。

### 许可证与免费范围

本方案使用开源 **HeroUI React**，不依赖 HeroUI Pro 的付费页面模板，也不引入 HeroUI Native。实际检查的 v3.2.6 发布包包含 Apache-2.0 LICENSE，仓库也使用 Apache-2.0；npm 的 `license` 字段 / 部分 README 仍标 MIT，存在元数据不一致。采用时保留实际随包许可证、归属与适用 NOTICE，并记录版本，不能只抄 npm 标签。

Apache-2.0 允许商业使用；项目现有 Apache-2.0 许可证不是接入障碍。组件库开放许可不代表 HeroUI 商标、Pro 模板、外部图标与字体自动获得同样授权。

## 3. 本项目实际迁移规模

静态审计范围为 `src/renderer/**/*.tsx`，2026-10-22 快照：

| 发现                                                              | 含义                                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 260 个小写 `<button>`，分布于 52 个文件                           | 包含共享组件内部和业务页面；只改 `components/ui/button.tsx` 不会覆盖全站 |
| 56 个小写 `<input>`、8 个 `<textarea>`、6 个 `<select>`           | 需要区分文本、日期、范围、单选、多选和密码等用途迁移                     |
| 原生 input 包含 5 个 date、2 个 range、2 个 radio、2 个 checkbox  | 应纳入同一交互与视觉验收，避免系统默认外观残留                           |
| UI 目录已有 Button / Input / Select / Modal / Tabs / Toast 等封装 | 可保留稳定业务入口，但底层不能通过简单改 import 替换                     |
| 15 个文件直接引用共享 Toast，5 个引用共享 Button                  | Toast 更适合保留窄兼容入口；大量页面按钮需逐模块收敛                     |
| `settingsStore.ts` 运行时写入 `--color-primary` 等颜色            | 主题切换不仅是 CSS 文件替换；动态主色必须同步迁移                        |

计数使用 JSX 源码文本扫描，不是 AST 或运行时控件统计，不用于承诺精确工作量。既有编辑器、拖拽和虚拟列表依赖保留，不因为替换基础 UI 就同时更换业务引擎。

## 4. 58 类组件覆盖与处理方式

以下基于 **v3.2.6 发布包 exports**，不是把 v2 官网组件目录当成 v3 能力。直接采用仍需要组合子组件、接入数据和统一主题；不表示原项目 API 可原样保留。

| 现有目录 ID       | HeroUI / 项目处理                                                      | 接入方式                                                                               |
| ----------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| button            | Button                                                                 | 直接采用默认风格与公开变体，不覆写圆角或高度                                           |
| icon-button       | Button `isIconOnly` / CloseButton + Tooltip                            | 组合；明确 accessible name                                                             |
| fab               | Button + 位置 / 尺寸规则                                               | 组合；桌面不默认引入 FAB                                                               |
| segmented         | ToggleButtonGroup / RadioGroup                                         | 按多选、单选语义选用，不能套 Tabs                                                      |
| button-group      | ButtonGroup + Dropdown                                                 | 组合拆分动作                                                                           |
| toolbar           | Toolbar                                                                | 采用，上层接编辑器命令                                                                 |
| textfield         | TextField + Label + Input + FieldError                                 | 采用，外置标签为默认                                                                   |
| textarea          | TextField + TextArea                                                   | 采用；配音正文保持普通字重                                                             |
| select            | Select + ListBox                                                       | 采用自绘触发器和浮层；受控值单独适配                                                   |
| combobox          | ComboBox / Autocomplete                                                | 采用；区分自由输入与有限选项搜索                                                       |
| checkbox          | Checkbox / CheckboxGroup                                               | 采用，不重画浏览器默认方框                                                             |
| radio             | Radio / RadioGroup                                                     | 采用，用于预设音色 / 声音克隆模式                                                      |
| switch            | Switch / SwitchGroup                                                   | 采用                                                                                   |
| slider            | Slider                                                                 | 采用；映射步数 / 语速范围和单位                                                        |
| chips             | Chip / Tag / TagGroup                                                  | 展示状态与可选择 / 可移除集合分别处理                                                  |
| search            | SearchField + ComboBox / ListBox                                       | 组合搜索输入与结果，不将业务查询交给 UI 库                                             |
| date-picker       | DatePicker / DateRangePicker / Calendar                                | 采用；日期值显式转换到项目存储格式                                                     |
| time-picker       | TimeField                                                              | 时间输入直接采用；若需要弹出快捷列表，再组合 Popover / ListBox，不宣称自带完整时间弹层 |
| color-picker      | ColorPicker / ColorArea / ColorSlider / ColorField / ColorSwatchPicker | 采用，避免原生系统调色盘                                                               |
| upload            | Button + 输入 / 拖放适配                                               | 项目组件；保留 Electron 文件与音频校验能力                                             |
| card              | Card / Surface                                                         | 直接采用，业务卡内容保留                                                               |
| list              | ListBox / 常规语义列表                                                 | 只有可选集合用 ListBox，普通信息列表不用伪造选择语义                                   |
| table             | Table                                                                  | 采用展示 / 选择能力；复杂计算、服务端分页和虚拟化仍需接数据层                          |
| carousel          | 项目组合                                                               | v3.2.6 无对应顶层 Carousel 导出；不为预留需求预先安装额外库                            |
| divider           | Separator                                                              | 采用                                                                                   |
| tree              | 保留项目 Tree                                                          | 无对应顶层 Tree 导出；不要将 Accordion 误当完整树控件                                  |
| chart             | 保留图表 / 指标实现                                                    | HeroUI 不负责绘制业务图表                                                              |
| appbar            | Header + 既有布局                                                      | 组合；保留 macOS 拖拽区域与 no-drag 控件                                               |
| navigation-drawer | 既有侧栏 + Drawer / Link                                               | 固定侧栏保留；模态抽屉采用 Drawer                                                      |
| navigation-rail   | 既有导航 + Link / Tooltip                                              | 项目响应式导航，不强行替换页面框架                                                     |
| navigation-bar    | 既有导航 + Link                                                        | 预留组合，不提前实现移动端重排                                                         |
| tabs              | Tabs                                                                   | 采用；仅用于平级内容导航                                                               |
| breadcrumb        | Breadcrumbs                                                            | 采用并适配路由                                                                         |
| pagination        | Pagination                                                             | 采用并连接数据源                                                                       |
| dialog            | Modal / AlertDialog                                                    | 表单与危险确认分别采用，保留异步成功后关闭逻辑                                         |
| bottom-sheet      | Drawer 或 Modal 组合                                                   | 对应底部交互需试点；不能默认保证完整拖拽 / 吸附行为                                    |
| side-sheet        | Drawer / 既有非模态侧栏                                                | 模态与常驻工作区分别处理                                                               |
| menu              | Dropdown / Menu                                                        | 采用；上下文菜单与子菜单按 API 和 Electron 验证结果迁移                                |
| tooltip           | Tooltip                                                                | 采用；不把系统 title 当正式 Tooltip                                                    |
| popover           | Popover                                                                | 采用，统一 portal 主题和层级                                                           |
| badge             | Badge / Chip                                                           | 区分角标计数和文字状态                                                                 |
| progress          | ProgressBar / ProgressCircle / Meter                                   | 任务进度和容量值使用对应语义                                                           |
| loading-indicator | Spinner                                                                | 采用；异步状态由业务持有                                                               |
| snackbar          | Toast                                                                  | 采用；保留当前业务 toast 调用的薄适配                                                  |
| banner            | Alert                                                                  | 采用，业务文案与操作自定                                                               |
| skeleton          | Skeleton                                                               | 采用                                                                                   |
| empty             | EmptyState                                                             | 采用，离线 / 错误动作由业务补齐                                                        |
| notification      | Drawer + List + Badge / Alert                                          | 通知中心仍是业务模块，Toast 不代替持久通知                                             |
| logo              | 现有 SVG                                                               | 保留品牌资产，不替换成 HeroUI 标识                                                     |
| icon              | 现有 Material Symbols                                                  | 保留产品图标；组件内置必要指示图形优先沿用，不强行替换所有内部 SVG                     |
| typography        | Label / Description / Header / Typography 等                           | 沿用上游字体角色与语义组合；仅补充必要的中文字体回退                                   |
| avatar            | Avatar / AvatarGroup                                                   | 采用                                                                                   |
| rich-editor       | 保留 Tiptap / Markdown 引擎                                            | 外围工具栏 / 弹层使用 HeroUI，正文行为不重写                                           |
| audio             | 项目播放器 + Button / Slider                                           | 保留单音源、播放状态、音频加载和错误处理                                               |
| video             | 项目预览 / 时间线 + 基础组件                                           | 保留视频编辑业务                                                                       |
| split-pane        | 项目布局 / 分隔器                                                      | 保留拖拽尺寸、键盘调整和工作区滚动规则                                                 |
| stepper           | 项目步骤展示 + 基础组件                                                | 无顶层 Stepper 导出；从真实任务状态渲染                                                |
| keyboard          | Kbd + 既有快捷键 / dnd-kit                                             | 键帽直接采用；快捷键分发和拖拽行为保留                                                 |

“不要系统默认组件”针对可见外观与弹层：HeroUI 为表单、读屏或自动填充保留隐藏原生 input / select 是正确实现，不应删除。系统文件选择、权限弹窗仍使用操作系统能力。

## 5. 新规范如何缩小维护面

### 只维护三层

1. **上游层：** HeroUI 的默认主题、形状、尺寸、排版、间距、阴影、DOM 组合、状态、焦点、键盘、动效和组件变体。固定版本，随升级验证，不复制源码形成私有分叉。
2. **项目适配层：** 明暗主题状态、已有用户主色设置的兼容、必要中文字体回退与 Logo / 产品图标。默认工作台使用 HeroUI 原生主题；不新增强制外观覆写层。
3. **业务层：** AI Voiceover、订阅卡、Radar、时间线、播放器、编辑器和页面网格。通过基础组件组合，不再手写通用 Checkbox / Select / Calendar 交互。

已有 v3.2 自建规范保留历史布局与业务语义参考，不再规定 HeroUI 基础组件的外观，也不继续维护58套完整交互实现。项目规范的迁移目标为 **MyDashboard UI v4 · HeroUI edition**，与 HeroUI 自身的 v3 版本号区分。

### 默认风格与项目适配边界

| 项目                | 新方案决策                                                         | 项目维护边界                                                                                           |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 主色与表面          | 默认使用 HeroUI 3.2.6 的原生主题与语义色，不强制紫色品牌主题       | 保留已有用户主色设置的读取与持久化；已保存的显式用户选择通过官方主题变量适配，不能丢失或伪装成上游默认 |
| 字体与排版          | 使用 HeroUI 的字号、行高、字重和标签层级                           | 仅在需要时补中文本地字体回退，不另定一套控件排版数值                                                   |
| 控件尺寸与密度      | 使用公开 size / variant 和上游响应式尺寸                           | 根据场景选择现成变体，不覆盖 height / padding 建立私有密度                                             |
| 普通按钮 / 字段圆角 | 完整沿用各组件默认形状                                             | 移除强制8px及 `--field-radius`、组件类圆角覆盖                                                         |
| 卡片 / 弹窗         | 沿用 Card / Modal / Drawer 默认圆角、阴影与内部间距                | 不保留旧12px / 16px外壳定制；业务内容布局仍由页面负责                                                  |
| 状态 / 焦点 / 动效  | 采用上游 selected / hover / pending / invalid / focus-visible 机制 | 业务仅提供状态和值，不重画组件状态层                                                                   |
| Logo / 产品图标     | 保留现有品牌资产；组件内置指示图形沿用上游                         | 产品动作图标按组件支持的槽位接入，尺寸与对齐适应上游                                                   |
| 页面布局            | 保留导航、内容区域、网格比例和模块顺序                             | 页面布局规则不反向覆盖组件内部样式                                                                     |

**默认值说明：** v3.2.6 的基础 `--radius` 为8px，Button 使用 `rounded-3xl`，默认实际圆角约24px；字段默认是 `1.5 × --radius`。这些是上游不同组件的默认形状，应按原样保留。无需把它们统一改为同一个圆角，也不通过重定义 `--radius` 或 `--radius-3xl` 实现旧8px要求。验收与未覆写的同版本样例比较，而不是检查旧项目数值。

## 6. 技术架构与高风险适配

### 文件与依赖边界

| 位置                                                 | 实施时职责                                                             |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| `package.json` / `pnpm-lock.yaml`                    | 统一 React19、Tailwind4、HeroUI3 依赖；记录实际 peer 解析结果          |
| `electron.vite.config.ts` / `postcss.config.*`       | 选择一种 Tailwind4 构建接法，不双重编译；只改 renderer 构建            |
| `src/renderer/styles/globals.css`                    | Tailwind / HeroUI / 项目主题的唯一导入顺序与 layer 定义                |
| `src/renderer/styles/heroui-theme.css`（按需新增）   | 仅处理用户主题设置桥与中文回退；不覆写上游组件外观                     |
| `src/renderer/styles/legacy-theme.css`（迁移期新增） | 隔离旧颜色与 utility；随页面迁移删除，而非长期第二套主题               |
| `src/renderer/stores/settingsStore.ts`               | 主题模式、用户主色写入新主题桥；保存格式兼容已有设置                   |
| `src/renderer/components/ui/`                        | 少量稳定业务入口、兼容映射与项目组合；不为每个 HeroUI 子组件加一层转发 |
| `src/renderer/modules/toolbox/` 中的组件工作台       | 真实 React 组件与状态；沿用现有入口，不上来新增一套文档站              |
| `docs/design-system/`                                | 维护版本、映射、例外与实际截图；规范预览不再自写通用 JS 控件           |

V3 的典型样式入口为 `@import "tailwindcss";` 后导入 `@heroui/styles`；依实际构建方案处理 CSS layer。它不需要 v2 的 `HeroUIProvider`。国际化、路由、Toast 等需要的上下文仍分别配置，不能把“无需库级 Provider”理解成“没有任何应用上下文”。

### 风险 A：RGB 变量 / Tailwind 命名冲突，P1

当前项目 `--color-surface` 等变量存的是 `255 255 255` 三元组，utility 再包 `rgb(var(...))`。HeroUI / Tailwind4 里的同名 `--color-surface` 是完整 CSS 颜色。直接叠加可能产生无效颜色或让旧卡片突然使用错误表面。

迁移策略：先把旧RGB存储变量隔离到 `--md-legacy-*`；盘点与 HeroUI 同名的旧 utility 颜色（尤其 surface / background / 状态色），对旧页面使用 `legacy-*` 颜色别名。HeroUI 保留自己的 `--surface` / `--foreground` 等完整颜色角色。主题桥负责一处写入两侧，新页面只使用新角色。不得把完整颜色值再次包入 `rgb(...)`。

旧 `tailwind.config.ts` 中自定义 spacing、fontSize、shadow、animation 和 dark class 都要迁移或显式兼容；v4 的 `@config` 不是无差异兼容开关。重点检查 `p-md`、`gap-sm`、`text-body-md`、`font-label-*`、`rounded-lg/xl`、ring / shadow 默认变化和类名合并。`tailwind-merge@2.6.0` 也需换成适配 Tailwind4 的版本并迁移 `cn()` 扩展。

### 风险 B：交互 API 不是一一替换，P1

| 现有用法                                          | 新边界                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 原生 `disabled` / 点击事件                        | HeroUI `isDisabled` / `onPress` 等公开 API；根据语义迁移，不把 PressEvent 强制转 MouseEvent             |
| `Button.secondary`                                | 评审 HeroUI secondary / tertiary 的实际样式；只保留必要旧别名                                           |
| `Button.cta`                                      | 清理特殊琥珀 CTA 默认样式；有业务必要才登记项目变体                                                     |
| Radix `asChild` / Slot                            | 链接采用 Link + 路由适配，动作采用 Button；不能嵌套 button / a 假装兼容                                 |
| Radix Select 的 `value/onValueChange` 与 children | HeroUI3 的 collection / selection API；单选、多选、空值显式处理，不能复制 v2 的 `selectedKeys` 示例混用 |
| 原生 input change event                           | 根据具体组件的值事件处理；保留数值0、空字符串和未选择等区别                                             |
| Modal `onConfirm()` 后立即 `onClose()`            | 保存 pending 时防重复；仅异步成功后关闭，失败保留输入                                                   |
| 日期 string                                       | CalendarDate / 时间与项目 string 明确转换；日期型字段不能无意转 UTC 造成偏移                            |
| 现有 `toast({title,description,variant})`         | 薄适配到 HeroUI Toast；统一位置、关闭和错误反馈，不再保留两套队列                                       |

公开新组件默认采用 HeroUI 原生 Props。仅对已被多处调用的稳定业务契约保留临时兼容层，并登记退出范围；不试图用万能 wrapper 模拟全部 Radix 与 HeroUI API。

### 风险 C：Electron / 复杂浮层，P1

- AI Voiceover 弹窗内的 Select / ComboBox / Tooltip 必须保持正确主题、滚动、焦点和 Escape 顺序；先关闭子浮层，再关闭主弹窗。
- 浮层 portal 常离开页面局部容器，主题应落在 document 根级；不要只给工作台内某个 div 设置 dark。
- macOS 标题栏 drag / no-drag、输入中文组合键、编辑器快捷键不能因组件替换失效。
- 打包运行、断网运行与开发浏览器都要验；现有 Google Fonts 链接不能成为新规范的必要条件。

React19 与 Tiptap、Radix、dnd-kit、虚拟列表的兼容性需要完整依赖解析和代表交互测试。peer 范围满足只能说明可安装，不等于运行行为已验证。

## 7. 页面布局与修改等级

定义：P0为阻断接入 / 功能丢失；P1为必须解决的交互、兼容或关键一致性问题；P2为可独立评审的体验增强。**这些是建议等级，不是已发现所有问题的运行期严重性证明。**

| 项目                                | 新方案处理                                         | 等级         |
| ----------------------------------- | -------------------------------------------------- | ------------ |
| React18 / Tailwind3 与 v3 peer 不符 | 先完成升级试点，失败不推进生产替换                 | P0           |
| 主框架 / 导航                       | 保留280px侧栏、现有内容内距和页面模块顺序          | 无结构改造   |
| AI Lab                              | 保留 Radar / Usage 5:7、横向订阅卡、工具目录顺序   | 无结构改造   |
| AI Voiceover                        | 保留现有工作区结构和固定试听区；替换局部控件       | 无整体重排   |
| 页签 / 模式                         | 顶层Tabs只导航；预设音色 / 声音克隆改用RadioGroup  | P1语义整改   |
| 普通按钮 / 字段 / 选择状态          | 统一主题，不再混用系统默认可见控件                 | P1一致性整改 |
| 浮层与滚动                          | 弹窗标题、主要操作和试听入口可达，内容区域独立滚动 | P1体验整改   |
| AI Lab卡片标题 / 辅助信息 / 微间距  | 跟随库组件角色收敛；不挪动模块                     | P2视觉精修   |
| 小屏导航重构 / FAB / 新移动版       | 本轮不引入；有真实需求时另评审                     | P2后续建议   |

## 8. 实施次序与退出条件

| 阶段               | 交付与具体范围                                                                                                    | 验证 / 退出条件                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| A · 技术与视觉试点 | 隔离 React19 + Tailwind4 + HeroUI3 工作台，展示按钮、文本、单选 / 多选、Select、Slider、日期、颜色、Modal内嵌浮层 | 无 peer 强制绕过；构建成功；与同版本默认组件样例一致；键盘和 light/dark 通过                 |
| B · 应用底座       | renderer构建、主题桥、旧utility隔离、路由 / Toast / 中文locale适配；旧页面保持基线                                | 页面未迁移前布局与数据可用；类型检查与打包通过；无第二套主题漂移                             |
| C · AI Voiceover   | Tabs、RadioGroup、引擎 / 音色Select、文案TextArea、Slider、操作Button、播放器控制                                 | 导入音色、后台识别、克隆、生成、取消、失败重试、试听全部保留；不重新要求用户强制确认参考文字 |
| D · AI Lab         | 卡片外壳、动作、表单、日期、选择器、历史Modal、用量状态                                                           | 5:7与模块顺序不变；真实数据、主题切换、历史查询与空态可用                                    |
| E · 全局收敛       | Dashboard、Settings、Writing、Video、Insights、Toolbox、通知和其他弹层逐页迁移                                    | 扫描原生可见控件及硬编码样式；未迁项有明确台账                                               |
| F · 移交规范       | 真实React工作台替代HTML手写控件；清理失去调用的Radix、旧CSS / wrapper /预览JS                                     | 根规范、生成器、AGENTS与验证脚本同步；不让旧规范重新覆盖新组件                               |

不在同一运行窗口长期加载两套 Tailwind 主版本，也不长期安装 HeroUI v2 / v3 双栈。回退以阶段补丁 / 已验证依赖锁与主题边界为单位，不要求复制第二套产品页面。

### 验收标准

1. `pnpm exec tsc --noEmit -p tsconfig.web.json` 验 renderer 类型；`pnpm exec tsc -b --pretty false` 验项目 references；不能仅凭根 `tsc --noEmit`（根配置是空 files + references）宣称全项目通过。
2. `pnpm build` 与 Electron 打包启动；renderer、主进程 / preload 无新增错误。记录升级前既有问题，分别归因。
3. 真实React工作台与迁移页面验 light/dark、1440 / 1024宽度、200%缩放；390仅用于已有响应式路径，不以新增手机排版作为桌面迁移前提。
4. 键盘覆盖 Tab、Space、方向键、Escape、焦点返回；Select / Checkbox / Slider / 日期 / 颜色 / Modal嵌套交互逐项验证。
5. 用户主色、跟随系统、portal主题、中文输入和读屏标签可用；隐藏原生表单元素不作为视觉违规。
6. 同一交互区仅一个主要动作；组件圆角、尺寸、字重和状态与未覆写的HeroUI3.2.6同变体样例一致；视觉diff与真实截图作为证据。
7. 库导入与设置适配可追溯；组件统一随上游主题与公开变体变化，不以逐页CSS覆盖维持一致性。

初步排期仅作范围估计：A约0.5–1天，B约1–3天，C/D合计约2–4天，E/F约3–6天；总计约6.5–14人日，不含新增业务功能。试点后按类型错误、依赖冲突和页面实际调用重新估计，不能将静态计数视为已测工时。

## 9. 与现有文档和预览的关系

本次不删除 `tokens.json`、58类目录或HTML预览，也不把待实施方案标记为已上线。它们保留为旧自建方案与现状记录；后续HeroUI迁移以本文确定的原生风格为准，旧圆角、密度、字体和形状令牌不得反向约束新组件。

采纳并通过A阶段后：

- 将本目录README和 `docs/design-guidelines.md` 的当前规范指向 HeroUI edition；`src/renderer/AGENTS.md` 同步，不再强制复刻旧58类组件尺寸。
- 精简令牌源为项目业务布局与必要的用户设置适配；组件外观直接消费上游token，不复制一套颜色、字体或形状令牌。
- `design:check` 改验设置适配、依赖版本、工作台覆盖及意外样式覆写；旧生成器归档或改造，不能以旧HTML验证代替生产验证。
- 工作台展示组件名称、用途、公开变体、当前实际尺寸和交互状态；组件本身直接运行 HeroUI，不再手写一套HTML替身。
- 在 `migration.md` 记录已迁移页面、兼容层、例外与退出条件；只移除已无调用的旧依赖。

下一步的具体试点执行清单见 [HeroUI接入试点计划](../superpowers/plans/2026-10-22-heroui-pilot.md)。

## 10. 一手资料入口

- [HeroUI 仓库](https://github.com/heroui-inc/heroui)：当前源码、许可证和版本线。
- [v3.2.6 React 精确包元数据](https://registry.npmjs.org/@heroui/react/3.2.6)、[Styles 精确包元数据](https://registry.npmjs.org/@heroui/styles/3.2.6)：peer、exports、发布包下载地址。
- [v2.7.11 精确包元数据](https://registry.npmjs.org/@heroui/react/2.7.11)、[对应 theme2.4.17](https://registry.npmjs.org/@heroui/theme/2.4.17)：历史退路的具体依据。
- [HeroUI 官方文档](https://www.heroui.com/docs/react/getting-started/quick-start)、[官方 v3 Storybook](https://storybook-v3.heroui.com/)：组件组合与视觉状态。
- [Tailwind4 升级指南](https://tailwindcss.com/docs/upgrade-guide)：构建插件、CSS配置与默认utility变化。
- [React19 升级指南](https://react.dev/blog/2024/04/25/react-19-upgrade-guide)：React / ReactDOM / 类型与迁移检查。

精确证据、版本差异和发布包核对细节以 [heroui-research.md](heroui-research.md) 为准。性能、包体、Electron运行期和读屏表现尚需试点实测，不引用官网宣传当本项目测试结果。
