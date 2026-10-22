# UI 2.0 真实组件设计稿

基线：HeroUI React / Styles **3.2.6**，React 19，Tailwind 4。独立依赖和锁文件，不影响生产 React 18 / Tailwind 3。颜色经 project-theme.mjs 读取现有主题与默认主色算法；形状、尺寸和交互沿用发布包。自带图标优先，缺项使用已确认的 Heroicons 2.2.0 outline。CSS 保留现有桌面布局与紧凑业务内容。

根目录：

```bash
pnpm --dir docs/design-system/v2 install --frozen-lockfile
pnpm design:preview
```

访问 `http://127.0.0.1:3046/`。侧栏切换 7 个页面与组件工作台，Writing 进入文章编辑稿，Video 进入 AI Voiceover。顶部评审栏切换默认 / 加载 / 空 / 失败 / 离线，以及浅色 / 深色 / 跟随系统。评审状态保存在 URL，数据只保存在内存。

- AI Lab：`?page=ai-lab&theme=light&state=ready`
- Voiceover：`?page=video&theme=dark&state=ready&dialog=voiceover`
- 失败配音：`?page=video&theme=light&state=error&dialog=voiceover`
- 组件：`?page=components&theme=dark&state=ready`

订阅仅为简化交互演示，不替代生产完整字段和空值规则；关闭即丢弃未保存修改。Settings 可预览自选主色，对比度不足时提示但允许保存，仅保存在内存。配音仅模拟任务、取消与重试。任务和主要输入关闭 / 重开、切页时保留，刷新清除。音色、模型、导入、试听、导出和生产持久化待正式迁移。全部状态与待决项见 [交互审核](../interaction-audit-v2.md)。

```bash
pnpm design:check
pnpm design:build
pnpm design:verify
```

自动化视觉 / 交互检查使用本机 Chrome（Playwright `channel: chrome`），验证结果与截图见 [验证记录](../verification-v2.md)。无 Chrome 的环境可用 `pnpm exec playwright install chromium` 并设置 `DESIGN_BROWSER=chromium`。静态构建后 `pnpm --dir docs/design-system/v2 preview` 可预览，资源全部本地化。

必须同时阅读 [规范 2.0](../spec-v2.md) 与 [页面规格](../page-specs-v2.md)。此工作台是可执行设计资产，不是生产功能完整实现或 Electron 兼容性结论。
