# 视频项目列表控件调整

日期：2026-10-23；分支：`feature/video_studio_workflow`。

## 用户要求与实现

- 搜索框由实测约 53.6px 高改为 40px，高度/内距/8px 圆角仅在视频项目筛选行生效，不修改通用 Input。
- 移除可见“项目状态”文字，Select 保留 `aria-label`。筛选、搜索及归档/环境图标入口居中，保留 40px 图标按钮点击区域、可访问名称及原生悬浮说明；归档视图保留按下状态。
- 项目末尾复用 Radix DropdownMenu，通过“更多操作”显示归档/恢复；仍保留任务执行中禁止归档、失败反馈和现有恢复逻辑。项目行的封面、信息、阶段及继续创作顺序不变。
- 窄窗口沿用 760px 断点，搜索框一行、筛选及图标按钮一行，避免图标按钮独占整行。不引入组件依赖、全局样式或业务规则变化。

## 验证记录

- 先增加实际 Electron 布局断言，旧界面以 `53.59375 !== 40` 失败。
- 验收包含搜索高/圆角、筛选与按钮中心对齐、可访问名称、隐藏可见状态标签，以及菜单键盘打开、Escape 关闭与焦点返回、归档后进入归档视图、恢复后返回进行中列表。
- 菜单采用真实 Radix Trigger 键盘事件；测试最初通过 DOM `.click()` 重开菜单失败，因 Trigger 使用 pointer/keyboard 事件，调整测试驱动后验证业务，不修改上游交互实现。
- 完整 `tsc -b` 的诊断去除行列号后与上一轮基线一致，未新增工作流类型错误；全项目既存类型错误仍在。
- 真实 Electron 完整回归、受影响文件 ESLint、构建、设计检查/构建通过；明暗 1440px、1024px 和 200% 缩放验证无横向溢出。开发应用通过 Vite 热更新生效，没有重启或改写用户项目；归档/恢复测试只操作隔离副本。

截图：[浅色列表](video-workflow-production/project-list-controls-light-1440.png) · [深色列表](video-workflow-production/project-list-controls-dark-1440.png) · [更多菜单](video-workflow-production/project-list-menu-light-1440.png) · [1024px](video-workflow-production/project-list-controls-light-1024.png) · [200%](video-workflow-production/project-list-controls-light-zoom200.png)。

日志：`/tmp/workflow-list-controls-red.log`、`/tmp/workflow-list-controls-ui.log`、`/tmp/workflow-list-controls-build.log`、`/tmp/workflow-list-controls-types.log`、`/tmp/workflow-list-controls-web-types.log`、`/tmp/workflow-list-controls-lint.log`、`/tmp/workflow-list-controls-design-check.log`、`/tmp/workflow-list-controls-design-build.log`。
