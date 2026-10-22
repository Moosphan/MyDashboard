# 本轮验证记录

日期：2026-10-22；版本：3.2.0。验证范围为规范与HTML预览，生产应用未全局迁移。

## 自动检查

- `npm run design:check`：58类组件完整；令牌引用有效；深浅色角色对齐；CSS/JS/Markdown生成物与源文件一致。
- 38组常用文字配色对比度≥4.5:1；outline与control-border在基础表面对比度≥3:1。不是所有叠层与页面状态的完整对比度审计。
- JS/CJS通过Node语法检查；维护源文件按项目Prettier配置格式化。
- 本机Chrome/Playwright交互检查通过：零页面脚本错误、零失败资源请求。

## 界面验证

| 项目       | 验证内容                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| 组件目录   | 全部58类示例渲染；搜索/类别过滤/无结果状态                                                                   |
| 默认按钮   | 8px圆角、36px高、13px/500标签                                                                                |
| 密度       | compact32px / standard36px / touch48px                                                                       |
| 单源联动   | 临时覆盖control圆角，按钮与字段同时变化；正文令牌影响字段；card圆角影响卡片；hover令牌影响状态层；验证后恢复 |
| 选择与输入 | Slider方向键与aria-valuetext；输入可编辑；Radio/Checkbox使用原生语义                                         |
| 弹窗       | 打开、Escape关闭、焦点返回触发按钮                                                                           |
| AI Lab     | 添加演示订阅后卡片3→4、费用59.99→79.99；类别与名称组合筛选；清空条件恢复                                     |
| 主题       | 工作台与嵌入提案同步；独立提案深色切换；卡片、Logo、文字检查                                                 |
| 布局       | 1440 / 1024 / 768 / 390px，无页面级横向溢出；订阅局部滚动                                                    |
| 保留结构   | 280px侧栏、48px主体留白、5:7首行、横向订阅卡、4列桌面工具目录；无新增大页头                                  |
| 动效       | reduced-motion下加载旋转关闭                                                                                 |
| 对比       | Before复用本轮此前当前代码隔离实例实拍；并排使用同1440px宽度的浅色标准截图；After单独视图可交互              |

## 视觉复核

已检查浅/深主题、基础页、组件页、AI Lab与窄屏截图；修正用量5项指标被旧网格挤成两行、同步信息粘连、订阅卡冗余信息、目录分类与上层tabs混淆、图标按钮规范尺寸不一致等问题。V3是设计提案，样例内容与Before不完全相同，不能用于衡量实际业务效率。

## 截图

- [规范首页](preview-foundations.png)
- [组件工作台](preview-components.png) / [深色](preview-components-dark.png)
- [AI Lab现状](ai-lab-before.png)
- [AI Lab提案](ai-lab-after.png) / [深色](ai-lab-after-dark.png) / [窄屏](ai-lab-after-mobile.png)
- [并排对比](preview-comparison.png)

## 验收边界

本轮未做完整屏幕阅读器审计，也未对58类预留组件实现全部生产交互。日期范围、12小时制、透明度、菜单、侧面板、拖拽等部分为预留或设计示意。正式共享组件落地后需要补真实组件交互、读屏、200%缩放与业务回归。布局建议、等级与采用边界见[layout-audit.md](layout-audit.md)，迁移步骤见[migration.md](migration.md)。

## V3.1 专项验收

检查组件页目录往返切换、完整规格展开、Tabs方向键/面板关联、Switch Space切换、Radio方向键、错误字段hover仍保留错误边框；复核浅/深主题的操作、输入、导航、菜单与上传控件。成熟度徽标改为中性色，未将未来组件标为已实现。

## V3.2 自绘控件验收

- Select：选中check、方向键/Enter、Escape取消、End跳过禁用项、字符定位、外部点击收起；隐藏select表单值同步。
- Combobox：输入过滤、无结果、方向键选择、Tab收起；不再连接系统datalist弹层。
- 日期：方向键移日、PageDown翻月、手输无效日期反馈；时间：快捷项与任意分钟手输、越界反馈；颜色：无效HEX反馈和有效HEX应用。
- Checkbox：appearance:none，checked/unchecked/indeterminate/disabled；半选Space切换；Radio/Switch/Slider沿用前述键盘回归。
- 嵌套Dialog中Select可选择服务商；Escape先关闭浮层，保持Dialog；提交值正确。390px下浮层位于视口内。
- Tooltip、数字输入、树、滚动条与浏览器校验气泡统一处理。文件选择器和系统权限仍由OS提供。
- 深浅主题选择浮层与日历截图：[Select浅色](preview-select-light.png) / [深色](preview-select-dark.png)、[日历浅色](preview-calendar-light.png) / [深色](preview-calendar-dark.png)。
