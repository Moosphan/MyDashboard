# HeroUI 最小兼容性试点 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在独立工作台验证 HeroUI3 / React19 / Tailwind4 的依赖、编译、原生默认主题与基本浮层交互，为正式迁移提供第一道门槛。

**Architecture:** 先在 `.scratch/heroui-pilot/` 创建独立 Vite React 工程，不改生产依赖或renderer。采用真正的 HeroUI React组件，直接导入上游默认样式，CSS仅设置工作台页面布局，测试Button、TextField、Checkbox和Modal内Select；后续完整页面迁移依照方案的阶段表推进。

**Tech Stack:** HeroUI React / Styles3.2.6，React19，Tailwind4，Vite6，TypeScript5，Playwright。

## Global Constraints

- 本文为执行计划，本次调研未执行以下安装、编码和测试步骤。
- 总体决策与全部58类映射见 [新版方案](../../design-system/heroui-adoption-proposal.md)。本清单仅覆盖最小兼容性探针，不等于全部A阶段或生产迁移完成。
- 固定HeroUI React与Styles为3.2.6；不混用v2 API、Provider、theme插件或独立v2组件包。
- React19与Tailwind4的补丁版本在执行时解析、固定到package.json并记录锁文件；不绕过peer检查。
- 不修改主进程 / preload / IPC / 声音克隆业务，不改变当前页面结构。
- 遵循HeroUI3.2.6默认颜色、圆角、尺寸、排版与动效；不增加品牌色或组件外观覆盖；同时验证明暗主题与嵌套浮层。
- 工作台没有生产数据和音色文件；系统文件选择仍使用OS能力。

---

## Task 1: 可复现的构建与交互探针

**Files（均位于 `.scratch/heroui-pilot/`）：**

- Create: `package.json` / `pnpm-lock.yaml`，独立锁定依赖。
- Create: `index.html` / `vite.config.ts` / `tsconfig.json`，独立编译入口。
- Create: `src/main.tsx` / `src/theme.css`，真实组件与工作台布局。
- Create: `playwright.config.ts` / `tests/pilot.spec.ts`，有意义的主题和焦点验证。
- Create: `verification.md`，记录实际版本、命令输出、截图与限制。

**Interfaces:**

- Consumes: HeroUI3.2.6公开导出；本计划不接生产业务接口。
- Produces: 可由 `pnpm build`、`pnpm typecheck`、`pnpm test` 验证的独立工程，以及试点结果。

- [ ] **Step 1：创建独立目录并安装依赖。** 目录已存在时先检查内容，复用可用成果；不得覆盖未知文件。

初始 `package.json`：

```json
{
  "name": "mydashboard-heroui-pilot",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1 --port 3046 --strictPort",
    "typecheck": "tsc --noEmit",
    "build": "vite build",
    "test": "playwright test"
  }
}
```

在此独立目录执行，保留完整输出：

```bash
pnpm add --save-exact @heroui/react@3.2.6 @heroui/styles@3.2.6 react@19 react-dom@19 react-aria@^3.52.1 react-aria-components@^1.21.1 @react-aria/ssr@^3.10.1 @react-aria/utils@^3.34.1 @internationalized/date@^3.12.4
pnpm add -D --save-exact vite@6 @vitejs/plugin-react@4 typescript@5 @types/react@19 @types/react-dom@19 tailwindcss@4 @tailwindcss/vite@4 @playwright/test@1
pnpm list --depth 0
```

预期：无不满足的peer；React与ReactDOM版本一致；两个HeroUI包都是3.2.6。若构建插件与Vite6冲突，记录冲突并选择满足其peer的精确插件版本，再继续，不使用强制安装。

- [ ] **Step 2：建立编译入口与失败检查。**

`index.html`：

```html
<!doctype html>
<html lang="zh-CN" class="light">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>HeroUI 接入试点</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`vite.config.ts`：

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({ plugins: [react(), tailwindcss()] })
```

`tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "tests", "vite.config.ts", "playwright.config.ts"]
}
```

执行 `pnpm build`，预期此时因缺少 `src/main.tsx` 失败；保留失败原因，排除环境导致的无关失败。

- [ ] **Step 3：加入真实组件。**

`src/main.tsx`：

