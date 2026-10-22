# 组件规格目录

版本 3.2.0 · 58 类组件 · 由 scripts/design-system.cjs 生成。修改 components.json 与 tokens.json 后重新生成。

所有组件继承 [全局状态、可访问性与变更流程](README.md)。状态“已有/局部”表示项目存在对应模式，不表示生产代码已符合当前版本。

## 按钮 Button

- 类别：操作；来源：M3；项目情况：已有
- 使用：页面提交、保存、生成；每个操作区域只设一个 filled 主操作。
- 变体：filled / neutral / tonal / outlined / text / elevated / danger

| 规范项 | 数值 / 规则 |
| --- | --- |
| 高度 | 36px；compact 32px；touch 48px |
| 圆角 | 8px，项目定制 |
| 标签 | 13px / 20px / 500；高密度桌面标签，正文仍为14px |
| 图标 | 16px，间距6px |
| 颜色 | filled primary/on-primary；neutral surface-low/on-surface；tonal为品牌强调的次要动作；danger默认柔和底，最终确认用solid |
| 边框 | outlined 1px outline-variant；输入 outline 与装饰边界不得混用 |
| 水平内距 | 12px；纯图标按钮使用正方形容器 |

交互：loading 保留宽度与标签，设置 aria-busy；focus-visible 独立描边；禁用不响应。

令牌：`size.control`、`size.compact`、`size.touch`、`shape.control`、`type.label-lg.size`、`type.label-lg.line`、`type.label-lg.weight`、`size.iconInline`、`size.divider`、`space.3`

## 图标按钮 Icon button

- 类别：操作；来源：M3；项目情况：已有
- 使用：刷新、关闭、播放、更多；可见提示和可访问名称必须同时提供。
- 变体：standard / filled / tonal / outlined / toggle

| 规范项 | 数值 / 规则 |
| --- | --- |
| 容器 | 32px × 32px；touch 48px |
| 图标 | 18px，工具栏优先16px；wght400；图形居中 |
| 圆角 | 8px；工具栏保持方形轮廓；播放主按钮可用 full |
| 颜色 | standard on-surface-variant；selected primary-container/on-primary-container |
| 边框 | outlined 1px outline-variant；rest无需方框，hover使用中性底 |

交互：toggle 用 aria-pressed；tooltip 在 hover 与键盘聚焦出现，触屏不依赖 tooltip。

令牌：`size.iconButton`、`size.touch`、`size.icon`、`shape.control`、`size.divider`

## 浮动操作按钮 FAB

- 类别：操作；来源：M3；项目情况：预留
- 使用：窄屏页面唯一的高频创建动作；桌面工作台默认用普通按钮。
- 变体：small / regular / large / extended / menu

| 规范项 | 数值 / 规则 |
| --- | --- |
| 尺寸 | 40px / 56px / 96px |
| 圆角 | small 8px；regular 16px；large 16px |
| 图标 | 20 / 24 / 36px |
| 扩展 | 高 56px；左右 16px；标签 13px |
| 外观 | primary-container/on-primary-container；elevation 3 |

交互：固定在内容安全区，离边缘24px；菜单展开后 Escape 收起且焦点返回触发器。

令牌：`size.fabSmall`、`size.fab`、`size.fabLarge`、`shape.nested`、`shape.fab`、`shape.dialog`、`space.4`、`type.label-lg.size`

## 分段按钮 Segmented buttons

- 类别：操作；来源：M3；项目情况：局部
- 使用：同一数据的视图、粒度或排序切换；不作为二级页面导航。
- 变体：single / multiple

| 规范项 | 数值 / 规则 |
| --- | --- |
| 高度 | 36px；compact 32px |
| 圆角 | 组 8px；内部 6px，padding3px，间隙2px |
| 边框 | 中性surface-container底；选项无共享边框，不与connected按钮组混用 |
| 标签 | 13px / 500；选中 check 16px |
| 颜色 | selected surface-lowest/on-surface + elevation1；inactive on-surface-variant |

交互：单选用 radiogroup/方向键；多选用 aria-pressed；选中后宽度保持不变。

令牌：`size.control`、`size.compact`、`shape.control`、`shape.inset`、`type.label-lg.size`、`size.iconInline`

## 按钮组 / 拆分按钮

- 类别：操作；来源：M3 扩展；项目情况：预留
- 使用：相关动作组合；拆分按钮提供一个默认动作与可选动作菜单。
- 变体：connected / split / toggle-group

| 规范项 | 数值 / 规则 |
| --- | --- |
| 高度 | 36px |
| 圆角 | 外侧 8px；内部 4px |
| 间距 | connected 2px；loose 8px |
| 菜单触发 | 宽 32px；chevron 18px |
| 标签 | 13px / 500 |

交互：默认动作与菜单触发器分别可聚焦、分别命名；不要把全部动作包成一个按钮。

令牌：`size.control`、`shape.control`、`shape.tiny`、`space.2`、`size.iconButton`、`size.icon`、`type.label-lg.size`

## 工具栏 Toolbar

- 类别：操作；来源：M3 / 项目适配；项目情况：已有
- 使用：编辑器、视频时间线、表格批量操作。
- 变体：fixed / contextual / floating

| 规范项 | 数值 / 规则 |
| --- | --- |
| 高度 | 标准 48px；宽松64px |
| 图标 | 18px；触发器 32px |
| 圆角 | 固定 0px；浮动 8px |
| 间距 | 组内 4px；组间 16px |
| 外观 | surface-lowest；分隔线 1px outline-variant |

交互：role=toolbar；方向键移动、Home/End；上下文工具栏保留清晰的退出选择动作。

令牌：`size.touch`、`size.icon`、`size.iconButton`、`shape.none`、`shape.nested`、`space.1`、`space.4`、`size.divider`

## 文本输入框 Text field

