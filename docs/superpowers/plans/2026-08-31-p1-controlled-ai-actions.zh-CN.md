# P1-05 受控 AI 任务建议 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 在 Dashboard 提供一个本地优先、可预览、逐项确认且可审计的 AI 任务建议工作流。

**架构：** 用户在弹窗中选择一个活动项目并填写目标；主进程仅将该项目和其未完成任务发送给已配置的 AI 服务。模型只返回结构化的“创建任务”草案，主进程校验并保存草案；用户勾选后才会调用现有任务仓库创建任务，取消的草案绝不写入任务表。

**技术栈：** Electron IPC、React、TypeScript、SQLite、better-sqlite3、现有 OpenAI-compatible AI subscription。

## 全局约束

- 直接在 `main` 开发，这是用户明确要求。
- 不执行外部浏览器、发布、网络写入、文件删除或账号操作。
- 模型上下文仅包含用户主动选择的单个活动项目、该项目最多 12 条未完成任务和用户输入的目标；不得读取其他项目、素材、文章、订阅密钥或账户数据。
- 模型只可建议 `create_task`；每次最多 5 条。项目 ID 由主进程绑定，绝不信任模型返回的关联 ID。
- 每条草案必须在 UI 预览后由用户单独或批量确认；确认前不得创建任务。
- 所有生成、确认和忽略动作必须持久化；短期失败或非 JSON 响应不得产生半成品任务。
- 先写失败测试并确认失败，再实现最小代码；完成后运行专项测试、类型检查、构建和应用，等待用户确认再提交。

---

## 文件结构

- 新增 `src/main/database/repositories/ai-action-repository.ts`：持久化生成批次、草案状态和已创建任务的关联。
- 新增 `src/main/services/ai-action-planner-service.ts`：收窄上下文、调用模型、解析严格 JSON、校验和应用草案。
- 新增 `src/main/ipc/ai-actions.ts`：仅暴露生成、查询、确认、忽略四个 IPC 通道。
- 新增 `src/renderer/modules/dashboard/components/AIActionPlannerDialog.tsx`：项目选择、目标输入、草案预览与显式确认 UI。
- 修改 `src/main/database/migrations/index.ts`、`src/main/index.ts`、`src/renderer/modules/dashboard/index.tsx`、`src/renderer/modules/dashboard/components/TodayOverview.tsx`、`package.json` 和 P1 Backlog。
- 新增 `scripts/test-ai-action-planner.ts`、`scripts/run-ai-action-planner-test.cjs`：对真实 SQLite 仓库和注入的模型客户端做行为测试。

## 任务 1：可审计草案与受控服务

**文件：**
- Create: `scripts/test-ai-action-planner.ts`
- Create: `scripts/run-ai-action-planner-test.cjs`
- Create: `src/main/database/repositories/ai-action-repository.ts`
- Create: `src/main/services/ai-action-planner-service.ts`
- Modify: `src/main/database/migrations/index.ts`
- Modify: `package.json`

**接口：**

```ts
export interface AIActionProposal {
  id: number
  title: string
  description: string | null
  priority: 'high' | 'medium' | 'low'
  dueDate: string | null
  tags: string[]
  status: 'proposed' | 'applied' | 'dismissed'
  taskId: number | null
}

export interface AIActionPlan {
  id: number
  projectId: number
  objective: string
  summary: string
  provider: string | null
  model: string
  createdAt: string
  proposals: AIActionProposal[]
}

export class AIActionPlannerService {
  generate(input: { projectId: number; objective: string }): Promise<AIActionPlan>
  apply(input: { planId: number; proposalIds: number[] }): { createdTaskIds: number[]; plan: AIActionPlan }
  dismiss(proposalId: number): AIActionPlan
  findRecent(projectId?: number, limit?: number): AIActionPlan[]
}
```

- [ ] **Step 1: 写失败测试**

在 `scripts/test-ai-action-planner.ts` 写三组测试：

```ts
test('sends only the selected project and its open tasks to the model', async () => {
  // 建两个项目和各自任务；生成时断言 prompt 含选中项目和未完成任务，
  // 不含另一个项目、另一个任务和已完成任务。
})

test('rejects malformed or over-limit model proposals without saving a plan', async () => {
  // 注入非 JSON、6 条 action、非法 priority，断言 generate reject 且表为空。
})

test('creates tasks only for explicitly applied proposals and audits all outcomes', async () => {
  // 生成两条草案，dismiss 第一条、apply 第二条；断言 tasks 只有一条，
  // 状态分别为 dismissed/applied，applied 草案关联创建的 task_id。
})
```

- [ ] **Step 2: 运行失败测试**

运行：`pnpm test:ai-action-planner`

预期：失败，提示缺少 `AIActionPlannerService` 或脚本命令。

- [ ] **Step 3: 实现最小数据与服务层**

增加 `028_ai_action_plans` 迁移，创建：

```sql
CREATE TABLE ai_action_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  objective TEXT NOT NULL,
  summary TEXT NOT NULL,
  provider TEXT,
  model TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE ai_action_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES ai_action_plans(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK(action_type = 'create_task'),
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL CHECK(priority IN ('high', 'medium', 'low')),
  due_date DATE,
  tags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed', 'applied', 'dismissed')),
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  resolved_at DATETIME
);
```

