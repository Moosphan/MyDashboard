# 元素动效、修改审核与风格模板验证

分支：`feature/video_studio_workflow`。实现保留现有组件、主题、Stepview、主产物/240px右栏和底部审核推进。HeroUI 迁移仍属另一分支。

## 实际能力与限制

- 新粗剪保留 DOM，默认主要文字入场；自然语言支持当前镜/整片的透明度、位移、缩放、旋转、有限循环。Agent 不生成可直接执行的任意脚本。
- 先生成持久修改计划，显示意见、时间、镜头、元素选择器、动效范围；确认后才合成粗剪新版本。版本 CAS、前置审核、取消、失败和依赖失效均保留。
- 纯动效复用原音轨与口播；新粗剪需要审核，原成片/发布失效，旧工程不被覆盖。
- 正片审核后保存多镜风格样本与已有动效；后续分镜设置选择“我的模板”，由本地 CLI 结合新内容重新编排。属于样式参考复用，暂非任意 HTML 的完整参数化组件模板。
- 工程可导出到 HyperFrames Studio 编辑。当前不启动或嵌入 Studio、不自动回导 Studio 修改；其本地编辑链接随本地服务运行而有效。

## 验证路径

`pnpm test:video-workflow`：受限属性/有限时间验证、计划持久与过期拒绝、单镜合并、上游审批保留、粗剪/成片依赖失效、模板审核门禁、快照保留与新内容样式参考。

`WORKFLOW_MOTION_REVIEW_SMOKE=1` 搭配已配置 HyperFrames/Node 路径执行 `pnpm test:video-workflow:render`：真实 Chromium DOM 编译（含 ID/CSS/SVG 隔离）、两镜音频、粗剪/成片、可编辑工程导出、模板保存、假 CLI 提供声明式计划后的真实粗剪 v2 / 成片 v2、同音轨复用与发布门禁。假 CLI 用于隔离外部模型，不替代真实渲染。

Electron UI runner 使用临时用户目录与已审核合成媒体 fixture：修改计划 loading/确认入口、未隐式改变审核、模板保存与持久列表、Escape/焦点返回、原生音轨播放器、明暗主题、1440/1024/200% 和无横向溢出。真实视频已抽取 0.1 秒与 1.0 秒画面，确认标题旋转/缩放/透明度实际变化，而内容卡片保持定位。

生产构建、受影响文件 ESLint、Prettier、`pnpm design:check` / `pnpm design:build` 需通过。完整 `tsc -b` 有既存 65 种源码错误，本轮归一比较无新增；不能将 `pnpm typecheck` 的空根项目检查当作完整类型检查。

## 本次结果

- 26 项工作流回归通过；真实两镜粗剪/成片及修改计划→粗剪 v2→成片 v2 通过，音频版本 ID 保持不变。
- Electron 临时 profile `/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/video-workflow-ui-Aex7A1`，明暗主题、1440/1024/200%、加载/计划确认、模板持久化、Escape/焦点返回通过。
- 生产 build、受影响文件 ESLint、格式化、design check/build、未签名 macOS arm64 目录包通过。完整类型检查与既存 65 种错误一致，无新增。
- 导出工程启动 HyperFrames 0.8.181 Studio，命令返回 ready，实际 HTTP 200；验证后已停止测试工程服务，没有保留失效的用户编辑链接。
- 证据：`video-workflow-production/motion-feedback-dark-1440.png`、`motion-feedback-light-1024.png`、`motion-feedback-light-200percent.png`、`save-template-dark-1440.png`；每张 UI 图附实际 CSS viewport/DPR/zoom JSON。`motion-render-early.png` 与 `motion-render-settled.png` 为真实成片 0.1s/1s 抽帧。

HyperFrames 0.8.181 的 WAAPI 工程仍使用 `data-no-timeline` 跳过 GSAP registry 轮询；此属性并不关闭 WAAPI adapter。是否有动效以实际逐时画面为准，不能以属性名推断静态。

