# dsh-desktop 参考分析（锁定来源）

- 调研日期：2026-10-21
- 参考仓库：https://github.com/anywhere-labs/dsh-desktop
- 参考提交：0f72133c150dc7a0ae673558703ea4e6b3dc18e3（master）
- 主 Harness 子模块：deepseek-harness@687f282e8625c6b8d11ff58211a90524be2e4317
- 本文区分“源码事实”和“设计解读”，不把参考项目的视觉选择当作 Material 3 规范。

## 结论

参考项目的核心语言是中性表面、细边界、紧凑控件和单一蓝色业务强调。主 Harness 对话页依赖留白、分栏和状态文字，而不是大量彩色卡片；截图中侧栏略亮于主区，活跃项与发送动作使用蓝色。dsh-desktop 自己的原生设置窗使用同一套中性语义，但组件层有独立的 Inter 字体与 shadcn/Base UI 尺寸。MyDashboard 应采纳这种克制的层级，并保留现有 AI Lab 的信息架构与紫色品牌强调。

## 源码事实

### 颜色与表面（主 Harness）

来自上游 packages/client/ui-theme/src/styles/design-platform.css：

| 语义               | 亮色                            | 暗色                              |
| ------------------ | ------------------------------- | --------------------------------- |
| base               | #FFFFFF                         | #151517                           |
| sidebar            | #F9FAFB                         | #1B1B1C                           |
| layer 1            | #FFFFFF                         | #232324                           |
| layer 2            | #FFFFFF                         | #2C2C2E                           |
| primary text       | #0F1115                         | #F9FAFB                           |
| secondary text     | #61666B                         | #CFD3D6                           |
| border L1/L2/L3/L4 | rgba(0,0,0,.04/.10/.12/.16)     | rgba(255,255,255,.06/.12/.16/.20) |
| business blue      | #4176E6（部分状态使用 #7AAAFF） | #7AAAFF / #5686FE                 |

主 Harness 使用系统字体栈：
-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif；代码字体为 SF Mono/JetBrains Mono/Fira Code/Consolas 等。

### 尺寸与组件（主 Harness）

来自 packages/client/ui-primitives/src/Button.module.css、Input.module.css 与 ui-theme/src/styles/base.css：

- Button 中尺寸 .md 为 36px 高、12px 圆角、14px/22px；compact .sm 为 28px 高、8px 圆角、12px/18px；图标 16px。
- 输入包裹器为 32px 高、12px 圆角、8px 水平内距；输入文字 14px/22px。
- 全局角半径由 4/8/12/16/20/28px（xs/sm/md/lg/xl/panel）组成；过渡 100/200/300ms，曲线 cubic-bezier(.4,0,.2,1)。
- 主界面状态层级常通过 0.04—0.16 的透明边界和 hover/active 中性填充实现。

### dsh-desktop 原生设置窗（独立证据）

固定提交的 dsh-plugin-desktop/src/native-ui/shared/theme.css 使用 Inter Variable；components/ui/button.tsx 明确：默认 Button 32px 高、8px 圆角、14px/500、图标16px；sm 28px、lg36px、icon32px。input.tsx 明确输入 36px 高、8px 圆角；tabs.tsx 明确 tabs 容器 40px 高/12px 圆角/padding4，trigger 32px/8px；card.tsx 为 12px 圆角、1px 边界、shadow-sm；dialog.tsx 为 16px 圆角、24px padding、shadow-xl；badge.tsx 为 6px 圆角、12px 字号。

这些数值说明 8px 控件圆角在参考中有充分依据，但不能把 Inter 或 32px 高度强行套到主 Harness 现有页面。

## 可见证据

仓库 README 的产品截图是第一方视觉证据：

- https://raw.githubusercontent.com/anywhere-labs/dsh-desktop/0f72133c150dc7a0ae673558703ea4e6b3dc18e3/assets/desktop-chat-zh.png
- https://raw.githubusercontent.com/anywhere-labs/dsh-desktop/0f72133c150dc7a0ae673558703ea4e6b3dc18e3/assets/desktop-preview.png

截图呈现固定左栏、细分隔线、紧凑导航行、窄顶部标签区、居中的正文和底部输入区。这里只判断视觉结构，不从缩放截图反推 CSS 尺寸。截图中紫色并非参考项目主要业务色，蓝色强调更克制。

## 对 MyDashboard 的可迁移规则

