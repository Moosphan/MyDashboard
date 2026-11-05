# DeepSeek Harness 视频工作流接入依据

调研日期：2026-11-04。以已发布的 `@deepseek-ai/dsh@0.2.1-rc.5` 为协议基线；官方主分支另列差异。不包含本机配置、凭据、用户项目内容或生成日志。

## 发行身份

用户确认使用 DeepSeek Harness。官方仓库为 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)，README 明确项目由 DeepSeek AI 开发，npm 包为 `@deepseek-ai/dsh`，命令为 `dsh`，目前处于开发者预览期，可能发生不兼容变更。

- [已发布 CLI 包元数据](https://registry.npmjs.org/@deepseek-ai%2fdsh/0.2.1-rc.5)：`bin.dsh = lib/bin.js`。
- [对应源码标签](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-rc.5)。
- 同名 `deepseek-cli@1.0.2` 是另一款第三方项目，命令是 `deepseek` / `ds`、使用 `ask` 子命令，不能套用 Harness 协议；[其 npm 元数据](https://registry.npmjs.org/deepseek-cli/1.0.2) 和 [公开发行源码](https://registry.npmjs.org/deepseek-cli/-/deepseek-cli-1.0.2.tgz) 说明该区别。不要只根据可执行文件名推断兼容性。

## 非交互输入与结果

调用结构：`dsh --profile headless --patch <宿主覆盖文件> --json -`，完整提示词写入 stdin。`--patch` 是启动器参数，放在 headless 应用参数 `--json` 前。不得传入 Codex 的 `exec` 或 Claude 的 `-p` 等参数。

- [CLI 启动器解析](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.5/apps/cli/src/args.ts) 将启动器不认识的首个参数及后续参数交给配置内应用。
- [发布版 headless 参数解析](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.5/packages/bundle/headless/src/startup.ts) 支持 `--json`、`--session-id`、位置任务以及独立 `-` 作为 stdin 标记；该版本没有 `--permission-mode` 或 `--approval-policy`。
- [发布版 JSON 事件实现](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.5/packages/bundle/headless/src/json-stream.ts)：stdout 是逐行 JSON，先发 `session`，之后有 `status` / `text` / `thinking` / `tool_call` / `tool_result`。`phase: turn_end` 的 status 事件提供 `reason`，最后事件为 `{ type: 'final', text }`。最终文本不按普通事件的文本上限截断，不能拼接可能截断的中间 text 事件作为产物。
- [发布版运行器](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.5/packages/bundle/headless/src/index.ts)：完成退出 0，取消或失败退出 1。宿主同时检查退出成功、有效会话、最后一次终止状态为 completed、存在末尾 final 文本，再将其中的文本作为工作流 JSON 解析。错误、缺失终止事件、缺失 final 或 final 后仍有事件均不可当作成功。

主分支已增加权限参数，并在 final 中附带 sessionId 和 reason；见 [主分支 headless 文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/headless/README.md)。不能将这些新参数和字段当作发布版已具备的接口。

## 工具约束与配置隔离

Headless 默认带有文件、shell、联网与子任务能力。视频工作流是仅生成结构化内容的任务，应使用宿主拥有的单次覆盖文件和本地模块，不修改用户持久配置。

- [发布版工具注册表](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.5/packages/core/tools/src/index.ts) 的 `tools.guard()` 是单调拒绝关卡，全局 guard 返回拒绝原因后，其他工具 pre-execute 监听器无法重新允许调用。其配置字段没有通用 `allowTools` 开关。
- [发布版提示词装配](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.5/packages/core/system-prompt/src/index.ts) 的 `system-prompt/assemble` 使用 `next: () => Promise<PromptAssembly>`，宿主模块可在 `await next()` 后返回 `tools: []`，同时用 guard 阻止模型构造未公开工具调用。两者需要同时生效，提示词中的“不要执行工具”不能替代执行约束。
- [Cordis 生命周期说明](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.5/docs/cordis-tutorial/02-lifecycle-and-effects.md)：registry 注册本身由 effect 管理，`ctx.tools.guard()` 无需额外包装 `ctx.effect()`。
- [官方本地模块覆盖样本](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.5/apps/cli/tests/profiles/headless/tests/fixtures/startup-activation-error/activation-error.patch.yml) 使用本地 `.mjs` 插件，不要求发布 npm 插件。
- [权限预设源码](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.5/packages/interaction/permission-presets/src/index.ts) 从 composed sandbox / approval 推导默认预设；覆盖为 read-only / never 时同步提供同名预设及 `defaultPreset: read-only`。这限制工具访问，不禁止 Harness 自己的会话持久化。插件启动副作用不等于模型工具执行，不能声称该覆盖阻断所有插件初始化网络。

## 凭据与验证边界

[发布版 headless 配置](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.5/packages/bundle/headless/cordis.patch.yml) 禁用交互凭据存储；API key 来自启动环境、调用目录 `.env`、Harness home `.env`，优先级按此顺序。GUI 中保存的登录/密钥默认不用于 headless。空的已导出环境变量会覆盖后续 fallback。工作流应复用 CLI 配置，不把 API key 当路径设置或任务日志保存。

[DeepSeek API-key 适配器文档](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.5/packages/llm/llm-deepseek-api-key/README.md) 说明默认变量 `DEEPSEEK_API_KEY`、缺失凭据 `MISSING_CREDENTIAL`、无效凭据 `INVALID_CREDENTIAL`；模型路由默认 `deepseek-official` / `deepseek-flash`。版本检查成功只证明可执行文件能运行，不证明密钥、网络或模型调用成功。

可以用 [官方无网络测试 provider 样本](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.5/apps/cli/tests/profiles/headless/tests/fixtures/retry-snapshot-backend.mjs) 的 `LlmAdapter` 和 `ctx.llm.registerAdapter()`，通过宿主测试覆盖替换模型路由，验证真实发布 CLI 的 stdin、NDJSON、覆盖模块加载、无工具列表和 guard；无需真实密钥或外部模型请求。真实在线调用仍需用户配置凭据后验证。

## 实际发布包验证

已在独立测试目录安装官方 `@deepseek-ai/dsh@0.2.1-rc.5`，将项目当前 `runDeepSeek` 与 `parseDeepSeekJson` 原样打包后，使用该真实 CLI 及本地确定性 mock provider 执行 smoke。测试使用全新 HOME / DSH_HOME、禁用真实提供商，并在启动进程及子进程中阻断 socket 连接和 fetch；没有使用用户密钥或调用真实模型。

通过的断言：stdin 标记到达 provider；宿主本地 `.mjs` 覆盖插件成功加载；provider 没有可调用工具；已注册的测试工具经 `tools.execute()` 被 guard 拒绝，工具体没有执行；stdout 的会话、完成状态和 final 事件通过项目解析器得到完整 JSON。空工具列表在 provider 输入中被运行时省略为 `undefined`，测试按 `options.tools ?? []` 验证。

该验证覆盖真实已发布 Harness 的启动、权限插件及协议兼容性；不证明用户本机的凭据、网络和在线模型可用性。测试包、隔离配置和事件文件留在本地 `.scratch/deepseek-cli/`，不作为应用依赖提交。
