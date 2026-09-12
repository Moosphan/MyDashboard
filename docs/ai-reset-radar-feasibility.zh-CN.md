# AI 重置雷达看板卡片技术可行性评估

> 评估日期：2026-08-27<br>
> 当前项目：MyDashboard  `main` 分支<br>
> 参考项目：[whmc76/codex-reset-radar](https://github.com/whmc76/codex-reset-radar)<br>
> 参考版本：`3b58de1`（2026-07-20）

## 1. 结论摘要

在当前项目环境中，实现“AI 重置雷达”看板卡片是可行的，但需要把产品定义为“证据驱动的重置状态监测与辅助判断”，不能承诺 AI 能准确预测 OpenAI/Codex 的官方重置时间。

建议采用分层实现：

| 能力 | 可行性 | 结论 |
| --- | --- | --- |
| Dashboard 卡片、状态展示、刷新交互 | 高 | 直接复用现有 React、Tailwind、IPC 和 SQLite 架构 |
| 不登录的公开重置信号雷达 | 中高 | 可复用参考项目的公开源、权重和规则分类思想 |
| 已登录用户的个人配额与 reset credits | 中 | 只能在用户主动登录的 ChatGPT 会话中读取，不能真正免登录 |
| AI 对证据进行摘要、解释和建议 | 中高 | 复用现有 `ai:summarize` 能力，但应限制为解释层 |
| AI 直接预测精确重置时间 | 低 | 数据量、稳定性和官方接口都不足，容易产生误导 |
| 长期免维护地抓取所有私有数据 | 低 | 依赖未公开接口、登录态和站点反爬策略，不适合作为唯一链路 |

推荐最终产品形态：

1. 默认显示“不登录也可用”的公开信号、证据来源、可信度和未来 72 小时窗口。
2. 用户主动打开内置 ChatGPT 页面并登录后，再显示个人 5 小时/周配额和 reset credits。
3. AI 仅对已采集证据生成“为什么这样判断”的摘要，不替代确定性规则，也不自动消耗或重置额度。
4. 所有结果带来源、抓取时间、数据状态和置信等级；没有实时数据时明确显示缓存或估算。

## 1.1 当前实现状态（2026-09-12）

第一版账户快照和本地重置观测已经完成，但此前公开信号只接入 OpenAI Status，导致官方在 X 发布的重置公告不会写入时间轴。当前已补齐以下链路：

- 通过 [codex-reset.com 的公开 Tibo 时间线](https://codex-reset.com/api/feed)读取 Codex 负责人 `@thsottiaux` 的公开动态；不读取 X 登录态，也不保存 X Cookie。
- 应用独立校验作者、是否为回复、明确重置语义和发布时间，不将第三方的分类结果直接当作重置事实。短句式的“all reset”确认可以被识别，不需要强行包含 quota 关键词。
- 只有近 24 小时内、非回复、由 Tibo 明确确认的全局重置才成为高置信活动信号并触发既有去重通知；全局重置预告和定向 banked reset 只显示为中置信公开依据，要求用户刷新账户核验。
- 公开 feed 的 `stale`、最新动态时间和作者不匹配都会使 X 源标记为 `stale` 或 `error`；HTTP 成功但旧数据不得参与雷达判断。
- OpenAI Status 仅显示服务健康与故障背景，不再单独生成重置信号或通知。
- 使用 X 帖子 ID 作为唯一键写入 `reset_radar_history`，重复刷新不会重复产生历史事件。
- 时间轴同时展示官方 X 公告和本地账户配额观测；公告可在应用内打开原文。
- X 源或 Status 单独不可用时保留另一来源；两者都不可用时显示来源错误并继续保留缓存快照。

当前仍待实现的重点是：后台定时采样账户用量、完整社区/GitHub 多源背景信息、历史事件编辑/手动校正，以及 AI 解释层。公开 feed 属于第三方只读聚合链路，存在延迟、字段变更和不可达风险；高置信度只来自其中可回溯至已验证官方账号的明确原帖，不是 OpenAI API 或账户实际结果保证。

## 2. 本地环境基线

### 2.1 实测运行环境

| 项目 | 实测值 |
| --- | --- |
| 操作系统 | macOS 14.1.2，Build 23B92 |
| CPU 架构 | Apple Silicon `arm64` |
| Node.js | `v24.13.0` |
| pnpm | `10.33.3` |
| Electron | `33.4.11` |
| React | `18.3.1` |
| TypeScript | `5.9.3` |
| 数据库 | `better-sqlite3` + SQLite WAL |
| 开发服务器 | Vite `http://localhost:5173/` |

### 2.2 当前应用启动验证

当前应用使用项目内的 `scripts/dev-launchd.sh` 由 macOS `launchd` 托管，而不是依赖 Codex/PTY 的前台会话。实测状态如下：

- `launchctl print gui/501/com.dorck.hulkdash.dev`：`state = running`。
- Electron-vite 主进程 PID `59170` 存在。
- Electron 主进程及 GPU、Network、Renderer 子进程存在。
- `lsof -iTCP:5173 -sTCP:LISTEN`：Node 正在监听 `[::1]:5173`。
- 访问 `http://localhost:5173/` 返回 HTTP `200 OK`。
- 生命周期日志记录了 `app:ready` 和 `window:ready-to-show`。

启动日志路径：

- `.dev-logs/launchd.out.log`
- `.dev-logs/launchd.err.log`
- `~/Library/Application Support/my-dashboard/logs/lifecycle.log`

`launchctl` 中显示的 `last terminating signal = Terminated: 15` 是此前实例退出的历史记录；当前服务仍处于 `running`，不能将这条历史信号误判为本次实例正在被杀死。

### 2.3 当前项目验证结果

- `pnpm typecheck`：通过。
- `pnpm build`：通过，主进程、preload 和 renderer 均完成构建。
- `pnpm lint`：0 个 error，存在 39 个既有 warning。
- `pnpm test:trending`：132/132 assertions 通过。
- 参考项目 `npm test`：32/32 tests 通过。

## 3. 当前项目可复用能力

### 3.1 Electron 分层已经满足基础接入条件

当前主进程在 [src/main/index.ts](../src/main/index.ts) 中统一完成数据库初始化、IPC 注册、窗口创建和后台刷新调度。窗口启用了：

- `sandbox: true`
- `contextIsolation: true`
- `nodeIntegration: false`
- `webviewTag: true`

因此重置雷达应继续放在主进程抓取和持久化，渲染进程只通过 IPC 获取脱敏快照。不能让 renderer 直接访问 ChatGPT token、SQLite 或任意网络请求。

### 3.2 当前 Dashboard 是固定卡片布局

[src/renderer/modules/dashboard/index.tsx](../src/renderer/modules/dashboard/index.tsx) 当前包含：

- `FocusProjectCard`
- `PriorityTaskList`
- `WeatherClockWidget`
- `ActivityHeatmap`
- `IdeaCard`

重置雷达可以作为新的 `ResetRadarCard` 插入 Dashboard，不需要改变模块路由或引入新的前端框架。第一版建议放在右侧栏或焦点项目卡片下方，避免一开始改动整个 Dashboard 网格。

### 3.3 当前已有 AI 通道，但能力范围有限

[src/main/services/ai-summary.ts](../src/main/services/ai-summary.ts) 已提供 `ai:summarize` IPC：

1. 优先调用本机 `claude` CLI。
2. CLI 不可用时读取 Settings 中的 Anthropic API Key。
3. 将文章正文截断到 6000 字符后请求摘要。

这可以复用为“解释雷达判断依据”的 AI 层，但它不是通用的模型路由、结构化输出或预测服务。目前不能直接把它当成重置预测引擎。

### 3.4 当前 AI 订阅数据不是 Codex 个人配额数据

[src/main/database/repositories/ai-repository.ts](../src/main/database/repositories/ai-repository.ts) 管理的是用户手工配置的 AI 服务订阅、API Key、token limit 和 token usage。API Key 已通过 Electron `safeStorage` 加密保存，这对新增 provider 是有利条件。

但是，现有 [src/main/services/ai-usage-tracker.ts](../src/main/services/ai-usage-tracker.ts) 主要查询供应商 API 的余额或使用量，不能代表 ChatGPT/Codex 网页账户的：

- 5 小时窗口剩余量；
- 周窗口剩余量；
- 当前是否达到限制；
- reset credit 数量；
- reset credit 到期时间。

这些字段必须新增独立的 Codex account snapshot 模型，不能塞进现有普通订阅 token 字段。

### 3.5 当前项目已经有可复用的网页容器

[src/renderer/modules/insights/components/ArticleViewer.tsx](../src/renderer/modules/insights/components/ArticleViewer.tsx) 和 [src/renderer/modules/insights/components/trending/TrendingUrlViewer.tsx](../src/renderer/modules/insights/components/trending/TrendingUrlViewer.tsx) 已使用 Electron `webview` 展示站点内容；主进程也允许 `webviewTag`。

这能复用来提供“打开 ChatGPT 并主动登录”的入口，但不能直接假设一个普通内容 webview 就能安全地读取另一个页面的私有数据。账户采集必须有明确的站点白名单、会话分区和主进程边界。

## 4. 参考项目的功能与技术拆解

参考项目是一个 Manifest V3 Chrome/Edge 扩展，不是桌面应用。它的核心价值在于数据模型、规则策略和隐私边界，而不是可以原样搬到 MyDashboard 的运行时。

### 4.1 功能组成

参考项目将两个问题分开：

1. “公开信息是否暗示 Codex 可能很快重置？”
2. “当前是否应该使用一个已经持有的 reset credit？”

它提供的主要能力包括：

- 多公开源加权雷达；
- 未来 72 小时、每 6 小时一个时间槽的启发式 forecast；
- 5 小时和周配额窗口显示；
- reset credit 数量和最近到期时间；
- 按优先级排列的 read-only advice；
- 浏览器通知、安静时间和通知去重；
- 不登录时继续提供公开雷达；
- 登录只用于增加个人配额和 reset credit 信息。

参考项目明确声明不会自动兑换 reset credit、修改账户或代表 OpenAI 官方承诺。这条产品边界应原样保留。

### 4.2 公开信号来源

参考版本默认启用四个来源，并分配权重：

| 来源 | 权重 | 类型 | 作用 |
| --- | ---: | --- | --- |
| Codex 负责人公开动态 | `1.00` | 公开 API | 最高权重的直接信号 |
| OpenAI Status | `0.70` | Statuspage JSON | 官方事故、恢复和限流状态 |
| 社区重置历史 | `0.58` | HTML | 从历史里程碑推测经验窗口 |
| OpenAI/Codex GitHub 社区 | `0.35` | GitHub issues API | 低权重社区佐证 |

来源数据先经过 normalize，再由 signal classifier 判断是否 actionable。不同来源的重复信息会合并，旧信号有过期条件，避免同一条消息持续触发通知。

### 4.3 个人账户采集

参考项目的账户采集不是免登录能力：

- `src/content.js` 仅匹配 `https://chatgpt.com/*`。
- 从现有 ChatGPT 页面中的 `client-bootstrap` 获取短期 access token。
- 请求 `/backend-api/wham/usage`。
- 请求 `/backend-api/wham/rate-limit-reset-credits`。
- token 只写入 `chrome.storage.session`，不写持久化存储。
- 后台脚本会校验 hostname、端口、路径和响应类型。

这利用的是用户已经打开并登录的 ChatGPT 页面。换成 Electron 后仍需要用户登录；把 token 或 Cookie “免登录获取”既不符合技术事实，也会造成明显的安全和合规风险。

### 4.4 Forecast 与 Advice 的算法边界

参考项目的 forecast 是确定性启发式算法：

- 默认预测窗口是未来 72 小时；
- 每 6 小时一个 slot；
- 根据 source weight、classifier score、来源数量和事件时间计算总概率；
- 用以事件时间为中心的权重分布把概率分配到时间槽；
- 没有有效信号时只显示低基线。

Advice 也不是模型自由生成，而是固定优先级：

1. 当前已经 blocked；
2. reset credit 在 24 小时内到期；
3. 高置信度的未来官方信号；
4. 账户数据缺失或不完整；
5. 5 小时窗口很低且距离恢复较远；
6. 周配额较低且距离恢复较远；
7. 配额健康时建议继续工作并保留 credit。

这个设计非常适合桌面应用：规则可测试、结果可解释、没有 AI 幻觉依赖。

## 5. 与当前项目的映射和缺口

| 参考能力 | 当前项目对应位置 | 当前状态 | 需要补充 |
| --- | --- | --- | --- |
| 公开源抓取 | `src/main/services/trending/providers/` | 已有社交平台 provider 模式 | 新增 reset signal provider，不与社交热榜 provider 混用 |
| provider 健康状态 | `TrendingProviderHealth`、refresh state | 已有 | 增加来源级错误、证据数量和置信度 |
| SQLite 缓存 | migration 15/16、`SocialTrendingRepository` | 已有缓存范式 | 新增 reset radar snapshot、signal、evidence 表 |
| IPC | `src/main/ipc/trending.ts`、preload generic invoke | 已有 | 新增显式 `reset-radar:*` channel，并校验输入 |
| Dashboard 卡片 | `src/renderer/modules/dashboard/index.tsx` | 固定布局 | 新建 `ResetRadarCard.tsx` |
| 内置网页浏览 | `webview`、ArticleViewer | 已有 | 新增 ChatGPT 登录/采集专用容器，不复用任意 URL 逻辑 |
| AI 摘要 | `src/main/services/ai-summary.ts` | 已有文章摘要 | 增加结构化证据解释入口，禁止把 AI 当作事实源 |
| 通知 | 已有 notification service | 可复用 | 增加信号去重、静默时段和“仅高置信度”开关 |
| 个人配额 | 现有 AI subscription tracker | 不具备 | 新增可选 ChatGPT session capture |
| 定时任务 | trending scheduler、launchd 托管 | 已有 | 采用短超时、串行/限并发和失败退避 |

当前社交雷达专项测试可以证明 provider、缓存、字段完整性和 V2EX fallback 的工程模式，但它不能证明 Codex 私有配额接口稳定。两类数据源必须分开报告健康状态。

## 6. 建议的目标架构

### 6.1 分层结构

建议增加以下目录，保持与现有 main/shared/renderer 分层一致：

```text
src/
├── shared/reset-radar.ts
├── main/services/reset-radar/
│   ├── reset-radar-service.ts
│   ├── signal-sources.ts
│   ├── account-capture.ts
│   ├── classifier.ts
│   ├── forecast.ts
│   ├── advice.ts
│   └── reset-radar-repository.ts
├── main/ipc/reset-radar.ts
└── renderer/modules/dashboard/components/ResetRadarCard.tsx
```

### 6.2 数据流

```text
公开 Status/API/HTML ──┐
                        ├─> source adapter ─> normalize ─> classifier ─┐
已登录 ChatGPT 会话 ───┘                                             │
                                                                      ├─> snapshot/cache ─> IPC ─> Dashboard Card
配额窗口/Reset Credits ─> tolerant normalize ─────────────────────────┘
                                                                      │
                                                                      └─> optional AI explanation
```

### 6.3 建议的共享数据模型

`ResetRadarSnapshot` 至少应包含：

```ts
interface ResetRadarSnapshot {
  generatedAt: string
  account: {
    status: 'signed_out' | 'connected' | 'stale' | 'error'
    fetchedAt: string | null
    plan: string | null
    limitReached: boolean | null
  }
  quotaWindows: Array<{
    kind: 'five_hour' | 'weekly' | 'generic'
    remainingPercent: number | null
    resetAt: string | null
    durationSeconds: number | null
  }>
  resetCredits: {
    availableCount: number | null
    nearestExpiry: string | null
  } | null
  activeSignal: ResetSignal | null
  forecast: ResetForecast
  advice: ResetAdvice
  sources: ResetSourceHealth[]
}
```

所有时间统一存 UTC/Unix，渲染时按用户时区转换。任何字段无法可靠识别时使用 `null` 和状态说明，不使用猜测值填充。

### 6.4 IPC 设计

建议提供以下主进程 IPC：

```text
reset-radar:getSnapshot({ forceRefresh?: boolean })
reset-radar:refreshPublicSignals()
reset-radar:captureAccount()
reset-radar:openChatGPTLogin()
reset-radar:getDiagnostics()
```

约束：

- `captureAccount` 只在主进程执行允许的 ChatGPT host/path 请求。
- renderer 只能收到规范化后的 quota、credits、signal 和 advice。
- 不把 Cookie、Authorization header、原始 HTML 或 access token 返回给 renderer。
- 所有 URL 采用 allowlist，不接受任意用户输入直接拼接请求。
- 请求统一配置超时、响应类型检查、状态码处理和失败缓存。

## 7. AI 的正确定位

### 7.1 推荐：确定性雷达 + AI 解释

真正影响用户决策的字段应由代码计算：

- 当前是否到达限制；
- 5 小时/周窗口剩余多少；
- reset credit 是否存在、何时过期；
- 是否存在高置信度公开信号；
- forecast 时间槽和整体置信等级；
- 是否需要提示用户等待或保留 credit。

AI 只接收已经规范化的有限证据，生成：

- 一句话摘要；
- 影响判断的 2-3 个事实；
- 数据缺失和不确定性说明；
- 可选的下一步建议。

这样即使 AI 不可用，卡片仍能正常工作；AI 输出错误也不会改变配额或触发危险动作。

### 7.2 不推荐：让 AI 直接猜重置时间

以下做法不建议采用：

- 将网页正文直接交给模型，让模型自由判断“几点重置”；
- 用历史少量样本要求模型给出精确时间；
- 在没有公开信号时让模型补全预测；
- 用模型输出直接决定是否兑换 reset credit。

原因是参考项目使用的来源有社区信号、历史经验和非官方报告，证据本身不能等同官方承诺。模型最多可以解释证据，不能创造不存在的事实。

### 7.3 AI 调用策略

建议使用结构化输入和结构化输出：

```json
{
  "signal": "...",
  "source": "OpenAI Status",
  "sourceWeight": 0.7,
  "observedAt": "2026-08-27T10:00:00Z",
  "eventAt": null,
  "accountStatus": "signed_out",
  "quota": null,
  "confidence": "low"
}
```

AI 输出只允许：

```json
{
  "summary": "...",
  "facts": ["..."],
  "uncertainties": ["..."],
  "recommendation": "hold | wait | check_account | none"
}
```

调用频率应按新信号或用户点击触发，而不是每次 30 分钟后台刷新都调用。结果按 signal ID、快照版本和 prompt 版本缓存，降低成本和不稳定性。

当前 `ai:summarize` 使用本机 Claude CLI 或 Anthropic API，可以作为第一版 provider；后续如果需要 JSON schema、模型选择和多 provider fallback，应抽象独立的 `reset-radar-ai-service`，不要把预测逻辑塞进文章摘要 handler。

## 8. 登录态、隐私与安全边界

### 8.1 必须区分两种模式

**访客模式：**

- 只访问公开 Status、公开社区源和公开历史。
- 显示公开信号、来源、时间、可信度和低基线 forecast。
- 不显示个人配额和 reset credit。
- 不要求用户登录。

**账户模式：**

- 用户在内置 ChatGPT 页面主动登录。
- 仅读取必要的 usage 和 reset-credit 字段。
- token/Cookie 保持在 Electron session 或主进程安全边界内。
- 失效时降级为访客模式，不反复弹登录或疯狂重试。

### 8.2 Electron 实现注意事项

参考项目依赖浏览器 content script；Electron 不能简单复制这个权限模型。建议：

1. 使用独立的 `persist:chatgpt-session` session partition。
2. ChatGPT 页面只允许加载 `https://chatgpt.com/*`。
3. 采集请求在主进程完成，并只允许固定路径：
   - `/backend-api/wham/usage`
   - `/backend-api/wham/rate-limit-reset-credits`
4. 不记录 Cookie、token、Authorization header 和原始私有响应到日志。
5. 账户快照只保存规范化后的数值和时间，不保存完整网页内容。
6. 页面关闭或用户点击退出账户时，清理 session token 和内存引用。
7. 采集失败只保存状态码、错误类别和时间，避免把敏感响应写入 `.dev-logs`。

当前项目已启用 sandbox、context isolation 和关闭 node integration，这是良好基础；但现有通用 `webview` 和 `electronAPI.invoke` 仍然不应被当作账户数据安全边界，新增功能需要显式 channel 和参数校验。

## 9. 数据源可行性和降级策略

| 数据 | 是否免登录 | 稳定性 | 建议 |
| --- | --- | --- | --- |
| OpenAI Status 公开 API | 是 | 中高 | 作为最高可信公开源之一，但只反映公开事故/状态 |
| 公开社区帖子/历史页面 | 是 | 中低 | 作为低权重佐证，保留原始证据链接 |
| GitHub 公开 issues | 是 | 高 | 只作为低权重社区证据，做好 rate limit 处理 |
| ChatGPT usage endpoint | 否 | 中低 | 仅在用户登录会话内尝试，必须允许失效 |
| reset-credit endpoint | 否 | 中低 | 仅在用户登录会话内尝试，不得伪造数据 |
| AI 解释服务 | 取决于 provider | 中 | 可选、可缓存、失败不影响主卡片 |

当前项目的社交雷达已经证明了 fallback 机制可行，但当前真实运行数据库显示：

- 小红书、抖音、Product Hunt 多数时期可以走公开 provider；
- V2EX 的 live API 和 RSSHub 在当前网络环境下曾超时，使用 `fixture`，状态为 `warn`；
- fallback 能保证 10 条数据，却不能保证“实时热门”。

重置雷达必须沿用同样的状态表达：`ok`、`warn`、`stale`、`error`，并在 UI 上区分“实时证据”“缓存证据”“本地估算”，不能只显示一个绿色成功图标。

## 10. macOS 运行稳定性要求

此前项目出现“运行一段时间后被杀死”的现象，实际证据更符合 Codex/PTY 启动链路被清理，而不是业务代码主动退出。当前已增加 `launchd` 托管脚本和生命周期日志。

重置雷达接入后应遵守：

- 公开抓取使用 `AbortController` 超时，默认不超过 10-12 秒。
- 单个平台或来源失败不得退出 Electron 主进程。
- 定时刷新不可堆叠；上一轮未结束时跳过或取消下一轮。
- AI 调用不能阻塞窗口创建和 renderer 首屏。
- 页面退出时清理 timer、webview listener 和未完成请求。
- 网络错误、401/403、429、解析错误分别统计，便于诊断真实退出原因。
- 开发态继续通过 `pnpm dev:launchd` 启动，停止使用 `pnpm dev:launchd:stop`。

## 11. 分阶段实施建议

### Phase 0：只做卡片和模拟数据

目标：验证 Dashboard 视觉、状态层级和交互，不接真实账户。

- 新建 `ResetRadarCard`。
- 使用固定 fixture snapshot 渲染四种状态：健康、预警、无登录、错误。
- 加入“查看证据”“刷新”“打开 ChatGPT”按钮。
- 增加 snapshot 类型和 renderer 测试。

预计工作量：1-2 个开发日。

### Phase 1：公开信号雷达

目标：不登录也能工作。

- 增加 OpenAI Status provider。
- 增加可配置的社区/GitHub provider。
- 实现 source normalize、去重、权重、过期和缓存。
- 实现确定性的 classifier、72 小时 forecast 和 advice。
- 增加健康状态、刷新时间、证据链接和通知去重。

预计工作量：2-3 个开发日。

### Phase 2：个人账户快照

目标：用户主动登录后增加个人配额信息。

- 增加独立 ChatGPT session webview。
- 在主进程实现固定路径采集和响应规范化。
- 增加 signed-out、connected、stale、error 状态。
- 不保存原始 token、Cookie 或完整私有页面内容。
- 对 401/403、接口变更和反爬进行降级测试。

预计工作量：3-5 个开发日，风险最高。

### Phase 3：AI 解释层

目标：提升可读性，不改变事实判断。

- 将规范化证据转换成结构化 prompt。
- 增加 `reset-radar:explain` IPC。
- 只允许模型输出摘要、事实、不确定性和有限建议枚举。
- 按 signal/version 缓存结果。
- AI 不可用时回退到规则文案。

预计工作量：2-3 个开发日。

### Phase 4：通知、诊断和发布质量

- 增加 macOS 通知和安静时间。
- 增加 provider doctor/诊断页。
- 增加模拟 401、429、超时、空 payload、字段变化测试。
- 验证长时间运行、窗口关闭重开和网络切换。
- 更新隐私文档和产品免责声明。

预计工作量：2-3 个开发日。

## 12. 验收标准

### 功能验收

- 未登录时卡片可正常打开，能展示公开雷达和低基线状态。
- 登录失败或 session 过期时，应用不闪退，自动降级到访客模式。
- 个人配额字段缺失时显示“未知”，不生成伪造百分比。
- 所有 forecast 都展示来源、生成时间、置信等级和估算说明。
- 点击证据能在应用内打开对应来源，失败时可在系统浏览器打开。
- 不会触发任何自动 reset、兑换、订阅变更或账户写操作。

### 工程验收

- `pnpm typecheck` 和 `pnpm build` 通过。
- 公开 provider、normalize、classifier、forecast、advice 有单元测试。
- 401、403、429、超时、空数据和字段变更均有测试。
- `pnpm dev:launchd` 启动后，至少持续观察 10 分钟，Electron、renderer 和 `5173` 仍存在。
- 应用退出日志能区分 `before-quit`、renderer 崩溃、SIGTERM 和无日志进程消失。
- 日志和 SQLite 中不存在 token、Cookie、Authorization header 和完整私有响应。

## 13. 风险与最终建议

最大风险不是 React 卡片，也不是 SQLite，而是 Codex 私有配额接口属于未公开实现，可能发生字段变化、登录态失效、区域限制、反爬或服务端拒绝。参考扩展通过浏览器已有登录态降低了接入难度，但没有消除这些风险。

因此建议批准实现，但按以下产品承诺落地：

> “HulkDash 提供基于公开证据的 Codex 重置雷达；在用户主动登录后，可在本地读取当前账户配额和 reset credits。预测是启发式估算，AI 只负责解释证据，不代表 OpenAI 官方信息，也不会自动重置或兑换额度。”

这个范围与当前 MyDashboard 的本地优先定位、Electron 分层、SQLite 缓存和已有 AI 能力匹配，技术风险可控；如果要求“完全免登录读取个人配额”或“AI 精确预测官方重置时间”，则不建议承诺，技术上不可稳定保证。
