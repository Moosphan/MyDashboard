# 弹窗按钮焦点验证

日期：2026-10-26。用户要求统一优化应用中弹窗按钮的方形聚焦边框。

## 原因与修正

共享 `components/ui/button.tsx` 使用 `focus:ring-2 focus:ring-primary/20`，鼠标打开 Radix 弹窗时，自动聚焦的首个按钮同样产生边框。ghost 图标按钮没有默认圆角，因而呈现浅紫色方框；键盘聚焦时还可能与工作流的 outline 叠加。

共享 Button 改用单一 `focus-visible` 主题色 2px outline，图标尺寸默认圆形，保留原点击范围及调用方的显式形状。工作流按钮继续沿用原有轮廓间距，不改变内容布局和操作位置。

Electron/macOS 下，从键盘操作返回同一个触发器后再用鼠标打开，原生 `:focus-visible` 可能沿脚本自动聚焦继承。`App.tsx` 以捕获阶段的 pointerdown / keydown 记录当前输入方式，`globals.css` 仅在指针模式下抑制按钮的 outline。监听在卸载时清理，覆盖 portal；不 blur 元素、不阻止自动聚焦、不改变焦点限制或返回。输入框、文本域和其他编辑控件不在该指针规则内。

本次收敛存量 React 18 / Tailwind 3 公共控件，不新增依赖，迁移边界沿用 `LEGACY-UI-001`；HeroUI 迁移后交由上游公开焦点行为接管。

## 验证

- 回归先失败：`/tmp/dialog-focus-red.log` 确认鼠标打开预览时关闭按钮带 20% 主色 box-shadow。
- `pnpm test:bilibili-publishing:ui` 中扩展真实 Electron 指针/键盘测试：鼠标打开预览、键盘打开、键盘后重新用鼠标打开、鼠标关闭后焦点返回、单一圆形轮廓、Escape、Tab 焦点限制。最终完整运行：`/tmp/dialog-focus-ui-final.log`，退出码 0。
- 同一次运行覆盖 B 站/抖音账号、审核弹窗及工具箱管理弹窗；明暗主题、1440/1024 宽、200% 缩放、高对比和 reduced-motion；发布、账号切换、媒体卸载和状态核查原有场景继续通过。所有操作使用隔离数据库和模拟投稿。
- 截图目录：`/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/bilibili-ui-HkdUxv`。人工查看预览鼠标浅色、键盘深色和工具箱浅色 1024 截图，关闭按钮无方框，键盘提示为圆形。
- `pnpm design:check`、`pnpm design:build`、`pnpm build` 通过；日志分别为 `/tmp/dialog-focus-design-check.log`、`/tmp/dialog-focus-design-build.log`、`/tmp/dialog-focus-green.log` 中的构建阶段。
- 共享 Button / UI 测试脚本 Prettier 检查通过；`App.tsx` / Button 的 ESLint 检查通过。日志为 `/tmp/dialog-focus-format.log`、`/tmp/dialog-focus-lint.log`。
- `tsc --noEmit -p tsconfig.web.json` 仍有 52 项存量诊断；`tsc -b --pretty false` 仍有 82 项，输出与修改前 `/tmp/douyin-types-final.log` 完全相同。未宣称全项目类型检查通过。
- macOS arm64 本地未签名打包完成：`/tmp/dialog-focus-package.log`。以隔离 userData 启动真实 `app.isPackaged=true` 应用，通过鼠标/键盘切换、焦点返回、明暗主题及高对比检查：`/tmp/dialog-focus-packaged-ui.log`，输出 `PACKAGED_DIALOG_FOCUS_OK`。

本次验证针对公共按钮及上述代表弹窗，不代表所有存量业务控件已完成 HeroUI 迁移。