```tsx
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Button, Checkbox, Input, Label, ListBox, Modal, Select, TextField } from '@heroui/react'
import './theme.css'

function EngineSelect() {
  return (
    <Select aria-label="克隆引擎" placeholder="选择引擎">
      <Label>克隆引擎</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox aria-label="引擎选项">
          <ListBox.Item id="voxcpm" textValue="VoxCPM2">
            VoxCPM2
          </ListBox.Item>
          <ListBox.Item id="qwen" textValue="Qwen3-TTS">
            Qwen3-TTS
          </ListBox.Item>
        </ListBox>
      </Select.Popover>
    </Select>
  )
}

function App() {
  const [dark, setDark] = useState(false)
  const [name, setName] = useState('我的音色')
  return (
    <main>
      <h1>HeroUI 兼容性试点</h1>
      <p>当前主题：{dark ? '深色' : '浅色'}</p>
      <Button
        variant="secondary"
        onPress={() => {
          const next = !dark
          document.documentElement.classList.toggle('dark', next)
          document.documentElement.classList.toggle('light', !next)
          setDark(next)
        }}
      >
        切换主题
      </Button>
      <TextField value={name} onChange={setName}>
        <Label>音色名称</Label>
        <Input />
      </TextField>
      <Checkbox>
        <Checkbox.Content>
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
          <Label>保留试听记录</Label>
        </Checkbox.Content>
      </Checkbox>
      <Modal>
        <Button>打开设置</Button>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog>
              <Modal.Header>
                <Modal.Heading>音色设置</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <EngineSelect />
              </Modal.Body>
              <Modal.Footer>
                <Modal.CloseTrigger>关闭设置</Modal.CloseTrigger>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`src/theme.css`：

```css
@import 'tailwindcss';
@import '@heroui/styles';

/* 仅布局工作台；组件视觉由上游样式决定。 */
body {
  margin: 0;
  background: var(--background);
  color: var(--foreground);
}
main {
  display: grid;
  gap: 20px;
  max-width: 560px;
  padding: 48px;
}
```

执行 `pnpm typecheck` 和 `pnpm build`，预期退出码0。如果精确发布API与示例存在差异，读取已安装包 `.d.ts` / 官方对应版本源码修正，不使用类型断言掩盖。

- [ ] **Step 4：验证上游默认样式、受控字段、主题和嵌套浮层。**

`playwright.config.ts`：

```ts
import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  use: { baseURL: 'http://127.0.0.1:3046', viewport: { width: 1440, height: 1000 } },
  webServer: { command: 'pnpm dev', url: 'http://127.0.0.1:3046', reuseExistingServer: false },
})
```

`tests/pilot.spec.ts`：

```ts
import { test, expect } from '@playwright/test'

test('默认主题、字段与Modal内Select', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  const open = page.getByRole('button', { name: '打开设置', exact: true })
  // 24px为固定版本3.2.6默认主题的回归基线，不是项目圆角定制。
  await expect(open).toHaveCSS('border-radius', '24px')
  await page.getByRole('textbox', { name: '音色名称' }).fill('试点音色')
  await expect(page.getByRole('textbox', { name: '音色名称' })).toHaveValue('试点音色')
  const checkbox = page.getByRole('checkbox', { name: '保留试听记录' })
  await checkbox.focus()
  await page.keyboard.press('Space')
  await expect(checkbox).toBeChecked()
  await page.getByRole('button', { name: '切换主题' }).click()
  await expect(page.locator('html')).toHaveClass('dark')
  await open.click()
  const dialog = page.getByRole('dialog', { name: '音色设置' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: /克隆引擎/ }).click()
  await expect(page.getByRole('listbox')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('listbox')).toBeHidden()
  await expect(dialog).toBeVisible()
  await page.screenshot({ path: 'artifacts/dark-modal.png', fullPage: true })
  await dialog.getByRole('button', { name: '关闭设置' }).click()
  await expect(dialog).toBeHidden()
  await expect(open).toBeFocused()
  await page.getByRole('button', { name: '切换主题' }).click()
  await expect(page.locator('html')).toHaveClass('light')
  await page.screenshot({ path: 'artifacts/light-controls.png', fullPage: true })
  expect(errors).toEqual([])
})
```

执行 `pnpm exec playwright install chromium`、`pnpm test`。预期1个测试通过，输出两张真实截图；截图仍需人工审阅，不凭通过自动宣称审美满足要求。测试里的角色查询以实际可访问树为准，不能为让测试变绿而给非交互节点伪造role。

- [ ] **Step 5：记录结果和正式接入的剩余检查。**

将 `pnpm list --depth 0`、类型 / 构建 / 交互命令的实际结果、截图路径写入 `verification.md`。每项写“已验证 / 失败 / 未执行”，不能把浏览器通过写成Electron通过。

最小探针通过后，完整A阶段仍需Slider、RadioGroup、Tabs、日期 / 时间 / 颜色、长表单滚动与中文locale样例；正式项目升级前另需验证Tiptap / dnd-kit / Radix兼容、旧颜色隔离与 `settingsStore` 主题桥。按 [方案阶段表](../../design-system/heroui-adoption-proposal.md#8-实施次序与退出条件) 推进。

## 完成定义与移交

本试点完成的证据仅是独立浏览器工程可解析依赖、可编译、指定交互可用和实际截图。它不能证明生产UI已迁移、全部无障碍合规或Electron适配已完成。

当前共享工作区有未提交业务改动；不自动提交、覆盖或清理这些文件。若后续用户要求正式实施，先读项目最新状态，使用独立迁移变更推进方案B–F阶段。
