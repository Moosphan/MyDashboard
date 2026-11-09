# Remotion 工作流验证

日期：2026-11-08。范围：用户确认在现有工作流选择 HyperFrames / Remotion，不包含任意 React 项目导入。

2026-11-09 更新：本文记录历史 HTML 适配版。新建 Remotion 粗剪已改用 Agent 创作原生 React 工程，本文关于受限动效和禁止 Agent TSX 的边界已被用户授权的新方案覆盖，见 [原生 Remotion 验证](native-remotion-verification.md)。历史工程兼容验证仍适用。

## 实现与来源

- 官方 `@remotion/cli`、`remotion` 固定 4.0.541；独立安装，不向 Electron React 18 renderer 增加 Remotion 或第二套 React 依赖。官方 CLI 的实际 `render` 参数及 React Audio API通过本地发布包和真实输出验证。
- 可信固定入口使用 `useCurrentFrame` 驱动清理后的 HTML 时间轴与暂停的 WAAPI，视觉元素、镜间转场和字幕与既有数据协议共用；配音、配乐交给 Remotion Audio 合成。Agent 输出是数据，不能作为 TSX 源码执行。
- 冻结版本记录引擎、入口、JSON、媒体与来源 ID；最终成片校验文件和指纹后复制工程，沿用粗剪引擎。替换配乐只更新副本配置，新版仍需审核。旧版缺少引擎字段时按 HyperFrames 解释。
- CLI 单并发，使用原进程树取消/超时和全局媒体任务预算。运行目录只将媒体和 HTML 放入 public，不将 node_modules 拷入静态目录。导出提供可独立安装的 package.json、public 和说明，不携带本机依赖或凭据。
- 参考：[Remotion CLI render](https://www.remotion.dev/docs/cli/render)、[Audio](https://www.remotion.dev/docs/audio)、[useCurrentFrame](https://www.remotion.dev/docs/use-current-frame)、[许可证](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md)。Remotion 自身的授权条件独立于本项目 Apache 2.0，未将其声明为 MIT 或无限制使用。

## 验证结果

- 基线工作流 84/84；新增引擎持久化、非法引擎/路径、旧项目兼容和运行时依赖断言，先复现失败，再实现后全量 **85/85 通过**。
- `pnpm test:remotion:render` 使用真实官方 CLI 和本机 Chrome，独立临时数据库，生成 1920×1080、1080×1920 两套粗剪和带配乐成片。像素断言验证缩放/透明度随时间改变、第二镜切换和字幕背景；FFprobe 验证尺寸、音轨和时长，音频样本验证 440 Hz 配音与独立配乐频率均存在。验证非零裁剪、音量、速度、来源粗剪 ID、工程入口、跨引擎成片拒绝及可信入口检查。另以最终安装到用户工具目录的 CLI 复验通过，不依赖 scratch 路径。
- `scripts/test-remotion-workflow-ui.cjs` 使用合成工程、可控 CLI 和真实 Electron renderer / preload / IPC / 服务。验证 Home/End/Space/Enter 引擎选择、重载保留、运行期间禁用、Remotion 粗剪/成片实际路由及 review 状态、失败保留原粗剪、正式成片来源引擎、浅深色、1440/1024 文档无横溢出，以及 200% 执行环境弹窗 Tab/Escape/焦点返回。
- 已查看浅色 1440 和深色 200% 弹窗截图；本机合成截图在 `.scratch/remotion/screens/`，不上传个人作品、数据库、配置或密钥。
- 补充实测 forced-colors 与 prefers-reduced-motion：引擎选择可打开、Escape 关闭并返回焦点；检查深色 1024 下选择区及动作可达。两个真实合成项目的工程导出包含固定版本 package.json、public/index.html 和 TSX，未导出 node_modules。独立只读审查未发现重要问题。
- 应用构建、design:check、design:build、日常构建与重启通过。全量主进程/renderer 类型检查仍有其他模块既有错误，不宣称全量类型检查通过；受影响工作流及 VoiceSelect 文件无新增诊断。

## 界面合同与边界

沿用 VIDEO-WORKFLOW-001 的现有 React 18 / Radix / VoiceSelect 例外，新增选择放在原粗剪合成动作区；预览、审核、任务日志、两栏密度和底部主动作不重排。执行环境增加 CLI 和可选浏览器路径，VoiceSelect 仅补传 disabled，无新样式、图标或生产依赖。正式成片展示冻结来源引擎，改选须回粗剪创建并审核新版本。

Remotion 仍使用当前工作流支持的受限动效和分镜内容；增加引擎不会自动提供任意 React 组件编写或更丰富的 AI 画面。Windows/Linux 的实际 Remotion 二进制及浏览器未在本机执行验证，外部 CLI 依赖和浏览器由目标平台安装。macOS 当前版本曾收到 Remotion 系统版本提示，实际横竖版输出验证通过，不以此声称所有硬件或操作系统版本都已覆盖。