服务必须构造以下 JSON-only prompt，并在解析前移除可选的 Markdown 代码围栏：

```text
你是本地任务规划助手。只可使用以下项目与未完成任务；不得推断或要求任何其他私人数据。
只输出 JSON：{"summary":"不超过 280 字","actions":[{"title":"不超过 120 字","description":"可选，不超过 500 字","priority":"high|medium|low","dueDate":"YYYY-MM-DD 或 null","tags":["最多 4 个，每个不超过 24 字"]}]}。
actions 最多 5 条；只能建议创建新任务，不得修改、删除、发布或操作外部系统。
```

校验目标非空、项目为 active、JSON shape、长度、日期格式、重复 proposal ID、草案状态；`apply` 用 SQLite transaction 调用 `TaskRepository.create`，将确认的 proposal 标为 `applied`，其余保持 `proposed`。

- [ ] **Step 4: 运行通过测试**

运行：`pnpm test:ai-action-planner`

预期：3 个子测试通过。

## 任务 2：IPC 与 Dashboard 确认弹窗

**文件：**
- Create: `src/main/ipc/ai-actions.ts`
- Create: `src/renderer/modules/dashboard/components/AIActionPlannerDialog.tsx`
- Modify: `src/main/index.ts`
- Modify: `src/renderer/modules/dashboard/index.tsx`
- Modify: `src/renderer/modules/dashboard/components/TodayOverview.tsx`

**接口：**

```ts
'ai-actions:generate' (input: { projectId: number; objective: string }) => IpcResponse<AIActionPlan>
'ai-actions:getRecent' (projectId?: number, limit?: number) => IpcResponse<AIActionPlan[]>
'ai-actions:apply' (input: { planId: number; proposalIds: number[] }) => IpcResponse<{ createdTaskIds: number[]; plan: AIActionPlan }>
'ai-actions:dismiss' (proposalId: number) => IpcResponse<AIActionPlan>
```

- [ ] **Step 1: 增加失败的 UI 行为断言或最小可调用契约**

若项目没有 renderer 测试框架，扩展任务 1 的服务测试，覆盖 IPC 要调用的 `apply` 仅写入勾选 ID；UI 使用现有 `useIpcData`、`useIpcMutation` 与 Toast，不引入测试依赖。

- [ ] **Step 2: 实现 IPC 注册**

每个通道调用 `AIActionPlannerService`，将异常转换为 `{ success: false, error }`，并在 `app.whenReady()` 中注册。不得向 renderer 暴露数据库、API Key 或任意通用执行接口。

- [ ] **Step 3: 实现确认 UI**

`TodayOverview` 标题右侧增加 `Plan tasks` 入口；`Dashboard` 控制弹窗可见性和数据刷新。弹窗需要：

```tsx
<select aria-label="Project">{activeProjects.map(/* 活动项目 */)}</select>
<textarea aria-label="Planning objective" maxLength={500} />
<button disabled={!projectId || !objective.trim() || generating}>Generate draft</button>
```

生成后展示 summary 与每条草案的复选框、优先级、可选截止日和标签；默认选中 `proposed` 草案。`Apply selected` 只发送勾选且仍为 proposed 的 ID；单条 `Dismiss` 立刻记录忽略状态。成功后 Toast 显示真实创建数量，调用 `onApplied` 刷新 Dashboard；没有 API Key 或模型返回不合法时只显示错误，不创建任务。

- [ ] **Step 4: 运行专项测试与静态检查**

运行：

```bash
pnpm test:ai-action-planner
pnpm typecheck
pnpm build
```

预期：测试全部通过，TypeScript 和 production build 退出码为 0。

## 任务 3：文档、运行和验收

**文件：**
- Modify: `docs/backlogs/p1-knowledge-content.zh-CN.md`

- [ ] **Step 1: 更新 Backlog**

追加 P1-05 条目，明确它只创建待确认的本地任务草案，不包含外部自动执行；状态写为 `In review`。

- [ ] **Step 2: 全量回归并启动应用**

运行：

```bash
pnpm test:focus-sessions
pnpm test:content-variants
pnpm test:ai-action-planner
pnpm typecheck
pnpm build
pnpm dev:launchd
```

预期：全部退出码为 0，应用由 `com.dorck.hulkdash.dev` 常驻，日志出现 `Applied migration: 028_ai_action_plans`。

- [ ] **Step 3: 人工验收门槛**

请用户在 Dashboard 打开 `Plan tasks`，选择项目并输入目标；确认生成内容先显示为草案，取消一项后不会创建任务，确认另一项后才在项目看板中出现该任务。用户确认前不得提交或推送。

## 计划自检

- 覆盖了范围收窄、上下文最小化、结构化输出、逐项确认、SQLite 审计、异常不落任务和 Dashboard 入口。
- 没有外部自动化、通用命令执行、文件写入或隐式读取私人数据。
- 所有生产接口均在任务 1 或任务 2 中定义；测试先于服务实现。
