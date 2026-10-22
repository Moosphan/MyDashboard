# HeroUI 官方一手调研

调研日期：2026-10-22（Asia/Shanghai）。本文件仅记录版本事实、适配边界与来源，不表示已完成安装或项目兼容验证。研究过程只读取官方网页、源码和 npm 包；没有安装依赖、修改生产代码。

## 结论

HeroUI 可以作为 MyDashboard 的通用交互组件基础库；推荐以当前稳定版 **`@heroui/react@3.2.6` + `@heroui/styles@3.2.6`** 为迁移目标。它不是只能运行在 Next.js 中的库，官方提供 Vite 示例。当前项目 React 18.3 / Tailwind 3.4 **不满足 v3 的依赖要求**，需要先完成 React 19 与 Tailwind 4 升级、旧主题变量与 CSS 冲突处理，再逐页迁移。[S1][S3][S4]

不要基于旧版 HeroUI v2 的安装示例引入 `HeroUIProvider`、`heroui()` Tailwind 插件或强制添加 Framer Motion：这些不是 v3 的接入要求。[S5]

## 版本事实：以 npm 实际响应为准

2026-10-22 直接查询 npm registry：

| 包               | 当前事实                                                                                    | 对项目的含义                                                 |
| ---------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `@heroui/react`  | `latest=3.2.6`；`alpha=3.0.0-beta.2`；`rc=3.0.0-rc.1`；`canary=0.0.0-canary-20260306161133` | v3 已稳定；不能因为旧 alpha/rc 标签存在就称整个 v3 仍为 beta |
| `@heroui/styles` | `latest=3.2.6`                                                                              | 与 React 包固定同版本                                        |
| `@heroui/theme`  | `latest=2.4.26`                                                                             | 属于 v2 包体系；不能拿这个包版本判断 v3 版本                 |
| GitHub 默认分支  | `v3`；研究时 HEAD `d814c204a92464ca02eb229c384a4a982d1ab398`                                | 默认分支、旧 `main`、旧 v2 文档和 npm 标签必须区分           |

来源：[S1][S2][S6]。GitHub 仓库根目录的 Node/pnpm 引擎与版本是维护仓库的开发环境信息，不能直接当成使用组件库的运行要求。

### v3.2.6 精确依赖

`@heroui/react@3.2.6` 的 npm `peerDependencies`：[S1]

```json
{
  "react": ">=19.0.0",
  "react-dom": ">=19.0.0",
  "tailwindcss": ">=4.0.0",
  "react-aria": "^3.52.1",
  "react-aria-components": "^1.21.1",
  "@react-aria/ssr": "^3.10.1",
  "@react-aria/utils": "^3.34.1",
  "@internationalized/date": "^3.12.4"
}
```

`@heroui/styles@3.2.6` 的 Tailwind peer 同样为 `>=4.0.0`；其依赖包含 `tw-animate-css@1.4.0` 和 `tailwind-variants@3.3.1`。v3 内置动画以 CSS 和状态属性实现，不要求额外安装 Framer Motion；业务自己的 Framer Motion 需求另行处理。[S2][S7]

### v2 能否避免升级

| 精确版本               | React peer | 固定 theme 依赖        | theme 的 Tailwind peer | 判断                                      |
| ---------------------- | ---------- | ---------------------- | ---------------------- | ----------------------------------------- | --------- | ------------------------------------------------- |
| `@heroui/react@2.7.11` | `>=18      |                        | >=19.0.0-rc.0`         | `@heroui/theme@2.4.17`                    | `>=3.4.0` | peer 层面可配当前 React18/TW3；还需 Framer Motion |
| `@heroui/react@2.8.5`  | 同上       | `@heroui/theme@2.4.23` | `>=4.0.0`              | 不能作为保持 Tailwind3 的方案             |
| `@heroui/react@2.8.10` | 同上       | `@heroui/theme@2.4.26` | `>=4.0.0`              | v2 最后稳定版本也不等于支持现有 Tailwind3 |

上述 v2 的 Framer Motion peer 为 `>=11.5.6 || >=12.0.0-alpha.1`。[S8] 因此 v2.7.11 是一个可研究的短期兼容入口，但会引入旧主题体系与未来再次迁移的成本，不推荐作为新的长期基础。未运行安装/构建，peer 满足不代表所有现有业务依赖已经验证兼容。

## 接入方式与桌面适配

官方 v3 Quick Start 明确无需 `HeroUIProvider`；主 CSS 依次导入：[S3]

```css
@import 'tailwindcss';
@import '@heroui/styles';
```

不需要为了 HeroUI 改成 Next.js。官方 Frameworks 页明确提供 Vite 示例，也说明纯样式包可供非 React/纯 HTML 使用，但纯 CSS 不提供焦点管理、键盘交互和 ARIA 行为，不能把纯 HTML 仿制品当成实际交互验收。[S4]

**Electron 判断属于架构推断**：HeroUI 是 React DOM/浏览器组件，官方没有列出禁止 Electron renderer 的限制；现有 Vite renderer 具备合理的接入基础。但本次未查到官方 Electron 专门支持承诺，也没有执行 Electron 试点。仍需在实际 Electron 中检查 Portal、焦点回收、Escape、拖拽区、滚动容器、IME、缩放和 CSP。组件库不会替代 Electron 主进程、IPC、原生文件选择、窗口管理。

