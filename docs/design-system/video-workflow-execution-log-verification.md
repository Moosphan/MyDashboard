# 视频工作流右栏与执行日志验收

日期：2026-10-23。分支：`feature/video_studio_workflow`。

## 范围与数据

用户要求右栏信息与执行记录更清晰，并具备时间、任务名称、结果、关键信息与加载状态。本次只调整右栏：审核资料标签/值对齐，任务记录改为紧凑时间线，沿用项目组件和主题。主预览、Stepview、240/224px 右栏、断点与底部动作位置保持既有合同。

每条记录展示任务名称、执行结果、开始时间、执行器、耗时和最新 phase；运行任务优先、耗时每秒刷新，使用 Spinner 与不定进度条。任务 ID、结束/更新时间及完整错误可展开查看，长错误独立滚动。默认最近三条，可查看全部，日志区最大 360px 并局部滚动。

后端只有任务的最新 phase，没有阶段事件历史和可靠百分比，因此没有补造日志事件或百分比。执行成功与人工审核通过分别表达。缺失或非法时间显示“—”。

## 本轮验证

- 先运行新增的真实 Electron 日志时间断言，在旧实现上失败，再实施改动；证据 `/tmp/video-log-ui-red.log`。
- `pnpm build`、受影响 TSX 的 ESLint、Prettier 检查通过。
- `pnpm design:check`、`pnpm design:build` 通过；这些仅证明设计资产合同。
- `pnpm test:video-workflow`：18/18 通过。
- 完整真实 Electron UI 回归通过，含八阶段明暗、媒体解码、审核门禁、持久化、1024px、200% 缩放及键盘操作。新增日志断言覆盖六种任务状态、运行中优先、实时耗时、无虚构百分比、长错误完整展示、Space 展开详情与局部无横向溢出。证据 `/tmp/video-log-ui-full.log`。
- 运行/失败/取消/中断/过期记录为隔离测试 profile 的 UI fixture，完成记录来自真实模板任务；测试完成后删除 fixture，未修改用户任务或调用付费生成器。
- 深色截图通过实际设置入口切换主题；截图视口以每张 `.png.json` 为准，1440px 截图实际为 1440×944 CSS px、2 倍像素。
- `tsc --noEmit -p tsconfig.web.json`、`tsc -b --pretty false` 仍受既存类型错误阻断；本轮修改文件无诊断。完整检查按源文件、错误码、首行消息归一后与 `/tmp/video-alignment-all-types.log` 均为 65 项，无新增，不宣称全项目类型通过。
- 开发应用收到 renderer HMR，无需中断或重启正在运行的用户任务。

## 截图

- [浅色执行日志](video-workflow-production/execution-log/execution-log-light-1440.png)
- [深色执行日志](video-workflow-production/execution-log/execution-log-dark-1440.png)
- [1024px](video-workflow-production/execution-log/execution-log-light-1024.png)
- [200% 缩放](video-workflow-production/execution-log/execution-log-light-zoom200.png)
- [完整错误详情](video-workflow-production/execution-log/execution-log-error-details.png)

本轮在开发与构建后的真实 Electron 中验证，未重新制作安装包，也未宣称完成全面读屏/WCAG 审核。

## 后续间距修订（2026-10-23）

按用户标注截图收紧返回区与 Stepview：详情模块间距 16px、步骤内部 4px、底部内距 12px，返回按钮去除水平内距；保留全局页面与 Card 内距。对照页的分镜浅/深色截图已更新。

构建、ESLint、Prettier、设计资产两项检查及完整 Electron UI 回归通过（`/tmp/video-spacing-ui.log`），覆盖明暗、1024px、200% 和键盘操作。类型检查仍有既存错误，与上一轮归一比较均为 65 项、无新增。开发应用已收到 HMR；未中断用户任务。
