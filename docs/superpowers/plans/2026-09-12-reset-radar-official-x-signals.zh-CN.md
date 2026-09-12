# Reset Radar 官方 X 信号校准 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Codex Reset Radar 以 Tibo 等已验证 OpenAI/Codex 官方人员的明确 X 公告为核心证据，并将预告、无关额度讨论、过期数据和服务状态清楚区分。

**Architecture:** `public-signal.ts` 从参考站公开的 Tibo 时间线读取带来源新鲜度与事件分类的原始动态；应用仍独立验证作者、公告文本、是否为回复和时间窗口，不信任第三方的高置信结论。OpenAI Status 继续显示为来源健康信息，但不再单独产生“重置”活动信号。现有卡片与通知继续使用稳定的 signal id，避免重复弹出。

**Tech Stack:** Electron main process、TypeScript、Node test runner、OpenAI Status JSON、`codex-reset.com` 公开只读 feed。

## Global Constraints

- 仅使用公开、只读信息；不读取 X 登录态、Cookie 或私人账户数据。
- 高置信活动信号必须来自已验证的官方账号、非回复的明确重置确认，且发布时间在 24 小时内。
- 面向特定计划或“banked reset”的公告不等同于全局重置；保留为可查看的公开依据与观察信号。
- OpenAI Status 的故障不作为任何重置的证明，也不得触发 Reset Radar 消息通知。
- 每个来源必须暴露 `ok`、`stale` 或 `error`，不能因 HTTP 200 将旧数据误报为正常。
- 先写失败测试并确认失败，再修改生产代码；不提交用户已有的无关工作区改动。

---

### Task 1: 官方时间线解析与严格分类

**Files:**
- Modify: `scripts/test-reset-radar.ts`
- Modify: `src/main/services/reset-radar/public-signal.ts`

**Interfaces:**
- Consumes: `codex-reset.com/api/feed` 的 `profile.handle`、`stale`、`newest_post_at` 与 `tweets[]` 公共字段。
- Produces: `parseOfficialXResetAnnouncements(payload)`，仅返回有明确官方重置语义的 `XResetAnnouncement[]`；`buildPublicResetRadarSnapshot()` 接收 X 源健康状态。

- [ ] **Step 1: 写失败测试**

```ts
test('accepts a recent explicit Tibo global-reset confirmation without quota keywords', () => {
  const announcements = parseOfficialXResetAnnouncements({
    profile: { handle: 'thsottiaux' },
    tweets: [{
      id: 'confirmed-reset',
      text: 'Reset all propagated. Sweet dreams.',
      at: '2026-09-12T08:09:17.000Z',
      url: 'https://x.com/thsottiaux/status/confirmed-reset',
      is_reply: false,
      tibo_lane: 'reset_announcement',
      explicit_reset_claim: true,
    }],
  })
  assert.equal(announcements[0].resetType, 'global')
})

test('does not turn an official tease, a reply, or a scoped banked reset into a global active signal', () => {
  // A reply mentioning reset and a Plus-only banked reset stay public evidence,
  // but only a non-reply explicit all-user confirmation can become active/high.
})

test('keeps an OpenAI status incident informational when no official reset confirmation exists', () => {
  assert.equal(buildPublicResetRadarSnapshot(status).activeSignal, null)
})
```

- [ ] **Step 2: 运行失败测试**

Run: `npm run test:reset-radar`

Expected: FAIL because `parseOfficialXResetAnnouncements` and strict signal classification do not exist.

- [ ] **Step 3: 实现最小严格解析**

```ts
const OFFICIAL_X_HANDLE = 'thsottiaux'
const ACTIVE_CONFIRMATION_MAX_AGE_MS = 24 * 60 * 60 * 1000

function isExplicitGlobalReset(tweet: OfficialXPost): boolean {
  return tweet.author === OFFICIAL_X_HANDLE
    && !tweet.isReply
    && tweet.explicitResetClaim
    && /\b(reset all|all reset|global reset)\b/i.test(tweet.text)
}
```

保留受限计划或 banked reset 的公开依据，但将其标记为 `gift`，只提供观察/核验建议。将 OpenAI Status 由 `activeSignal` 分支移除；其状态只写入 `sources[0]`。从 feed 的 `stale` 和 `newest_post_at` 推导 X 健康度；非当前数据不进入活动判定。

- [ ] **Step 4: 运行通过测试**

Run: `npm run test:reset-radar`

Expected: 全部子测试通过，且已有的历史去重与账户测试保持绿色。

### Task 2: 刷新链路与用户可解释性

**Files:**
- Modify: `src/main/services/reset-radar/public-signal.ts`
- Modify: `src/renderer/modules/ai-lab/components/ResetRadarCard.tsx`
- Modify: `docs/ai-reset-radar-feasibility.zh-CN.md`

**Interfaces:**
- Consumes: 严格分类后的 `ResetRadarSnapshot.publicSignals`、`sources` 与 `activeSignal`。
- Produces: 卡片中可核对的官方来源和不夸大的状态描述。

- [ ] **Step 1: 写失败的 UI/来源契约**

在 `scripts/test-reset-radar.ts` 断言卡片展示官方账号来源和数据过期状态，不将 OpenAI Status 直接标为重置信号。

- [ ] **Step 2: 更新卡片文案**

活动信号为官方确认时显示“官方确认”；受限 banked reset 显示“官方预告/补偿，需检查账户”；当 X 数据过期时显示“官方动态源数据已过期”，并保留“查看公开依据”入口。

- [ ] **Step 3: 更新可行性文档**

在 `docs/ai-reset-radar-feasibility.zh-CN.md` 明确证据层级：账户用量为事实、官方明确公告为高置信、官方预告为中置信、OpenAI Status 与社区讨论只作背景。记录 `codex-reset.com/api/feed` 为只读聚合参考源及独立校验边界。

- [ ] **Step 4: 运行专项验证**

Run:

```bash
npm run test:reset-radar
npm run typecheck
npm run build
git diff --check
```

Expected: 所有命令退出码为 0。

### Task 3: 运行验收

**Files:**
- Modify: `docs/backlogs/p1-knowledge-content.zh-CN.md`

- [ ] **Step 1: 更新 Backlog**

追加已完成的“官方 X 信号校准”条目，说明高置信只由近 24 小时的明确官方确认触发；不依赖社区推断或服务故障。

- [ ] **Step 2: 启动应用**

Run: `npm run dev:launchd`

Expected: `com.dorck.hulkdash.dev` 为 running，`http://localhost:5173/` 返回 HTTP 200。

- [ ] **Step 3: 人工验收门槛**

检查 AI Lab 的 Reset Radar：最新 Tibo 明确“all reset”公告显示为官方确认；受限 banked reset 与普通额度讨论不显示为全局重置；OpenAI Status 波动不会单独触发高置信通知；来源列表展示数据新鲜度。

## 计划自检

- 覆盖了官方账号校验、明确与预告信号分级、过期源识别、服务状态降级、UI 可解释性、文档、Backlog 与回归验证。
- 仅使用公开只读数据；未新增对 X 的登录、写入或账户访问。
