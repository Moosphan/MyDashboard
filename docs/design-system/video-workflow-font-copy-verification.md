# 粗剪字体与错误复制验证

日期：2026-10-24。范围：视频工作流粗剪合成、执行记录错误详情。

## 原因与修复

用户失败任务的完整错误为 HyperFrames 0.8.181 StaticGuard 的 `Font family used without @font-face declaration: songti sc`。已审核分镜使用 `Georgia, 'Songti SC', serif`，合成器此前仅固定声明 PingFang SC、Microsoft YaHei 与 SFMono-Regular，未承接分镜的其他本地字体。

`prepareMotionScene` 使用 Chromium CSSOM 收集样式规则、嵌套规则、font 简写、行内样式及计算样式里的字体族；保留已有字体声明。合成器按不区分大小写去重，排除系统通用族，为命名字体生成顶层 `@font-face / local()`，保留原分镜字体与排版。字体名称做 CSS 字符串转义，避免结束 style 标签。沿用固定 HyperFrames 版本与正常检查流程。

错误详情复用现有 Button，复制完整错误原文并反馈成功；复制失败允许重试且保留原文。错误块允许文本选择，支持系统复制快捷键。

## 验证

- 回归先失败：新增字体测试缺少宋体声明；Electron UI 测试缺少“复制错误信息”按钮。
- 功能测试：30/30 通过，包含命名字体、去重、通用字体排除、原排版保留与字体名称转义。
- 真实 Electron：验证完整长错误与换行的系统剪贴板内容、复制失败提示与保留、键盘重试。工作流创建、审核门禁、分镜、主题、1440/1024/200% 回归通过。
- 真实 HyperFrames smoke：音频 → 粗剪 → 正片 → 发布资料 → 回执 → 下游失效通过；字体收集覆盖 CSS 变量、font 简写、未匹配的样式规则与行内样式。
- 用户失败项目的完整隔离副本（16 镜、231.792125 秒）通过真实 HyperFrames 浏览器、布局与字幕检查及完整渲染，输出 1920×1080、231.8 秒、约 15.8 MB 的粗剪视频。副本不修改原项目、文件或审核记录。
- 生产构建、受影响代码 ESLint、design:check 与 design:build 通过。
- macOS arm64 未签名包构建和隔离用户目录启动通过，确认工作流与 AI 配音仍可打开。签名发布不在本次验证范围。
- 解码检查完整视频第 3 秒与第 100 秒，宋体、正文、字幕均可见。
- 全量 web / project 类型检查仍有既有错误，本次修改的 render、motion、ExecutionLog 无诊断。

日志：`/tmp/roughcut-font-red.log`、`/tmp/roughcut-font-green.log`、`/tmp/roughcut-copy-red.log`、`/tmp/roughcut-copy-final.log`、`/tmp/roughcut-fix-render-smoke.log`、`/tmp/roughcut-fix-project.log`、`/tmp/roughcut-fix-packaged-ui.log`。

错误详情截图位于 `video-workflow-production/error-copy-*.png`，覆盖浅色 1440、深色 1440、1024 与 200% 缩放。
