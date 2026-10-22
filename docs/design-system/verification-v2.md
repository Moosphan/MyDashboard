# 设计规范 2.0 验证记录

验证日期：2026-10-22，Asia/Shanghai。范围是独立真实 React 设计资产；生产 renderer、Electron、IPC、用户设置桥和音频链路仍须独立迁移验收。

## 基线

HeroUI React / Styles 3.2.6，Heroicons 2.2.0（用户确认的缺项补充），React / ReactDOM 19.3.1，Tailwind / Vite 插件 4.3.3，Vite 6.4.5，TypeScript 5.9.3，Playwright 1.64.1。颜色从生产 globals.css 与 settingsStore.ts 同源适配。精确依赖见 `v2/package.json`，解析版本由独立 `v2/pnpm-lock.yaml` 固定。严格 peer 安装；生产依赖版本未改。

## 执行结果

| 命令                                                                   | 结果 / 覆盖                                          |
| ---------------------------------------------------------------------- | ---------------------------------------------------- |
| `pnpm --dir docs/design-system/v2 install --frozen-lockfile --offline` | 通过，锁文件可复现                                   |
| `pnpm design:check`                                                    | 通过，规范入口、布局源、精确版本和设计稿组件样式边界 |
| `pnpm design:build`                                                    | 通过，独立 TypeScript 与 Vite 构建                   |
| `pnpm design:verify`                                                   | 8 组通过（22.3s），本机 Chrome，无页面异常或失败资源 |
| `git diff --check`                                                     | 通过，现有已跟踪变更无空白错误                       |

8 组检查：9 视图双主题与无全页横向溢出；订阅演示校验、嵌套 Escape、焦点返回与关闭丢弃；配音 Unicode 计数、模式保留、超限、取消 / 失败 / 重试；1024px 原 5:7 双栏、720×550 缩放等效视口、system 和页面状态；默认 Button 尺寸、键盘焦点与图标 Tooltip；项目明暗背景 / 主色、SVG 图标与既有桌面入口；配音任务及文案关闭 / 重开和切页保留；自选主色低对比提示不阻止保存、无效 HEX 拦截、恢复默认及明暗 / system 提示同步。尺寸抽样是上游观测，不是重新设定 token。

视觉复核修正：1024px 倒计时单位保持同一行；深色 OpenAI 使用已有深色品牌资产（不依赖 Vite 构建后文件名）；生成中使用 pending 防重复而不额外 disabled，使焦点保留并可按 Escape 关闭。审核证据与未覆盖业务状态见 [交互审核](interaction-audit-v2.md)。

item 排版修订后重新通过以上检查，并在本机 Chrome 补验明暗 1440px 与 1024px：订阅实测定宽 240px、间距 12px、品牌 32px，套餐在服务商上方，费用 / 日期同行；工具图标 36px，名称 / 服务商在图标右侧，描述与分类按生产顺序排列。订阅操作在键盘焦点时可见，工具整卡 Enter / Space 均打开详情。1024px 工具仍为四列，订阅局部横滚且页面无横向溢出；三张截图已逐张目视复核。这些检查只验证当前示例，订阅可选字段与真实编辑 / 删除仍按页面规格待迁移。

## 视觉证据

截图位于 [`screenshots-v2/`](screenshots-v2/)，均为 1440×1100 窗口截图，文件名标注其他尺寸。长页面通过工作台滚动查看。

| 场景      | 浅色                                        | 深色                                       |
| --------- | ------------------------------------------- | ------------------------------------------ |
| Dashboard | [查看](screenshots-v2/dashboard-light.png)  | [查看](screenshots-v2/dashboard-dark.png)  |
| Writing   | [查看](screenshots-v2/writing-light.png)    | [查看](screenshots-v2/writing-dark.png)    |
| 编辑器    | [查看](screenshots-v2/editor-light.png)     | [查看](screenshots-v2/editor-dark.png)     |
| Video     | [查看](screenshots-v2/video-light.png)      | [查看](screenshots-v2/video-dark.png)      |
| Insights  | [查看](screenshots-v2/insights-light.png)   | [查看](screenshots-v2/insights-dark.png)   |
| AI Lab    | [查看](screenshots-v2/ai-lab-light.png)     | [查看](screenshots-v2/ai-lab-dark.png)     |
| Toolbox   | [查看](screenshots-v2/toolbox-light.png)    | [查看](screenshots-v2/toolbox-dark.png)    |
| Settings  | [查看](screenshots-v2/settings-light.png)   | [查看](screenshots-v2/settings-dark.png)   |
| 组件      | [查看](screenshots-v2/components-light.png) | [查看](screenshots-v2/components-dark.png) |

其他证据：[主色对比度提示与允许保存](screenshots-v2/settings-contrast-warning.png)、[预设配音](screenshots-v2/voiceover-preset-dark.png)、[克隆](screenshots-v2/voiceover-clone-dark.png)、[失败](screenshots-v2/voiceover-error-dark.png)、[缩放等效视口](screenshots-v2/voiceover-zoom-equivalent.png)、[1024px AI Lab](screenshots-v2/ai-lab-1024.png)、[加载](screenshots-v2/state-loading.png)、[空态](screenshots-v2/state-empty.png)、[错误](screenshots-v2/state-error.png)、[离线](screenshots-v2/state-offline.png)、[键盘焦点](screenshots-v2/components-keyboard-focus.png)。

item 修订特写：[浅色](screenshots-v2/ai-lab-items-light.png)、[深色](screenshots-v2/ai-lab-items-dark.png)、[1024px 窄窗口](screenshots-v2/ai-lab-items-1024.png)。

## 实际限制

- 独立设计稿使用内存数据，不验证真实账户、数据库、模型下载、降噪、音色导入、转写、播放或导出。
- 未运行生产 React19/Tailwind4 升级、完整 Electron 打包、拖拽标题栏、IME 或业务回归，不能据此宣称提案 A–F 完成。
- 720×550 是 1440×1100 在 200% 缩放下的 CSS 视口近似，不能替代 Electron 原生缩放、读屏、高对比和全量对比度审计。
- 组件工作台覆盖高频与高风险组件，不代表全部 58 类逐项完成。未更改的上游状态还需随生产页验收。
- Vite 对超过 500 kB 的设计工作台 JS chunk 给出非阻断体积提示；这是独立评审资产，不作为生产性能结论。
- CI 目前执行合同检查与构建；浏览器视觉检查通过 `pnpm design:verify` 本地运行。合同检查不证明生产全部代码符合规范。
