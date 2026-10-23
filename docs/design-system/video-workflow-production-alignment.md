# 视频工作流：生产布局对齐记录

日期：2026-10-23。分支：`feature/video_studio_workflow`。工作区：`/Users/dorck/.codex/worktrees/video-studio-workflow/MyDashboard`。

## 基线与偏差原因

布局以用户指定的 [UI 规格](video-workflow-ui-spec.md) 和 [高保真原稿](video-workflow-reference/video-workflow-storyboard-light.png) 为准。用户允许沿用现有组件，不意味着允许重新排列内容、合并区域或改变动作位置。

此前功能工作区没有纳入原工作区尚未跟踪的规范和截图；实施时又将“复用组件”扩大理解为可自行组织页面，验收只检查功能，没有逐页核对高保真稿。这两处实施与验收错误造成偏差。本轮已纳入指定规范、完整技术方案和35张参考图，并同步页面合同与迁移例外。

打开 [原稿 / 生产截图对照页](video-workflow-comparison.html) 可切换九个页面和明暗主题，无需设计站服务。原可交互提案仍在原工作区；本分支的 `design:preview` 没有接入该提案路由。

## 已校正的页面组织

| 区域 | 按原稿恢复的组织 |
| --- | --- |
| 项目列表 | 页头/新建 → 四项概况 → 搜索筛选 → 横向项目行；缩略图、项目资料、状态和继续创作的位置固定 |
| 项目详情 | 返回/标题/规格，右上执行环境/历史；移除重复的大页头 |
| Stepview | ≥1024px八列、32px节点、完成连接线；较窄四列两行，无步骤横滚 |
| 内容与审核 | 主产物 + 240px审核侧栏；1024–1199px为224px/16px间距；窄窗审核移到内容下方 |
| HTML分镜 | 主预览 → 镜头信息 → 实际缩略图 → 屏幕文字/口播；右上创作设置、单镜编辑弹窗 |
| 创作设置 | 模板/Agent两种方式；模板展示四种不同版式；Agent支持链接、HTML和描述，整片/单镜；取消不覆盖采用内容 |
| 简报与文案 | 简报标题/想法/受众与时长/资料；文案保留直接编辑的正文，不额外插入另一套阅读页 |
| 口播 | 当前分镜Select → 逐镜正文 → 读音与停顿；不自行增加大预览和缩略图 |
| 配音 | 引擎/音色 → 段落数量/配音工具 → 逐段试听；完整音轨与参数折叠，不挤占首段 |
| 粗剪与成片 | 真实视频 → 输出信息 → 可定位镜头缩略图 → 屏幕文字/口播与检查说明 |
| 发布 | 平台选择 → 共用成片 → 单个平台资料；不同时堆放两平台表单 |
| 审核与动作 | 审核Card、分隔线后的低权重任务区、底部版本提示/保存/下一步；保存先展示下游影响 |

版本历史可恢复为本地新草稿，保存后创建新版本，不覆盖历史；跨项目打开时清除临时恢复选择。简报的受众/参考资料及口播读音提示随阶段JSON保存，兼容旧数据。

## 真实页面证据

| 页面 | 浅色 | 深色 |
| --- | --- | --- |
| 项目列表 | [查看](video-workflow-production/aligned-projects-light-1440.png) | [查看](video-workflow-production/aligned-projects-dark-1440.png) |
| 创作简报 | [查看](video-workflow-production/aligned-brief-light-1440.png) | [查看](video-workflow-production/aligned-brief-dark-1440.png) |
| 内容文案 | [查看](video-workflow-production/aligned-copy-light-1440.png) | [查看](video-workflow-production/aligned-copy-dark-1440.png) |
| HTML分镜 | [查看](video-workflow-production/aligned-storyboard-light-1440.png) | [查看](video-workflow-production/aligned-storyboard-dark-1440.png) |
| 口播定稿 | [查看](video-workflow-production/aligned-narration-light-1440.png) | [查看](video-workflow-production/aligned-narration-dark-1440.png) |
| 分段配音 | [查看](video-workflow-production/aligned-audio-light-1440.png) | [查看](video-workflow-production/aligned-audio-dark-1440.png) |
| 动态粗剪 | [查看](video-workflow-production/aligned-roughcut-light-1440.png) | [查看](video-workflow-production/aligned-roughcut-dark-1440.png) |
| 正式成片 | [查看](video-workflow-production/aligned-final-light-1440.png) | [查看](video-workflow-production/aligned-final-dark-1440.png) |
| 平台发布 | [查看](video-workflow-production/aligned-publish-light-1440.png) | [查看](video-workflow-production/aligned-publish-dark-1440.png) |