## 默认主题与桌面适配

HeroUI v3 使用语义 CSS 变量、BEM 类与 Tailwind4 theme bridge，可统一覆盖颜色、字号、圆角、边框和组件槽位，而不必复制组件内部实现。[S9][S10]

关键变量包括 `--accent` / `--accent-foreground`、`--background` / `--foreground`、`--surface`、`--overlay`、`--muted`、`--border`、`--separator`、`--focus`、`--field-background`、`--field-border`、`--field-radius`、`--radius`。明暗主题可通过 `.light` / `.dark` 或 `data-theme` 驱动，既有项目主题状态可以保留；无需仅为切主题引入 Next.js 专用方案。[S9]

**沿用上游默认形状。** 源码中按钮默认 `rounded-3xl`，共享半径映射里 `--radius-3xl = 3 × --radius`；`--radius` 默认是8px，因此按钮实际圆角约24px，字段等组件另有自己的默认映射。按最新用户决策保留这些组件差异，不覆盖 `.button` / `.toggle-button` 或 `--field-radius` 来满足旧8px要求，也不把所有组件强制成同一种圆角。[S10][S11]

按钮源码桌面断点下尺寸：sm 32px、md 36px、lg 40px；基础移动尺寸分别 36/40/44px。默认正文 `text-sm font-medium`；图标桌面约 16px。项目沿用该尺寸梯度、默认字体角色和主题；已有用户主题设置仅做必要兼容，不额外强制紫色或紧凑外观，不需要改变现有页面布局。[S11]

注意 v3 `@theme inline` 会导出 `--color-surface`、`--color-background` 等完整 CSS 颜色变量。现有项目如果将同名变量保存为 RGB 三元组，直接覆盖会有语义冲突；必须按实际项目审计结果迁移旧变量和 utility，不能直接粘贴主题覆盖。[S10]

## 组件覆盖与缺口

以下按 `v3` 分支该 HEAD 的组件导出表和官方 migration 状态表核验，不依赖早期 alpha 的组件清单。[S5][S12]

| 类别                | 已有组件/能力                                                                                                                 | 边界                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 基础操作            | Button、ButtonGroup、ToggleButton、ToggleButtonGroup、CloseButton、Link、Toolbar                                              | 沿用上游默认尺寸、圆角与公开变体                                        |
| 输入                | Input、TextField、TextArea、SearchField、InputGroup、NumberField、InputOTP、Label、Description、FieldError、Form、Fieldset    | 文案、校验规则和业务数据仍由项目负责                                    |
| 选择                | Checkbox/Group、Radio/Group、Switch/Group、Select、ComboBox、Autocomplete、Slider、ListBox                                    | 应使用完整 React 组件，不能只换原生控件 CSS                             |
| 时间/颜色           | Calendar、RangeCalendar、DateField、DatePicker、DateRangePicker、TimeField；ColorPicker/Area/Field/Slider/Swatch/SwatchPicker | `calendar-year-picker` 源码仍标注 in progress，不擅自宣传为稳定独立组件 |
| 容器/浮层           | Card、Surface、Tabs、Accordion、Disclosure、Modal、AlertDialog、Drawer、Popover、Tooltip、Dropdown、Menu                      | 保留现有面板结构；浮层需桌面回归                                        |
| 数据/反馈           | Table、Pagination、Toast、Alert、ProgressBar/Circle、Meter、Skeleton、Spinner、EmptyState、Badge、Chip、Tag/Group             | Table 已可用，不能沿用旧资料说 v3 没有 Table                            |
| 其他                | Avatar/Group、Breadcrumbs、Separator、ScrollShadow、Kbd、Typography                                                           | 图标体系与品牌 logo 仍需项目统一                                        |
| 仍由项目/领域库负责 | 应用侧栏、窗口标题栏、视频时间线、波形播放器、富文本编辑器、代码编辑器、图表、拖拽排序、文件上传业务                          | 不为替换组件而重写业务能力；保留现有 Tiptap/dnd-kit 等                  |
| 树形控件            | 未发现 HeroUI 完整 `Tree` 组件的导出                                                                                          | 不把 React Aria 的底层 Tree 能力误写为 HeroUI 已提供设计完成的 Tree     |

### “避免原生默认组件”的准确边界

HeroUI Select 的视觉层通过 React Aria `Select`、`Popover` 和集合组件组合，并不是浏览器默认 `<select>` 弹窗换皮。[S13] 其底层 React Aria 仍会输出 `HiddenSelect`，用于表单/自动填充等语义兼容；Checkbox 等控件也可能保留原生 input 参与可访问性。这些隐藏语义节点应保留。要求应写成“用户可见控件与菜单统一使用组件库视觉”，而不是禁止 DOM 出现 input/select。文件选择系统对话框、操作系统权限提示也不属于组件库可替换的界面。

## 许可证与 Pro 边界

