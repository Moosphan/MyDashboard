# 原生 Remotion 验证

日期：2026-11-09。用户要求先改一版，并解除静态页面与受限动效协议对 Remotion 画面的限制。本记录补充并覆盖 11-08 适配版禁止 Agent React 源码的边界。

## 实现

- 新 Remotion 粗剪由所选 Agent 返回完整原生 React 场景源码；visuals.tsx 管理全片，scene-N.tsx 管理语义分镜，可包含任意子镜头和程序化绘制。HTML 只提供内容、构图参考与原始嵌图，不再经过 WAAPI 选择器/属性编译。
- visualDirection 独立保存动态设计意图，静态关键帧与预览 MG 不再构成原生创作上限；历史分镜无需重建即可创作原生粗剪。分镜内嵌图片解包为独立受管资源，参考截图仅用于参考和显式排除 MG 的静态镜头。
- 宿主保留配音、字幕、总时长和 MG 开关/排除；逐帧可信入口直接加载 Visuals。原生粗剪封面从实际视频抽帧，避免用原分镜截图冒充新画面。
- 自然语言修改生成 native.instructions 计划，仍经现有确认按钮执行。单镜修改仅能改变对应 scene-N.tsx，其他源码逐字保持；需要跨镜结构修改时选择整片。历史 HTML 工程先生成整片原生版再进行原生单镜修改。
- 粗剪冻结源码、素材、配置及实际依赖版本；最终成片验证文件和指纹后使用副本，不再次调用 Agent。配乐只修改配置与媒体；导出包含原生源码、public 素材和固定依赖声明。历史 iframe 入口继续受原可信模板校验。
- 主进程使用 TypeScript 解析生成源码，检查语法、文件清单、相对模块、已安装依赖以及明显 Node API 引用。TypeScript 从开发依赖转为运行依赖；未向 Electron renderer 引入 Remotion。此检查不是 OS 沙箱，生成源码不具备任意代码安全执行保证。

## 验证证据

- 原生测试先复现旧协议拒绝空 effects 的原生计划、visualDirection 丢失和私有 package exports/依赖越界问题；实现后 `pnpm test:remotion:native` **7/7**。原工作流 `pnpm test:video-workflow` **85/85**。
- `WORKFLOW_REMOTION_PATH=... pnpm test:remotion:native:render` 通过真实官方 CLI / Chrome 在 1920×1080 与 1080×1920 渲染。经过真实 service / repository / CLI 协议验证原生创作、非线性 SVG 运动的输出像素、镜头切换、计划不提前应用、单镜源码隔离、音频修订保留、冻结正式成片不调用 Agent、可编辑工程导出、失败保留旧视频。补充独立 SVG 嵌图解包与导出、真实粗剪抽帧封面、正式成片配乐配置与源码不变。
- `pnpm test:remotion:render` 的历史 HTML 横竖版真实渲染继续通过，覆盖配音、字幕、配乐及原入口防篡改。没有将原生测试替换成对静态 HTML 的测试。
- Electron 回归使用可控内容 CLI 和渲染 CLI，经真实 renderer / preload / IPC 验证新原生路由、键盘选择、重载记忆、运行禁用、失败保留旧版、正式成片来源引擎、浅深色、1440/1024、200% 弹窗、forced-colors 与 reduced-motion；已检查浅色工作区和深色 200% 截图。
- `pnpm design:check`、`pnpm design:build`、`pnpm build` 通过。全量 main/web 类型检查有其他模块既有错误，受影响工作流路径未出现诊断，不把全量类型检查声称为通过。
- `pnpm daily:build` 与 `pnpm daily:restart` 通过；重启前只读确认运行中视频任务为 0。控制接口确认新 release `1bf73054-6b37-4f7b-a8c8-34d9431a1174` 已运行且响应，构建指纹与当前源码一致。
- 使用真实 Codex、真实 Remotion 生成 15 秒原创队列技术样片，非固定 fixture 源码；抽查 2 / 7.5 / 12.5 秒画面，包含透视空间、主体沿轨道运动、视角变化与连续任务身份。样片为静音视觉演示，字幕时间线由宿主提供，没有声称生成配音。视频：`output/native-remotion/queue-native-15s.mp4`；预览：`output/native-remotion/queue-native-preview.png`；生成源码保留在 `.scratch/native-remotion/demo/composition/`。

## 同日合成引擎标注修复

用户截图中的实际成片 `renderEngine=remotion`，但通用任务执行器 `template` 被 ExecutionLog 固定映射为 HyperFrames；成片尚无版本时审核栏也直接使用 HyperFrames 缺省值。新增任务独立保存 render_engine，审核栏无成片时沿用粗剪引擎。迁移 040 根据 `job:<id>` 保存请求指纹与具体修订匹配，恢复可核实的旧成功任务引擎，其他旧任务明确标记未记录，不借用当前项目引擎猜测历史。

修复前两项记录测试失败，Electron 复现审核栏实际 HyperFrames / 预期 Remotion；修复后工作流 87 项和 Electron 回归通过，覆盖空成片审核栏、运行中及成功任务标签、真实 IPC 持久化、主题/视口/键盘/200% 弹窗。应用与日常构建、design:check、design:build、Prettier 和 diff 检查通过。全量类型检查仍有其他模块既有错误，本次路径无诊断。只修改记录与标签，视频文件无需重新渲染。

日常应用已重启到 `e742f3df-7ccc-47d6-8a46-5cc422c87120`，控制接口响应；只读核实用户 14:05:42 的正式成片任务和来源粗剪均恢复为 remotion，早期 HyperFrames 记录仍为 hyperframes。

## 创作边界

提交前将本次 Remotion 改动单独暂存并导出隔离快照，排除其他未提交的 DeepSeek/HTML 动效和素材画册改动。快照工作流 86/86、原生专项 7/7、应用构建、Electron 界面回归和设计检查/构建通过；上文 87 项为包含另一个未提交动效测试的完整工作树结果。

已经解除 HTML 构图与 WAAPI 动作枚举限制；不承诺任何创意自动获得高质量结果。当前仍依赖已有素材、已安装浏览器库、帧驱动确定性和本机渲染资源；缺素材/依赖会明确失败，不自行安装或用受限 HTML 方案替代。画质与镜头叙事需要实际观看和人工审核。当前验证平台为 macOS；没有据此声称 Windows/Linux 已实测。代码检查与工程指纹不等于字体、每一帧布局和全部视觉语义均已自动验收。

UI 沿用 VIDEO-WORKFLOW-001 的现有兼容控件，只更新能力说明、计划项与请求参数；未新增布局、样式、图标或替换人工审核。