## 重新合成失败回归（2026-10-23）

- 失败任务停在 Agent 动效计划校验，记录为“请选择分镜内的可见元素”，尚未进入视频渲染。原始 Agent 输出已随任务临时目录清理，不能确认当次具体选择器；相同意见重放可以成功返回计划。
- 已复现旧字符白名单误拒 `:nth-child(...)`、相邻元素选择器和选择器列表。改为在隔离 Chromium 中解析并匹配原始 DOM，验证目标后编译为场景内稳定元素标识，避免 ID 命名空间改写误伤选择器。非法语法、缺失和隐藏目标仍拒绝，不执行 Agent 代码。
- 隔离执行中的校验错误显式序列化返回主进程；日志记录分镜名称、具体选择器和失败原因，避免被 Electron 的通用脚本执行错误吞掉。
- 使用原 Kotlin 八镜 HTML 与配音的数据副本验证，还复现了 HyperFrames 对 `Microsoft YaHei` / `SFMono-Regular` 的字体声明检查失败。工程声明这些本地字体及同类系统回退，保留原字体栈，不下载字体或跳过检查。
- 26 项工作流回归通过；真实 HyperFrames 两镜验证包含上述字体栈、结构伪类、缺失/隐藏/非法目标及修改计划确认后重新渲染。原 Kotlin 八镜工程加入 `:nth-child(2)` 动效后，在隔离副本成功生成 87.4 秒粗剪；0.1 秒 / 1.5 秒抽帧确认元素入场有效。生产项目仍为 revision 14，原粗剪与审核状态未修改。

## 计划确认与镜间转场回归（2026-10-23）

用户截图仍显示已审核粗剪 v1，最新任务为“修改计划已生成，等待确认”；数据库没有第二个粗剪版本。该计划仅包含 scene-1 的 14 项元素动画，不能描述成整片已完成动效合成。

- 预览显示“修改计划已生成，视频尚未更新”、当前/目标粗剪版本，并可跳转原有确认区。待确认计划自动展开，显示覆盖镜数；执行记录明确“计划已生成”。确认前视频地址、项目 revision 和审核状态保持不变。
- `MotionPlan.scenes[].transition` 声明从上一镜进入本镜的转场：`cut`、`crossfade`、`slide-left`、`slide-up`、`wipe-left`。直接切换为 0 秒，其他转场大于 0 且不超过 1.5 秒及相邻两镜各自时长的一半。首镜拒绝非 cut 转场。旧 JSON 不要求新字段。
- 转场动画位于独立镜内进出容器，不直接动画化 HyperFrames 的定时 clip。上一镜可见窗口延长至交接完成，形成真实叠化/推移/擦除；配音、字幕起点和总时长不动。入场和出场容器分离，避免未来 WAAPI 的 backwards fill 覆盖前一次入场。默认新工程使用叠化；显式 cut 可覆盖默认值；未指定的既有转场保留。
- 27 项工作流回归通过；真实两镜“计划→人工确认→粗剪 v2→审核→正片 v2”通过，原音频版本保留。Kotlin 八镜隔离副本合成 87.4 秒，分别在 10.06 / 23.02 / 34.70 / 42.06 秒抽帧确认叠化、横向推移、纵向推移、擦除，不以脚本存在代替视频验证。
- 不自动应用生产项目的待确认计划。希望八镜都重新编排时，用户需选择整片重新生成并确认计划；当前镜模式保留其余分镜的已有动效。
- 真实 Electron 验证通过：计划完成后原视频地址不变、计划自动展开、顶部提示显示 v1→v2、定位确认区后焦点落在 summary；明暗主题、1440/1024/200% 无横向溢出。证据为 `video-workflow-production/motion-plan-pending-preview-dark.png`、`motion-confirmation-light-1024.png`（附 viewport JSON）及 `transition-crossfade.png`、`transition-slide-left.png`、`transition-slide-up.png`、`transition-wipe-left.png`。完整类型检查与既有错误集合相同，无新增。