- 类别：输入与选择；来源：M3 适配；项目情况：已有
- 使用：名称、链接、API地址和短文本；固定外置标签避免占位符代替标签。
- 变体：outlined / filled / password / number / read-only

| 规范项 | 数值 / 规则 |
| --- | --- |
| 高度 | 36px；compact 32px；touch 56px |
| 圆角 | 8px，项目定制 |
| 文字 | 14px / 22px / 400 |
| 标签 | 13px / 500，距控件6px |
| 内距 | 水平 12px；图标 18px |
| 边框 | 1px control-border，基础表面对比≥3:1；focus 2px focus + 3px柔和光环；尺寸不变 |
| 颜色 | surface-lowest/on-surface；placeholder on-surface-variant |

交互：label 关联 id；错误文案用 aria-describedby 与 aria-invalid；保留用户输入并给出修正方法。

令牌：`size.field`、`size.compact`、`size.fieldTouch`、`shape.control`、`type.body-md.size`、`type.body-md.line`、`type.label-lg.size`、`space.3`、`size.icon`

## 多行输入 Textarea

- 类别：输入与选择；来源：M3 适配；项目情况：已有
- 使用：配音文案、描述和提示词；长文章改用编辑器。
- 变体：fixed / autosize / counter

| 规范项 | 数值 / 规则 |
| --- | --- |
| 最小高度 | 112px；最大高度320px，之后内部滚动 |
| 圆角 | 8px |
| 文字 | 14px / 22px / 400 |
| 内距 | 12px |
| 边框 | 与 Text field 相同；计数 12px |

交互：标签、帮助、错误、计数分离；超过限制明确说明，不在输入中途无提示截断。

令牌：`shape.control`、`type.body-md.size`、`type.body-md.line`、`space.3`、`type.body-sm.size`

## 选择器 Select

- 类别：输入与选择；来源：M3 适配；项目情况：已有
- 使用：模型、音色、分类等有限选项；超过10项优先可搜索 Combobox。
- 变体：single / grouped / multi

| 规范项 | 数值 / 规则 |
| --- | --- |
| 触发器 | 高 36px，圆角 8px |
| 文字 | 14px / 400；标签 13px |
| 图标 | expand_more 16px，距右10px |
| 弹层 | 自绘浮层，圆角 8px；行高 32px；4px内距，避让视口边缘 |
| 颜色 | surface-lowest；选中 primary-container/on-primary-container |
| 边框 | 1px control-border；16px chevron；focus 2px focus；选中check，不使用系统菜单 |

交互：共享Select（生产推荐Radix）；自绘触发器与listbox，方向键/Home/End/字符定位/Enter/Escape/Tab；禁用项跳过；保留label与表单值。

令牌：`size.field`、`shape.control`、`type.body-md.size`、`type.label-lg.size`、`size.iconInline`、`size.menuRow`

## 自动完成 Combobox

- 类别：输入与选择；来源：M3 适配；项目情况：局部
- 使用：大量模型、工具、标签和可搜索数据源。
- 变体：single / multiple / async

| 规范项 | 数值 / 规则 |
| --- | --- |
| 触发器 | 36px；圆角 8px |
| 结果行 | 32px；文字 14px |
| 弹层 | 最大高320px；elevation 2 |
| 状态 | loading / no results / error / selected |

交互：aria-expanded/controls/activedescendant；输入不直接提交；多选 Backspace 删除最后项前有清晰反馈。

令牌：`size.field`、`shape.control`、`size.menuRow`、`type.body-md.size`

## 复选框 Checkbox

- 类别：输入与选择；来源：M3；项目情况：已有
- 使用：独立开关项、批量选择、明确的必要确认。
- 变体：unchecked / checked / indeterminate

| 规范项 | 数值 / 规则 |
| --- | --- |
| 图形 | 16px，4px圆角，1px control-border；自绘check与半选横线 |
| 目标 | 32px；touch 48px |
| 标签 | 14px / 400；间距 8px |
| 颜色 | checked primary/on-primary；unchecked on-surface-variant |

交互：保留input checkbox语义，appearance:none统一外观；Space切换；checked/unchecked/indeterminate/disabled齐全；forced-colors可回退系统外观。

令牌：`size.checkbox`、`size.iconButton`、`size.touch`、`type.body-md.size`、`space.2`

## 单选按钮 Radio

- 类别：输入与选择；来源：M3；项目情况：已有
- 使用：2–5个互斥配置，例如预设音色/声音克隆。
- 变体：horizontal / vertical / description

| 规范项 | 数值 / 规则 |
| --- | --- |
| 图形 | 16px，1px control-border；选中中心点6px，primary |
| 目标 | 32px；touch 48px |
| 文字 | 14px / 400 |
| 颜色 | selected primary；rest on-surface-variant |
| 间距 | 标签 8px；选项 24px |

交互：同组共享 name 和可见组名；方向键切换、Tab 进入组；选中变化不能触发页面导航。

令牌：`size.radio`、`size.iconButton`、`size.touch`、`type.body-md.size`、`space.2`、`space.6`

## 开关 Switch

- 类别：输入与选择；来源：M3 行为 / DSH 桌面适配；项目情况：已有
- 使用：立即生效的二元设置；需要提交的表单优先 Checkbox。
- 变体：off / on / with-icon

| 规范项 | 数值 / 规则 |
| --- | --- |
| 轨道 | 36px × 20px |
| 滑块 | 16px；on/off保持同尺寸，左右2px内距 |
| 圆角 | 9999px |
| 边框 | 1px control-border；on边框融入primary；触控48px命中区域 |
| 颜色 | on primary/on-primary；off surface-container + surface-lowest滑块 |

交互：role=switch 或原生可访问控件；Space 切换；说明影响范围；异步保存失败恢复并显示错误。

