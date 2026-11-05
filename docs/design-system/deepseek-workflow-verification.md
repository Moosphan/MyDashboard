# DeepSeek Harness 视频工作流验证

日期：2026-11-04。UI 范围沿用 VIDEO-WORKFLOW-001；保持既有布局、VoiceSelect / VoiceInput、Radix 弹窗与应用主题，没有添加控件样式、图标或运行时依赖。

## 协议与业务

- 官方包 `@deepseek-ai/dsh@0.2.1-rc.5`，使用 headless NDJSON 协议；非交互输入经 stdin，patch 在 `--json` 前传递。不使用该发行版未支持的权限 CLI 参数。
- 仅接受成功退出、会话已完成和终止 `final.text`；思考和中间文字不会成为产物。超时、取消、进程树清理与输出上限复用工作流进程执行层。
- 主进程统一允许 Codex、Claude、DeepSeek，模板 MG 和粗剪初始 MG 尊重显式选择。路径为空时明确报错，不转交其他服务商。
- 覆盖旧配置加载、路径持久化、npm JavaScript 入口检测、stdin/参数、失败与脱敏、截断输出、取消、超时及显式 MG 执行器的工作流回归为 **83/83 通过**。
- 另以真实官方 `dsh@0.2.1-rc.5` 与当前适配器运行隔离 smoke：独立 Harness home，强制阻断 socket/fetch，替换真实提供商为本地 `LlmAdapter`。确认收到 stdin 标记、模型未收到工具、已注册的合成工具被 guard 拒绝，NDJSON 被正式解析器接受。该检查验证真实 CLI 加载和协议，但不代表已经验证在线 API 认证及生成质量。

## Electron 合成验证

命令：`pnpm build && pnpm exec electron scripts/test-deepseek-workflow-ui.cjs`。

使用临时数据库与合成项目、合成 dsh，不读取个人作品和提供商凭据；阻断应用外部 HTTP/HTTPS。测试经过真实渲染页面、preload IPC、主进程服务与本地子进程。

- 执行环境展示 DeepSeek 路径，保存后实际读取一致；关闭焦点返回入口。
- 使用 Space / Home / End / Enter 操作 Select；默认 Codex，可切换 DeepSeek；粗剪动效面板和阶段选择共享，重载后仍保留。
- DeepSeek 返回新文案后显示待审核；模拟退出码 1 时任务失败且上一版文案原样保留。
- 浅色/深色、1440/1024 宽度检查无文档横向溢出，并保存合成截图。
- 200% 缩放下执行环境弹窗可滚动，Tab 保持弹窗焦点，Escape 关闭后焦点返回。
- 截图位于本地 `.scratch/deepseek-cli/screens/`，未纳入仓库或上传。已查看 1024 深色和 200% 弹窗截图。

应用构建、`pnpm design:check` 和 `pnpm design:build` 通过。类型检查仍有其他模块既有错误，不能将全量类型检查标为通过；修改的工作流文件未报告类型错误。真实提供商认证、计费和生成质量不由合成测试证明。
