# 视频动效修改与风格模板实施计划

**目标：** 将静态截图粗剪扩展为保留 DOM 的元素动效工程，支持自然语言修改计划、人工确认、粗剪新版本和正片风格模板复用。

**约束：** `feature/video_studio_workflow`；沿用 React 18/Radix/现有主题和八阶段布局；不引入 HeroUI，不升级 HyperFrames 0.8.181。保持旧冻结工程可渲染。单纯动效不改文案、分镜顺序、配音和总时长。不得覆盖用户已审核工程。

**技术选择：** HyperFrames 原生 WAAPI adapter，结构化关键帧编译为浏览器 Animation。Agent 只提供选择器和受限属性的关键帧数据，不执行 Agent JavaScript。静态分镜仍使用无脚本预览；渲染时将安全 DOM/CSS 分镜隔离在各自作用域，保持时间可定位。MP4 与冻结工程分别保存。

## 任务与验收

- [x] 合同与回归：在 `src/shared/video-workflow.ts` 定义受限 motion 数据及验证，在 `scripts/test-video-workflow.ts` 验证拒绝代码、外部资源、无效时间及过期计划。
- [x] 持久化：新增数据库迁移保存任务类型/动效计划与风格模板；仓储以当前项目 revision 约束计划应用，保留旧版本，模板冻结来源成片与多镜样式样本。
- [x] 渲染：新增 `src/main/services/video-workflow/motion.ts`，安全 DOM、场景作用域、有限可 seek 动画。粗剪保存工程源码和 motion 数据；正片只复用已审核冻结工程。
- [x] 服务与 IPC：提修改时启动本地 Agent 计划任务；确认后独立生成粗剪；保存已审核成片风格模板，新分镜用新文案和模板样本生成，不复制旧口播。
- [x] UI：现有粗剪预览下增加范围/时间/意见/执行器与计划确认，保留版本对比。正片工具栏保存模板弹窗；分镜设置选择“我的模板”。任务状态复用执行日志，无假进度。
- [x] 验证与文档：工作流测试、真实 HyperFrames 两镜动效/seek/成片 smoke、Electron 主题/键盘/窄窗，设计 check/build、生产 build。记录限制与 Studio 使用方法。

## Studio 边界

已核实当前 CLI 提供 `preview --background`、`--context`，Studio 是工程编辑器；工程链接只在本地服务运行时有效。当前增量保留可导出的工程，Studio 手工编辑不能静默修改已审核冻结工程。编辑后的结果需要回到待审核粗剪版本；完整 Studio 回导及任意源码信任策略另行确认，不能假装已集成。