令牌：`size.switchWidth`、`size.switchHeight`、`size.switchThumb`、`shape.full`

## 滑动条 Slider

- 类别：输入与选择；来源：M3 适配；项目情况：局部
- 使用：语速、音高、音量、时间进度；精确数值可辅以数字输入。
- 变体：continuous / discrete / range

| 规范项 | 数值 / 规则 |
| --- | --- |
| 轨道 | 4px；激活 primary；未激活 surface-highest |
| 滑块 | 16px 圆形；surface-lowest，2px primary边界，elevation1 |
| 交互行 | 40px；touch 48px |
| 数值 | 12px，tabular-nums |
| 间距 | 滑块与旁侧标签至少 12px |

交互：原生 range；方向键步进、Home/End；aria-valuetext 带单位；双滑块分别命名，不能穿越。

令牌：`size.sliderTrack`、`size.sliderThumb`、`size.sliderTarget`、`size.touch`、`type.body-sm.size`、`space.3`

## 标签选项 Chips

- 类别：输入与选择；来源：M3；项目情况：已有
- 使用：筛选、多选标签、辅助动作和输入实体；静态状态改用 Badge。
- 变体：assist / filter / input / suggestion

| 规范项 | 数值 / 规则 |
| --- | --- |
| 高度 | 28px；compact 24px |
| 圆角 | 8px |
| 文字 | 12px / 500 |
| 内距 | 左右10px；图标 16px；间距6px |
| 颜色 | selected primary-container/on-primary-container |
| 边框 | rest 1px outline-variant；selected低强度primary混色边界；不使用粗灰边框 |

交互：filter 用 aria-pressed；input 删除按钮独立命名；选择与移除时不发生布局跳动。

令牌：`size.chip`、`size.chipCompact`、`shape.chip`、`type.label-md.size`、`size.iconInline`

## 搜索 Search

- 类别：输入与选择；来源：M3 适配；项目情况：已有
- 使用：全局命令搜索与工具目录过滤。
- 变体：bar / expanded-view / command

| 规范项 | 数值 / 规则 |
| --- | --- |
| 高度 | 桌面 36px；独立搜索栏56px |
| 圆角 | 8px；expanded 16px |
| 图标 | search 18px |
| 颜色 | surface-low/on-surface；提示 on-surface-variant |
| 快捷键 | 12px，独立 kbd |

交互：Cmd/Ctrl+K 打开；结果可方向键选择；Escape 清空或关闭；公告结果数量但不逐键打断读屏。

令牌：`size.control`、`shape.control`、`shape.dialog`、`size.icon`、`type.label-md.size`

## 日期选择 Date picker

- 类别：输入与选择；来源：M3；项目情况：局部
- 使用：续费、截止日期、日期范围。
- 变体：docked / modal / range / input

| 规范项 | 数值 / 规则 |
| --- | --- |
| 输入 | 高 36px；圆角 8px |
| 弹层 | 桌面docked312px；8px圆角、4px内距；touch380px，视口不足时收窄 |
| 日期格 | 桌面36px；touch48px；gap2px |
| 文字 | 日期/月份 13px；月份500，日期400 |
| 选中 | primary/on-primary；区间 primary-container |

交互：支持键盘手输；显示格式与本地时区；箭头移日、PageUp/Down 移月；禁用日期提供原因。

令牌：`size.field`、`shape.control`、`type.label-lg.size`

## 时间选择 Time picker

- 类别：输入与选择；来源：M3；项目情况：预留
- 使用：提醒、定时任务和媒体片段时间。
- 变体：dial / input / 12h / 24h

| 规范项 | 数值 / 规则 |
| --- | --- |
| 输入 | 36px；圆角 8px |
| 弹窗 | 桌面自绘listbox，与触发器所在字段等宽、最小220px；8px圆角 |
| 数值 | 14px / 400 / tabular-nums；列表13px |
| 文字 | 14px；操作 13px |

交互：桌面手输HH:mm到分钟，自绘快捷列表每30分钟；方向键/Enter/Escape；时区明确；越界输入保留并显示行内错误。12h/dial为预留变体。

令牌：`size.field`、`shape.control`、`type.body-md.size`、`type.label-lg.size`

## 颜色选择 Color picker

- 类别：输入与选择；来源：项目；项目情况：局部
- 使用：封面、图表与内容自定义；主题色通过语义令牌管理。
- 变体：swatches / hex / alpha

| 规范项 | 数值 / 规则 |
| --- | --- |
| 色块 | 32px；目标 32px |
| 圆角 | 色块6px；弹层 8px；宽260px |
| 输入 | 36px；mono 14px |
| 选中 | check配中性圆底；HEX与可访问名称同时表达颜色；非仅颜色 |

交互：自绘色板与HEX字段；支持校验、键盘输入与行内错误；Escape关闭且焦点返回；alpha为预留变体，后续明确0–100%。

令牌：`size.compact`、`size.iconButton`、`shape.control`、`size.field`、`type.body-md.size`

## 文件上传 / 拖放区

- 类别：输入与选择；来源：项目；项目情况：已有
- 使用：音色、图片、视频和文档导入。
- 变体：button / dropzone / uploading / failed

| 规范项 | 数值 / 规则 |
| --- | --- |
| 区域 | 最小高128px；padding 24px |
| 圆角 | 8px |
| 边框 | 1px dashed outline；dragover 2px primary |
| 图标 | 24px；正文 13px / 400 |
| 反馈 | 文件名、格式、大小、进度、取消/重试 |

交互：可点击按钮与键盘导入；明确支持格式/大小；错误逐文件显示；不得仅支持拖放。

令牌：`space.6`、`shape.control`、`type.label-lg.size`

## 卡片 Card

- 类别：容器与数据；来源：M3；项目情况：已有
- 使用：独立信息单元、工具、统计与订阅；嵌套优先无边框分区。
- 变体：outlined / filled / elevated / interactive