补充：[模板多版式](video-workflow-production/03-template-family-light-1440.png)、[Agent](video-workflow-production/03-agent-creation-light-1440.png)、[1024弹窗](video-workflow-production/03-agent-creation-light-1024.png)、[720弹窗](video-workflow-production/03-agent-creation-light-720.png)、[保存影响](video-workflow-production/03-save-impact-light-1440.png)、[1024工作区](video-workflow-production/04-storyboard-light-1024.png)、[实际200%缩放](video-workflow-production/05-storyboard-light-zoom200.png)。

原稿为1440×1100 CSS px；本机Electron实际视口为1440×944 CSS px（系统限制窗口高度），截图2880×1888像素，不能声称为1440×1100实测。1024窗口为1024×900。截图内容来自两镜4秒的真实合成测试，标题明确标注“合成音频”。正常状态截图在临时profile中恢复该测试原有八个已审核历史版本，撤销测试末尾故意制造的简报失效；原始测试数据库与用户数据没有改动。两侧内容及审核状态不同，不进行像素一致性宣称。

## 本轮重新执行的验证

| 验证 | 结果与边界 |
| --- | --- |
| `pnpm test:video-workflow` | 16项通过；新增可选字段校验/兼容性断言 |
| `pnpm test:video-workflow:ui` | 构建及真实Electron/IPC通过；八阶段×明暗、项目列表、1024分栏、900四列、实际200%缩放、弹窗Tab/Escape/焦点返回、取消不提交、空Agent校验、版本恢复、审核门禁、字段持久化、平台切换、音频元数据、视频解码与定位 |
| ESLint / Prettier | 工作流组件、共享契约、相关测试通过 |
| `pnpm design:check` / `pnpm design:build` | 通过；设计构建有既有大于500KB分包提示 |
| 全项目类型 | `tsc -b`仍失败；66类诊断与对齐前完整日志按文件/错误码/消息比较一致，无新增。不能写成类型检查通过 |
| macOS目录包 | Electron Builder arm64目录包成功，关闭签名；使用隔离profile实际启动到 `ready-to-show`，随后关闭测试进程 |

UI命令使用 `WORKFLOW_SEED_DIR=<真实合成测试目录> WORKFLOW_RESTORE_APPROVED_SEED=1`。执行记录：`/tmp/video-alignment-tests.log`、`/tmp/video-alignment-ui-ready.log`、`/tmp/video-alignment-all-types.log`、`/tmp/video-alignment-package.log`、`/tmp/video-alignment-packaged-runtime.log`。默认不设置恢复变量时仍可检查失效依赖页面。

## 仍需区分的差异

- 组件外观沿用现有项目：字号、按钮、Card内距、图标及全局外壳与HeroUI稿不同；没有引入HeroUI或改动全局主题、依赖。
- 简报标题只读，项目重命名尚无后端接口。读音提示用于人工校对，不作为TTS发音控制。
- 逐段音频使用真实原生播放器；尚无真实波形、逐段检查持久化与单段重做，不以模拟勾选假装完成这些业务。
- 发布已按稿只展示所选平台；后端仍审核整个发布阶段，尚无两平台独立审核状态。两平台分别导出/回填沿用现有能力。
- 尚无持久化“提出修改”状态与意见流转接口，因此未添加无效按钮。模板切换当前应用整片；Agent支持整片/单镜。
- 首期渲染静态HTML关键帧；不执行任意HTML动画。未重新验证五分钟样片、真实模型生成、平台上传或完整读屏/WCAG；早期配音/备份/HyperFrames功能测试记录保留在实现说明中，不冒充本轮重跑。

本轮修正排版与对应交互，不将上述业务差异标为完整设计实现。原工作区的HeroUI分支与未提交内容保持原位；本功能分支未提交、推送或合并。
