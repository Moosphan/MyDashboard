# 外部成品视频导入验证

日期：2026-10-29。授权依据：用户要求在新建视频项目窗口加入折叠导入栏，将外部制作的成品视频直接导入平台发布页，后续流程保持一致。

## 实现与边界

- 新建弹窗默认收起导入栏，包含本地 MP4 选择、文件名、取消选择与可选内容说明；保留名称、底部动作、主题、原有两栏及列表信息顺序。沿用 `VIDEO-WORKFLOW-001` 的 React 18/Radix 局部例外和已有控件，无新依赖或全局样式。
- FFprobe 检测 MP4/H.264、可选 AAC、实际尺寸/旋转及最长 300 秒时长，文件限制 1 GiB；复制原视频到受管目录，不重新渲染，FFmpeg 抽帧作为默认封面。无音轨、竖版和方形视频可导入。不自动识别视频内容，也不承诺任意编码或 MOV/WebM 支持。
- 仅创建已接受的成片版本与待审核发布资料，不伪造简报、文案、分镜或音频。导入项目发布依赖绑定其成片；正常项目继续要求原有前置审核。禁止把导入成片用于前置生成或普通保存伪造成片。
- 进入现有发布页后可预览、手填/AI 生成资料、生成封面、审核、导出和调用两平台投稿。AI 只根据用户内容说明与已有资料创作；导出未提供独立字幕时明确说明，视频内原有字幕保留。
- 请求 ID 持久化、服务内并发去重及提交锁防止双击重复创建；另开一次新建窗口允许再次导入同一文件。失败保留表单并清理本次新建项目及受管文件，应用退出会终止导入进程并等待清理。

## 状态和交互

| 场景 | 验证结果 |
| --- | --- |
| 初始/系统选择取消 | 默认收起；取消选择器不创建项目、不覆盖既有选择 |
| 文件错误 | 真实无效 MP4 导入失败，错误留在弹窗，名称和说明保留 |
| 导入中 | 主动作显示导入状态，禁止重复提交、选文件及关闭 |
| 导入成功 | 直接进入发布页，只显示适用发布步骤、实际尺寸/时长/文件来源 |
| 发布资料 | 修改、保存、审核、导出门禁正常；未连接账号不能投稿 |
| 预览/重开 | 原视频可解码播放；Escape 关闭卸载媒体并返回焦点；重新打开项目仍进入发布 |
| 普通创建 | 取消导入选择后按 Enter 提交，仍创建原有八步创作项目 |
| 键盘/显示 | Space 展开；Tab/Shift+Tab 焦点留在弹窗；Enter 提交；Escape 关闭并返回入口焦点；明暗、1440/1024、200% 缩放、高对比及 reduced-motion 已检查 |

## 自动验证

- 红灯：新增导入测试在实现前因缺少 `importFinishedVideo` 失败；Electron 测试因缺少折叠导入栏失败。
- `ELECTRON_RUN_AS_NODE=1 pnpm exec electron --import tsx --test scripts/test-import-finished-video.ts`：4/4，通过真实 FFmpeg 生成的竖版和方形素材验证原始字节、封面、规格、审核/导出、并发去重、服务重建恢复、损坏/过大/不支持编码/符号链接、写入后故障清理，以及两平台冻结投稿快照。投稿使用本地 CLI fixture，无网络投稿。
- `pnpm exec electron scripts/test-import-finished-video-ui.cjs`：`IMPORT_VIDEO_UI_OK`，真实 Electron、隔离临时 profile、真实 IPC，只替换系统文件选择器。覆盖双击、刻意再次导入、普通创建、发布资料审核、播放、焦点及显示状态。
- `pnpm test:video-workflow`：74/74；`pnpm test:bilibili-publishing`：29/29。
- `pnpm build`、本次受影响 TypeScript 文件 ESLint、Prettier、`git diff --check`、`pnpm design:check`、`pnpm design:build` 通过。
- 截图目录：`/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/import-video-ui-jlEJL9`。包含 `import-{light,dark}-{1440,1024}.png`、`import-200percent.png`、`import-high-contrast-reduced-motion.png`、`import-publish-ready.png`；已人工查看导入、发布与高对比截图。

## 未解决基线与验收范围

- 全量类型检查已运行：web 52 项、构建类型检查 82 项既有错误，涉及 MainLayout、HTMLWebViewElement、已有 repository 类型约束和缺少 `@swc/core` 等；输出没有本次变更模块错误，不宣称仓库全量类型通过。
- 另运行原有 `test-bilibili-publishing-ui.cjs`，在既有预览弹窗关闭按钮的焦点轮廓颜色断言（159 行，实际透明）失败。该按钮、焦点样式和对应测试本次未修改；新增导入 UI 测试的预览、Escape、焦点返回及业务断言通过，未把原脚本标为通过。
- 使用真实 Electron 加载构建产物验证，未重新生成安装包；高对比媒体模拟不等于完整 WCAG 审核。未使用用户账号真实投稿，测试数据均位于独立临时目录。
- 重启前只读确认生产数据库没有运行中的配音、工作流或投稿任务；`pnpm dev:launchd` 成功，2026-10-29 10:48（Asia/Shanghai）日志确认 `window:ready-to-show`，应用已加载此次实现。

## 同日补充：直接输入视频路径

- 在选择器按钮后复用现有 Input，路径值与选择器互相同步，提交前移除外围空白和一组成对引号；保持原本后端的绝对路径、普通文件、格式及媒体校验，不经过 shell 执行路径。失焦时仅为空项目名补入文件名，导入期间禁用。
- 扩展原 Electron 测试：先因缺少路径输入而失败，再通过直接输入无效文件保留错误/资料、带空白和引号的实际 MP4 成功导入、选择器覆盖路径与取消保留、清空恢复普通创建和空名称补全。最终 `IMPORT_VIDEO_UI_OK`、退出码 0。
- 明暗 1440/1024、200% 缩放、Tab/Shift+Tab/Space/Enter/Escape、焦点返回及高对比/reduced-motion 均沿原测试重新验证，截图目录为 `/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/import-video-ui-9RSm2f`。已查看明亮/暗色与缩放截图，底部动作可达，长路径由输入框内部滚动。
- `pnpm build`、`pnpm design:check`、`pnpm design:build`、受影响 renderer ESLint、Prettier 与差异空白检查通过。没有修改后端或依赖；上节全量类型和旧预览焦点检查的范围及未解决项仍适用。

## 同日补充：输入框外观

- 按用户最新截图，将项目名和路径框复用为内容说明既有的 `voiceover-field`：边框、4px 圆角、透明背景、明暗与焦点一致，单行采用原有 40px 高度；没有改变共享 Input 或增加全局规则。移除可见路径标题，保留 `aria-label="视频文件路径"`；按钮与输入区域间距从 8px 改为 16px。
- 原 Electron 导入全流程重新通过，`IMPORT_VIDEO_UI_OK`、退出码 0；构建、受影响 renderer ESLint/Prettier、设计检查与设计构建通过。未为纯外观修改新增测试；原测试继续验证键盘、选择器/路径切换、错误保留、导入和发布审核。
- 最新截图：`/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/import-video-ui-IFI5SG`。已查看明亮 1440、暗色 1024 和 200% 缩放截图；名称、路径与说明边界一致，无可见路径标题，间距增加，底部动作及滚动可达。高对比/reduced-motion 仍由原脚本覆盖。
- 开发应用日志确认 10:58 的 `WorkflowStudio.tsx` HMR，正在运行的界面已更新；没有重启或中断用户任务。