| 规范项 | 数值 / 规则 |
| --- | --- |
| 圆角 | 12px；嵌套 8px |
| 内距 | 20px；compact 16px |
| 标题 | 16px / 600 |
| 颜色 | outlined surface-lowest；filled surface-low |
| 边框 | outlined 1px outline-variant；其余无 |
| 层级 | surface-lowest；1px outline-variant；静态卡片 elevation 0，不做悬浮位移 |

交互：整卡可点用链接或按钮语义；卡内多操作时卡体不再是嵌套按钮；hover 不上移。

令牌：`shape.card`、`shape.nested`、`layout.cardPadding`、`space.4`、`type.title-md.size`

## 列表 List

- 类别：容器与数据；来源：M3；项目情况：已有
- 使用：任务、生成记录、设置、通知。
- 变体：one-line / two-line / three-line / selectable

| 规范项 | 数值 / 规则 |
| --- | --- |
| 行高 | 单行 48px；两行72px；三行88px；compact 40px |
| 文字 | 主 14px；副 12px |
| 内距 | 水平 16px；元素间 12px |
| 图标 | 18px；头像40px |
| 边界 | 分隔线1px outline-variant，按组使用 |

交互：列表项使用真实链接或按钮；操作不依赖 hover；多选与导航分清；长内容可增高。

令牌：`size.row`、`size.rowCompact`、`type.body-md.size`、`type.body-sm.size`、`space.4`、`space.3`、`size.icon`

## 数据表格 Table

- 类别：容器与数据；来源：项目 / Material 数据模式；项目情况：已有
- 使用：订阅、历史任务、资产和结构化数据。
- 变体：standard / dense / selectable / sortable

| 规范项 | 数值 / 规则 |
| --- | --- |
| 行高 | 48px；dense 40px；表头48px |
| 字号 | 正文 14px；表头 12px / 500 |
| 内距 | 水平 16px |
| 边框 | 行底1px outline-variant；外框 8px |
| 数字 | tabular-nums，金额/数值右对齐 |
| 颜色 | header surface-low；row surface-lowest |

交互：语义 table、th scope；排序 aria-sort；溢出保留横向滚动；主键列优先固定；窄屏可切列表。

令牌：`size.row`、`size.rowCompact`、`type.body-md.size`、`type.label-md.size`、`space.4`、`shape.nested`

## 轮播 Carousel

- 类别：容器与数据；来源：M3；项目情况：局部
- 使用：媒体、封面与有序内容预览；关键数据优先列表或网格。
- 变体：multi-browse / uncontained / hero / fullscreen

| 规范项 | 数值 / 规则 |
| --- | --- |
| 圆角 | 12px |
| 间距 | 8px；容器内距 16px |
| 导航 | 32px 圆形按钮 |
| 文字 | 14px |
| 布局 | 主项+部分下一项，提示可滚动 |

交互：手动切换为默认；键盘与滚动均可操作；自动播放提供暂停，遵循 reduced-motion。

令牌：`shape.card`、`space.2`、`space.4`、`size.iconButton`、`type.body-md.size`

## 分隔线 Divider

- 类别：容器与数据；来源：M3；项目情况：已有
- 使用：分组、卡片内部与工具栏分隔；不为每个子元素加框。
- 变体：full / inset / vertical

| 规范项 | 数值 / 规则 |
| --- | --- |
| 粗细 | 1px |
| 颜色 | outline-variant |
| 缩进 | 16px，带图标对齐文字列 |
| 间隔 | 上下 16px |

交互：纯装饰 aria-hidden；有语义的分隔使用 hr 或 separator。

令牌：`size.divider`、`space.4`

## 树形目录 Tree

- 类别：容器与数据；来源：项目；项目情况：局部
- 使用：资源目录、文档层级与项目结构。
- 变体：navigation / multi-select

| 规范项 | 数值 / 规则 |
| --- | --- |
| 行高 | 32px；touch 48px |
| 缩进 | 每级 16px |
| 圆角 | 8px |
| 图标 | 16px；展开图标 16px |
| 文字 | 14px |

交互：tree/treeitem；左右展开折叠，上下移动；避免靠缩进单独表达层级。

令牌：`size.compact`、`size.touch`、`space.4`、`shape.control`、`size.iconInline`、`size.iconSmall`、`type.body-md.size`

## 图表 / 指标 Chart

- 类别：容器与数据；来源：项目；项目情况：已有
- 使用：用量、趋势、热力图、财务与统计。
- 变体：bar / line / heatmap / metric / donut

| 规范项 | 数值 / 规则 |
| --- | --- |
| 主指标 | 32px / 600 / tabular-nums |
| 刻度 | 12px；标签至少12px |
| 颜色 | chart-1..4；语义状态用 success/warning/error |
| 网格 | 1px outline-variant；线宽2px |
| 形状 | 柱顶 4px；不要装饰性3D |

交互：有标题、单位、时间范围、数据来源；提供文本摘要/数据表；未知值显示—，不伪装为0。

令牌：`type.headline-lg.size`、`type.body-sm.size`、`shape.tiny`

## 顶部应用栏 App bar

- 类别：导航；来源：M3 适配；项目情况：已有
- 使用：全局搜索、通知和个人入口；页面标题位于内容区。
- 变体：small / medium / large / bottom

| 规范项 | 数值 / 规则 |
| --- | --- |
| 高度 | 桌面 56px；移动 small64px / medium112px / large152px |
| 颜色 | surface；scrolled surface-low |
| 内距 | 24px；移动 16px |
| 图标 | 18px，目标 32px |
| 边界 | 底部分隔线1px outline-variant |

交互：macOS 拖拽区与交互控件分开；sticky 时不覆盖键盘焦点；bottom app bar 需安全区。