1. 颜色：将页面/卡片表面改为中性（亮 #FFFFFF/#F9FAFB，暗 #151517/#232324），保留品牌紫只用于 primary、active indicator 与关键数据；避免每个卡片都使用紫色边框。
2. 层级：优先使用 surface 对比和 1px 低透明度边界；阴影只给浮层（约 0 8px 24px rgba(15,17,21,.10)），普通卡片不加厚阴影。
3. 尺寸：普通按钮/输入采用现有项目可兼容的 36/32 高度；紧凑工具栏可用 28/32；圆角统一 8（按钮/输入/标签）与 12（卡片）；弹窗 16。触控场景仍保持 48 最小命中区。
4. 排版：沿用 MyDashboard 当前中文系统字体和现有字号层级；使用 14px/22px 作为正文，12px/18px 辅助，避免放大标题挤压 AI Lab 的真实信息密度。
5. 布局：保留现有 AI Lab 侧栏、Radar + Usage 的 5:7 栅格、横向订阅卡片和工具目录顺序；不新增独立大页头，只校准间距与层级。底部音频播放器等应作为局部固定区或就近控件处理。

## 变更建议等级

- P1（建议）：建立亮/暗中性 surface 与文本对比；统一按钮、输入、选择器的形状和密度；复核焦点环和禁用态。中性色与8px本身是审美选择，不能仅据此判为P0；具体项目严重等级以 layout-audit.md 为准。
- P1（建议）：普通卡片从重紫背景改为白/中性表面，紫色只作 active/primary；卡片 12px 圆角、1px 透明边界；减少页面视觉噪声但不改信息架构。
- P1（建议）：将全局正文与辅助字号锁到 14/22、12/18，并校准标题字重；不变更模块顺序。
- P2（可选）：AI Lab 外层 padding 从 48 收紧至 40（窄宽度 24），gap 从 24 收紧至 20；仅当实际页面滚动长度/信息密度仍不佳再改。
- P2（可选）：标题区新增操作入口或重排目录；会改变现有排版，当前不建议直接实施。

## 限制

参考项目包含两个层级：主 Harness（主对话）与 dsh-desktop native-ui（设置/恢复窗口）。它们共享中性色与圆角尺度，但组件高度、字体来源不同。这里提取的是可验证的迁移原则，不是对整页复制。

## 主来源索引

- [Desktop README 与架构边界](https://github.com/anywhere-labs/dsh-desktop/blob/0f72133c150dc7a0ae673558703ea4e6b3dc18e3/README.md)：主 UI 来自固定上游，桌面壳负责窗口和插件组合。
- [子模块来源](https://github.com/anywhere-labs/dsh-desktop/blob/0f72133c150dc7a0ae673558703ea4e6b3dc18e3/.gitmodules)：上游为 deepseek-ai/deepseek-harness。
- [主 Harness 颜色语义](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/ui-theme/src/styles/design-platform.css)：颜色表、边界、状态。
- [主 Harness 字体、圆角、动效](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/ui-theme/src/styles/base.css)。
- [主 Harness Button](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/ui-primitives/src/Button.module.css) 与 [Input](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/ui-primitives/src/Input.module.css)：主界面尺寸事实。
- [主 Harness Modal](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/ui-primitives/src/Modal.module.css)：使用28px panel圆角，标题16/24/500、正文14/22/400，说明16px弹窗为本项目改编而非原样复刻。
- [主 Harness 平滑圆角](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/ui-theme/src/styles/corner-shape.css)：支持时使用 superellipse(1.5)，全圆组件显式退出；本项目可后续评估，不建议第一轮依赖实验支持。
- [Native theme](https://github.com/anywhere-labs/dsh-desktop/blob/0f72133c150dc7a0ae673558703ea4e6b3dc18e3/dsh-plugin-desktop/src/native-ui/shared/theme.css)：Inter与无彩OKLCH。
- [Native Button](https://github.com/anywhere-labs/dsh-desktop/blob/0f72133c150dc7a0ae673558703ea4e6b3dc18e3/dsh-plugin-desktop/src/native-ui/components/ui/button.tsx)、[Input](https://github.com/anywhere-labs/dsh-desktop/blob/0f72133c150dc7a0ae673558703ea4e6b3dc18e3/dsh-plugin-desktop/src/native-ui/components/ui/input.tsx)、[Tabs](https://github.com/anywhere-labs/dsh-desktop/blob/0f72133c150dc7a0ae673558703ea4e6b3dc18e3/dsh-plugin-desktop/src/native-ui/components/ui/tabs.tsx)、[Card](https://github.com/anywhere-labs/dsh-desktop/blob/0f72133c150dc7a0ae673558703ea4e6b3dc18e3/dsh-plugin-desktop/src/native-ui/components/ui/card.tsx)、[Dialog](https://github.com/anywhere-labs/dsh-desktop/blob/0f72133c150dc7a0ae673558703ea4e6b3dc18e3/dsh-plugin-desktop/src/native-ui/components/ui/dialog.tsx)、[Badge](https://github.com/anywhere-labs/dsh-desktop/blob/0f72133c150dc7a0ae673558703ea4e6b3dc18e3/dsh-plugin-desktop/src/native-ui/components/ui/badge.tsx)：上文原生控件具体数值。