**v3.2.6 的 npm 发布包实际 `package/LICENSE` 为 Apache License 2.0**。直接下载 registry `dist.tarball` 并在内存中读取确认；官方 Introduction、v3 仓库 LICENSE 也明确为 Apache2。[S1][S14][S15]

研究时该包 `package.json` 与 npm registry 的 `license` 字段仍是 `MIT`，与实际 LICENSE 不一致，不能只根据 npm 元数据把 v3 宣传成 MIT。工程采用 Apache2 的实际发布许可文件和官方说明作为记录依据，保留许可证及适用归属声明；若后续供应链扫描要求元数据完全一致，再追踪上游修正。Apache2 允许商用，不要求业务代码公开。

**HeroUI Pro 是另外的商业产品**：官方 Pro 站点说明包含付费高级组件、模板、设计系统与支持，且 Pro 可复制组件源码不能公开再分发。MyDashboard 通用组件迁移只依赖开源 `@heroui/react` / `@heroui/styles`，不以购买 Pro 为前置条件，也不复制 Pro 页面或源码。[S16]

## 一手来源

- [S1] [npm @heroui/react 元数据](https://registry.npmjs.org/@heroui%2freact)、[3.2.6 精确发布元数据及 tarball 地址](https://registry.npmjs.org/@heroui%2freact/3.2.6)。dist-tags 和 peer 以当日实际响应为准；许可证检查读取该响应指向的发布 tarball。
- [S2] [npm @heroui/styles](https://registry.npmjs.org/@heroui%2fstyles)、[npm @heroui/theme](https://registry.npmjs.org/@heroui%2ftheme)。
- [S3] [Quick Start](https://www.heroui.com/docs/react/getting-started/quick-start)、[研究时源码](https://github.com/heroui-inc/heroui/blob/d814c204a92464ca02eb229c384a4a982d1ab398/apps/docs/content/docs/en/react/getting-started/%28overview%29/quick-start.mdx)。
- [S4] [Frameworks：含 Vite、纯 HTML/CSS 的能力边界](https://www.heroui.com/docs/react/getting-started/frameworks)。
- [S5] [v2 → v3 官方迁移总览](https://www.heroui.com/docs/react/migration)、[研究时源码](https://github.com/heroui-inc/heroui/blob/d814c204a92464ca02eb229c384a4a982d1ab398/apps/docs/content/docs/en/react/migration/index.mdx)。
- [S6] [GitHub 仓库 API](https://api.github.com/repos/heroui-inc/heroui)、[v3 分支 API](https://api.github.com/repos/heroui-inc/heroui/branches/v3)。
- [S7] [Animation](https://www.heroui.com/docs/react/getting-started/animation)。
- [S8] [2.7.11](https://registry.npmjs.org/@heroui%2freact/2.7.11)、[theme2.4.17](https://registry.npmjs.org/@heroui%2ftheme/2.4.17)、[2.8.5](https://registry.npmjs.org/@heroui%2freact/2.8.5)、[theme2.4.23](https://registry.npmjs.org/@heroui%2ftheme/2.4.23)、[2.8.10](https://registry.npmjs.org/@heroui%2freact/2.8.10)。
- [S9] [Theming](https://www.heroui.com/docs/react/getting-started/theming)、[默认变量源码](https://github.com/heroui-inc/heroui/blob/d814c204a92464ca02eb229c384a4a982d1ab398/packages/styles/themes/default/variables.css)。
- [S10] [共享主题 bridge 与 radius 映射](https://github.com/heroui-inc/heroui/blob/d814c204a92464ca02eb229c384a4a982d1ab398/packages/styles/themes/shared/theme.css)。
- [S11] [Button CSS](https://github.com/heroui-inc/heroui/blob/d814c204a92464ca02eb229c384a4a982d1ab398/packages/styles/components/button.css)。
- [S12] [组件实际导出表](https://github.com/heroui-inc/heroui/blob/d814c204a92464ca02eb229c384a4a982d1ab398/packages/react/src/components/index.ts)。
- [S13] [Select 源码](https://github.com/heroui-inc/heroui/blob/d814c204a92464ca02eb229c384a4a982d1ab398/packages/react/src/components/select/select.tsx)、[React Aria Components1.21.1发布元数据](https://registry.npmjs.org/react-aria-components/1.21.1)。后者 tarball 的 `dist/private/Select.mjs` 可见 `HiddenSelect` 使用。
- [S14] [Introduction：免费、Apache2、production-ready](https://www.heroui.com/docs/react/getting-started)。
- [S15] [研究时仓库 LICENSE](https://github.com/heroui-inc/heroui/blob/d814c204a92464ca02eb229c384a4a982d1ab398/LICENSE)、[v3.0.3 release：Apache2变更](https://www.heroui.com/docs/react/releases/v3-0-3)。
- [S16] [HeroUI Pro 官网与许可 FAQ](https://www.heroui.pro/)。

研究限制：没有执行依赖升级、打包、可访问性测试或 Electron 视觉回归；上述“可用”指技术与许可可行，最终工程接受条件须由迁移试点验证。官方网页与 dist-tags 可能继续变化，实际实施以此处固定版本和当时再次读取的官方文档共同核验。