令牌：`layout.topbar`、`space.6`、`space.4`、`size.icon`、`size.iconButton`

## 侧边导航 Navigation drawer

- 类别：导航；来源：M3 适配；项目情况：已有
- 使用：桌面主要模块；本项目固定侧栏。
- 变体：standard / modal

| 规范项 | 数值 / 规则 |
| --- | --- |
| 宽度 | 280px；modal 320px |
| 条目 | 高 48px；圆角 8px |
| 内距 | 容器 12px；条目 16px |
| 文字 | 13px / 500 |
| 颜色 | 背景 surface-low；selected primary-container/on-primary-container |
| 图标 | 18px；选中 FILL 1 |

交互：当前页面 aria-current=page；折叠不丢失标签；modal 困住焦点、Escape关闭、焦点返回。

令牌：`layout.sidebar`、`size.touch`、`shape.navigation`、`space.3`、`space.4`、`type.label-lg.size`、`size.icon`

## 导航轨 Navigation rail

- 类别：导航；来源：M3；项目情况：预留
- 使用：600–1023px中等宽度，为内容释放空间。
- 变体：standard / with-fab

| 规范项 | 数值 / 规则 |
| --- | --- |
| 宽度 | 80px |
| 项目 | 最小高64px；指示区56×32px |
| 圆角 | 指示区 9999px |
| 文字 | 12px / 500 |
| 图标 | 24px；selected FILL 1 |

交互：3–7个主目的地；当前位置 aria-current；标签默认可见；更多模块放抽屉。

令牌：`layout.rail`、`shape.full`、`type.label-md.size`

## 底部导航 Navigation bar

- 类别：导航；来源：M3；项目情况：预留
- 使用：小于600px的3–5个顶层页面。
- 变体：labeled / active-label

| 规范项 | 数值 / 规则 |
| --- | --- |
| 高度 | 80px + safe-area |
| 指示区 | 64×32px；圆角 9999px |
| 图标 | 24px；标签 12px |
| 颜色 | surface-low；selected primary-container |
| 布局 | 等宽，无横向滚动 |

交互：保持位置与项目稳定；不要把创建/删除当导航项；键盘可达。

令牌：`shape.full`、`type.label-md.size`

## 页签 Tabs

- 类别：导航；来源：M3 语义 / DSH inset适配；项目情况：已有
- 使用：同一模块内平级内容页面；不能替代表单单选。
- 变体：inset / underline / scrollable

| 规范项 | 数值 / 规则 |
| --- | --- |
| 高度 | inset 40px，padding4px，内部32px；touch48px；underline40px |
| 文字 | 13px / 500 |
| 指示条 | inset选中surface-lowest/轻阴影；underline底部2px primary |
| 颜色 | inset中性背景/选中on-surface；underline active primary；inactive on-surface-variant |
| 圆角 | inset外 12px、内 8px；underline无圆角 |
| 布局 | 等宽或按内容宽；最多一个主页签层级 |

交互：tablist/tab/tabpanel；方向键、Home/End；无请求可自动激活，重内容用 Enter 激活。

令牌：`size.tab`、`type.label-lg.size`、`shape.tab`、`shape.control`

## 面包屑 Breadcrumb

- 类别：导航；来源：项目；项目情况：已有
- 使用：三级以上层级定位；一级模块不显示。
- 变体：standard / collapsed

| 规范项 | 数值 / 规则 |
| --- | --- |
| 高度 | 最小 32px |
| 文字 | 12px；当前 on-surface |
| 图标 | chevron_right 16px |
| 间距 | 8px；圆角 4px |

交互：nav aria-label=面包屑；当前页 aria-current；中间省略可展开且键盘可达。

令牌：`size.compact`、`type.body-sm.size`、`size.iconSmall`、`space.2`、`shape.tiny`

## 分页 Pagination

- 类别：导航；来源：项目；项目情况：局部
- 使用：大量历史记录和服务端数据；显示总数与当前范围。
- 变体：numbered / previous-next / load-more

| 规范项 | 数值 / 规则 |
| --- | --- |
| 按钮 | 32px；圆角 8px |
| 文字 | 13px / 500 |
| 间距 | 4px |
| 选中 | primary-container/on-primary-container |

交互：当前页 aria-current=page；加载后保持焦点；禁用边界按钮；用户调整每页数量后说明范围。

令牌：`size.iconButton`、`shape.control`、`type.label-lg.size`、`space.1`

## 弹窗 Dialog

- 类别：弹层；来源：M3 适配；项目情况：已有
- 使用：聚焦短任务与必要确认；复杂编辑使用工作区弹窗。
- 变体：basic / alert / form / fullscreen

| 规范项 | 数值 / 规则 |
| --- | --- |
| 宽度 | small 480px；medium 640px；large 1120px |
| 圆角 | 16px；fullscreen 0px |
| 内距 | 24px |
| 标题 | 20px / 500；正文 14px |
| 外观 | surface-lowest；elevation 3；scrim 40% |
| 布局 | 距窗口至少24px；最大高 calc(100dvh - 48px) |

交互：Radix Dialog；标题/描述关联；焦点困住并返回；表单错误不关闭；操作固定底部、内容内部滚动。

令牌：`layout.dialogSmall`、`layout.dialogMedium`、`layout.dialogLarge`、`shape.dialog`、`shape.none`、`layout.dialogPadding`、`type.title-lg.size`、`type.body-md.size`、`state.scrim`

## 底部面板 Bottom sheet

- 类别：弹层；来源：M3；项目情况：预留
- 使用：窄屏补充内容、选择与短任务。
- 变体：standard / modal

| 规范项 | 数值 / 规则 |
| --- | --- |
| 圆角 | 上侧 12px；底部 0px |
| 拖柄 | 32×4px；顶部间距 16px |
| 内距 | 24px + safe-area |
| 高度 | 最高90dvh；内容内滚动 |
| 外观 | surface-low；modal scrim 40% |

交互：提供关闭按钮，不能只靠拖动；modal 焦点困住；标准面板允许背景操作。

令牌：`shape.sheet`、`shape.none`、`space.4`、`space.6`、`state.scrim`

## 侧面板 Side sheet

- 类别：弹层；来源：M3；项目情况：已有
- 使用：详情、发布设置、通知和辅助编辑。
- 变体：standard / modal

| 规范项 | 数值 / 规则 |
| --- | --- |
| 宽度 | 360px；大编辑480px |
| 圆角 | modal 左侧 12px；standard 0px |
| 内距 | 24px |
| 标题 | 20px |
| 外观 | surface-lowest；modal elevation 3 |

交互：小屏转全屏；固定头部/底部与内部滚动；standard 不困住焦点，modal 要困住焦点。

令牌：`layout.drawer`、`shape.sheet`、`shape.none`、`space.6`、`type.title-lg.size`

## 菜单 Menu

- 类别：弹层；来源：M3；项目情况：已有
- 使用：更多动作、上下文菜单和嵌套命令。
- 变体：dropdown / context / submenu / selection

| 规范项 | 数值 / 规则 |
| --- | --- |
| 行高 | 32px；touch 48px |
| 宽度 | 最小200px、最大320px |
| 圆角 | 8px；内距 4px |
| 文字 | 13px；辅助 12px |
| 外观 | surface-lowest；elevation 2；无厚边框 |
| 图标 | 16px；危险操作 error |
| 行 | 圆角 6px；内距8px；危险项独立分隔 |

交互：Radix Menu；方向键、Home/End、输入定位、Escape；不能用 menu 盛放复杂表单。

令牌：`size.menuRow`、`size.touch`、`shape.nested`、`space.1`、`type.label-lg.size`、`type.body-sm.size`、`size.iconInline`、`shape.inset`

## 提示 Tooltip

- 类别：弹层；来源：M3；项目情况：已有
- 使用：简短解释图标或截断内容；必要说明直接可见。
- 变体：plain / rich

| 规范项 | 数值 / 规则 |
| --- | --- |
| 高度 | plain 最小 28px |
| 圆角 | plain 4px；rich 8px |
| 文字 | 12px；rich body-md |
| 内距 | plain 4px 8px；rich 16px |
| 颜色 | plain inverse-surface/inverse-on-surface |
| 时机 | hover延迟500ms；focus立即；离开即关闭 |

交互：plain 不可交互；rich 有链接时用可聚焦非模态 popover；Escape 关闭；不遮住目标。

令牌：`size.tooltip`、`shape.tiny`、`shape.nested`、`type.body-sm.size`、`space.4`

## 浮层 Popover

- 类别：弹层；来源：项目；项目情况：已有
- 使用：筛选、颜色选择与小型表单。
- 变体：anchored / non-modal

| 规范项 | 数值 / 规则 |
| --- | --- |
| 圆角 | 8px |
| 内距 | 16px |
| 宽度 | 按内容，最小240px、最大400px |
| 外观 | surface-lowest；elevation 2；1px outline-variant |
| 间隔 | 距触发器 8px |

交互：可含表单；焦点策略明确；Escape关闭、焦点返回；可见区域不足时自动换向。

令牌：`shape.nested`、`space.4`、`space.2`

## 徽标 Badge

- 类别：反馈；来源：M3 / 项目；项目情况：已有
- 使用：未读数量、简短静态状态；可交互筛选使用 Chip。
- 变体：dot / count / status

| 规范项 | 数值 / 规则 |
| --- | --- |
| 尺寸 | dot6px；count16px；status 20px |
| 圆角 | count 9999px；status 4px |
| 文字 | count 11px；status 12px / 500 |
| 颜色 | 未读 error/on-error；状态 success/warning/info对应container |
| 内距 | status 左右 8px |
| 外观 | 低强度语义混色底与细边界；组件成熟度使用中性badge，不用绿色成功态 |

交互：数量99+；状态有文字或图形；通知按钮 accessible name 包含未读数量。

令牌：`size.badge`、`shape.full`、`shape.tiny`、`type.label-sm.size`、`type.label-md.size`、`space.2`

## 进度指示 Progress

- 类别：反馈；来源：M3；项目情况：已有
- 使用：真实任务进度、额度、等待状态；额度和任务语义需标注。
- 变体：linear / circular / determinate / indeterminate

| 规范项 | 数值 / 规则 |
| --- | --- |
| 轨道 | 4px；圆形24/40px |
| 圆角 | 9999px |
| 颜色 | active primary；track primary-container |
| 文字 | 12px；百分比 tabular-nums |
| 布局 | 进度条旁保留状态与取消入口 |

交互：role=progressbar；未知进度不显示虚假百分比；长任务允许离开页面、取消与恢复。

令牌：`size.progress`、`shape.full`、`type.body-sm.size`

## 加载指示 Loading indicator

- 类别：反馈；来源：M3 扩展；项目情况：局部
- 使用：短时未定进度；数据布局已知时用 Skeleton。
- 变体：spinner / contained / expressive-reserved

| 规范项 | 数值 / 规则 |
| --- | --- |
| 尺寸 | inline20px；default40px；contained48px |
| 颜色 | primary；背景透明或 primary-container |
| 动效 | 仅加载旋转；reduced-motion 显示静态图标+文字 |
| 文字 | 12px |

交互：aria-busy 在加载区域；status 只公告阶段变化；超过10秒显示进展与重试/取消信息。

令牌：`type.body-sm.size`

## 消息条 Snackbar / Toast

- 类别：反馈；来源：M3；项目情况：已有
- 使用：操作结果、可撤销删除与非阻断反馈；表单错误就地显示。
- 变体：message / action / error

| 规范项 | 数值 / 规则 |
| --- | --- |
| 高度 | 单行至少48px；两行至少68px |
| 宽度 | 桌面320–560px |
| 圆角 | 8px |
| 颜色 | inverse-surface/inverse-on-surface；action inverse-primary |
| 文字 | 14px；动作 13px |
| 时间 | 普通5秒；含动作8秒；hover/focus暂停 |

交互：普通 role=status；紧急错误才 alert；只显示一条并排队；提供关闭；重要错误保留到处理。

令牌：`shape.control`、`type.body-md.size`、`type.label-lg.size`

## 横幅 / 内联提示 Banner

- 类别：反馈；来源：项目；项目情况：已有
- 使用：连接状态、模型缺失、权限与持续性异常。
- 变体：info / success / warning / error

| 规范项 | 数值 / 规则 |
| --- | --- |
| 圆角 | 8px |
| 内距 | 12px 16px |
| 文字 | 14px / 400 |
| 图标 | 18px；动作40px |
| 颜色 | 语义 container/on-container；非状态提示 surface-low |

交互：消息解释问题、影响和下一步；不把所有异常提升为阻断弹窗；可恢复的重试入口明确。

令牌：`shape.control`、`space.3`、`space.4`、`type.body-md.size`、`size.icon`

## 骨架屏 Skeleton

- 类别：反馈；来源：项目；项目情况：已有
- 使用：卡片、列表、数据表首屏加载。
- 变体：text / avatar / card / row

| 规范项 | 数值 / 规则 |
| --- | --- |
| 圆角 | 文本 4px；卡片跟随 12px |
| 颜色 | surface-highest |
| 动画 | 1.5秒透明度呼吸；reduced-motion关闭 |
| 布局 | 与最终内容尺寸一致，避免布局跳动 |

交互：aria-hidden；容器 aria-busy；不无限闪动，失败后切错误与重试。

令牌：`shape.tiny`、`shape.card`

## 空白 / 错误 / 离线状态

- 类别：反馈；来源：项目；项目情况：已有
- 使用：首次使用、无结果、网络失败、无权限、数据缺失。
- 变体：first-use / no-results / error / offline

| 规范项 | 数值 / 规则 |
| --- | --- |
| 内距 | 32px |
| 图标 | 32px；容器64px |
| 标题 | 16px；说明 14px |
| 动作 | 最多一个主按钮+一个文字链接 |
| 颜色 | surface；普通图标 on-surface-variant |

交互：区分尚无内容与加载失败；保留筛选条件；提供创建、清空筛选、重试等对应动作。

令牌：`space.8`、`size.iconHero`、`type.title-md.size`、`type.body-md.size`

## 通知中心

- 类别：反馈；来源：项目；项目情况：已有
- 使用：跨页面任务完成与需要后续处理的事件。
- 变体：unread / read / actionable

| 规范项 | 数值 / 规则 |
| --- | --- |
| 面板 | 宽 360px；side-sheet模式 |
| 列表 | 两行72px起；圆角 8px |
| 文字 | 标题 14px；时间 12px |
| 未读 | primary圆点+状态文字 |
| 操作 | 全部已读、逐条跳转；数量用 Badge |

交互：点击后定位相关任务；去重与已读状态持久化；不会抢焦点；不要广播无意义的频繁轮询。

令牌：`layout.drawer`、`shape.control`、`type.title-sm.size`、`type.body-sm.size`

## 品牌标志 Logo

- 类别：品牌与内容；来源：项目；项目情况：已有
- 使用：应用侧栏、关于、启动页与宣传资产。
- 变体：symbol / horizontal-lockup / monochrome

| 规范项 | 数值 / 规则 |
| --- | --- |
| 资源 | assets/app-logo.svg；保持512×512原始画布比例 |
| 尺寸 | 最小 24px；默认 32px；展示48px |
| 安全区 | 默认32px时四周至少 8px，按尺寸同比例缩放 |
| 颜色 | #8457FF / #9167FF / #F5BF2F 为固定品牌色 |
| 组合文字 | MyDashboard；20px / 600，标志间距8px |

交互：不拉伸、不加阴影、不套任意渐变；深色放在有足够对比的中性底座；单独品牌链接有可访问名称。

令牌：`brand.logoMin`、`brand.logoDefault`、`brand.logoClear`

## 图标 Icon

- 类别：品牌与内容；来源：Material Symbols；项目情况：已有
- 使用：导航、操作、状态和辅助说明。
- 变体：outlined / selected-filled / semantic

| 规范项 | 数值 / 规则 |
| --- | --- |
| 库 | Material Symbols Outlined，本地woff2；第三方品牌独立SVG |
| 尺寸 | small 16px / inline 16px / default 18px / hero 32px |
| 轴 | wght400 / GRAD0 / opsz与尺寸匹配 / FILL0 |
| 选中 | FILL1，保持同一字形与尺寸 |
| 颜色 | 继承 currentColor；状态用语义色 |

交互：装饰 aria-hidden；纯图标动作需命名；同义动作固定图标；不混用 emoji 与其他线性图标库。

令牌：`size.iconSmall`、`size.iconInline`、`size.icon`、`size.iconHero`

## 文字 Typography

- 类别：品牌与内容；来源：M3 适配；项目情况：已有
- 使用：页面标题、正文、标签、数字与长文。
- 变体：display / headline / title / body / label

| 规范项 | 数值 / 规则 |
| --- | --- |
| 字体 | 系统原生字体栈；Inter仅已安装时使用；中文PingFang SC / Microsoft YaHei回退 |
| 正文 | 14px / 22px / 400 |
| 标题 | 页 24px / 600；卡片 16px / 600 |
| 标签 | 13px / 500；辅助 12px / 400 |
| 数字 | tabular-nums；代码 mono |
| 色重 | on-surface主 / on-surface-variant次；disabled 38% |

交互：字号由角色决定，不继承 label 的加粗；中文不加英文大写字距；正文不低于12px。

令牌：`type.body-md.size`、`type.body-md.line`、`type.headline-md.size`、`type.title-md.size`、`type.label-lg.size`、`type.body-sm.size`

## 头像 Avatar

- 类别：品牌与内容；来源：项目；项目情况：已有
- 使用：个人资料、成员与内容作者；第三方logo不是用户头像。
- 变体：image / initials / group

| 规范项 | 数值 / 规则 |
| --- | --- |
| 尺寸 | 24 / 32 / 40 / 56px |
| 圆角 | 9999px |
| 颜色 | fallback primary-container/on-primary-container |
| 文字 | 32px头像用 12px / 500 |
| 状态 | 在线点8px，边框2px surface |

交互：装饰头像 alt为空；身份唯一来源时提供姓名；图片失败回退首字，避免破图。

令牌：`shape.full`、`type.label-md.size`

## 富文本 / 代码编辑器

- 类别：品牌与内容；来源：项目；项目情况：已有
- 使用：文章写作、Markdown、提示词与结构化内容。
- 变体：rich / markdown / code / preview

| 规范项 | 数值 / 规则 |
| --- | --- |
| 正文 | 16px / 28px / 400；列宽最大760px |
| 代码 | mono 13px / 22px；tab-size2 |
| 外框 | 8px；1px outline-variant |
| 工具栏 | 48px；图标 18px |
| 选择色 | primary-container；光标 primary |

交互：编辑与预览切换不丢数据；工具栏可键盘操作；粘贴保持语义；语法高亮深浅色均验对比。

令牌：`shape.nested`、`size.touch`、`size.icon`

## 音频播放器

- 类别：媒体与工作区；来源：项目；项目情况：已有
- 使用：AI配音试听、参考音色与素材播放。
- 变体：compact / waveform / workspace

| 规范项 | 数值 / 规则 |
| --- | --- |
| 播放 | 32px 圆形；图标 18px |
| 进度 | Slider；时间 12px / tabular-nums |
| 容器 | 8px；padding 16px |
| 位置 | 工作区固定试听区；列表内明确当前播放项 |
| 颜色 | surface-low；播放 primary/on-primary |

交互：一次播放一个音频；支持暂停/拖动/静音；标明时长与加载错误；不隐藏在长表单底部。

令牌：`size.iconButton`、`size.icon`、`type.body-sm.size`、`shape.nested`、`space.4`

## 视频 / 时间线 / 资产卡

- 类别：媒体与工作区；来源：项目；项目情况：已有
- 使用：Video Studio预览、封面、剪辑和资产管理。
- 变体：16:9 / 9:16 / timeline / asset

| 规范项 | 数值 / 规则 |
| --- | --- |
| 画面 | 保持原始比例；容器圆角 8px |
| 控制器 | 高 48px；图标 18px；按钮 32px |
| 缩略图 | 默认16:9；状态 Badge；名称 body-md |
| 时间线 | 轨道高48px；时间码 mono 12px |
| 颜色 | 中性底；选中 primary 2px；焦点独立 |

交互：空格播放需避免截获输入；字幕可开关；导出进度独立展示；长任务离开页面继续。

令牌：`shape.nested`、`size.touch`、`size.icon`、`size.iconButton`

## 分栏 / 工作区弹窗

- 类别：媒体与工作区；来源：项目；项目情况：已有
- 使用：AI Voiceover、浏览器、研究和编辑预览。
- 变体：editor-preview / three-pane / resizable

| 规范项 | 数值 / 规则 |
| --- | --- |
| 宽度 | 弹窗最大 1120px；预览栏320px |
| 分隔 | 1px outline-variant；拖拽目标8px |
| 圆角 | 外侧 16px；内部无嵌套大圆角 |
| 内距 | 24px；窄屏 16px |
| 滚动 | 头部/主操作固定；内容独立滚动 |

交互：小于1024px堆叠；拖拽分隔器可方向键调整；不能因内容变长丢失播放器或提交入口。

令牌：`layout.dialogLarge`、`size.divider`、`shape.dialog`、`space.6`、`space.4`

## 步骤 / 时间轴 Stepper

- 类别：媒体与工作区；来源：项目；项目情况：局部
- 使用：生成、导入、发布等有顺序的流程；不为简单表单增加步骤。
- 变体：linear / non-linear / task-timeline

| 规范项 | 数值 / 规则 |
| --- | --- |
| 节点 | 24px；目标 32px |
| 标签 | 13px；说明 12px |
| 连接线 | 2px outline-variant；completed primary |
| 颜色 | current primary；complete success；error error |

交互：标注当前/完成/失败；可返回修正；后台任务用真实阶段；不能仅靠颜色标进度。

令牌：`size.iconButton`、`type.label-lg.size`、`type.body-sm.size`

## 快捷键 / 拖拽 / 选中态

- 类别：媒体与工作区；来源：项目；项目情况：已有
- 使用：全局命令、排序、批量选择和高效桌面交互。
- 变体：kbd / drag-handle / selection

| 规范项 | 数值 / 规则 |
| --- | --- |
| 键帽 | 最小20px；mono12px；圆角 4px |
| 拖柄 | drag_indicator 16px；目标 32px |
| 选中 | primary-container + check；focus 2px描边 |
| 拖拽 | state层 16%；elevation2 |
| 反馈 | 位置、总数、可撤销 |

交互：快捷键可发现且不与文本输入冲突；拖拽有移动上/下替代动作；可见焦点不可被裁切。

令牌：`shape.tiny`、`size.iconInline`、`size.compact`、`size.focus`、`state.dragged`
