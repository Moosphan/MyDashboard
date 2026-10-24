# B 站一键发布

日期：2026-10-24；分支：`feature/video_studio_workflow`。实现位于现有视频工作流分支。

## 使用

一次性安装兼容的外部 Node 和固定版本 Catbus。Electron 内置 Node 不用于运行 Catbus。以 nvm 为例：

```sh
nvm install 24.15.0
nvm use 24.15.0
npm install -g catbus-cli@0.2.1
node -p 'process.execPath'
command -v catbus
```

打开视频工作流的“执行环境”，填入上述 Node 与 Catbus 的绝对路径，保存并检测。也可直接填写 Catbus 的 `dist/cli/main.js`。兼容范围为 Node `^22.22.2 || ^24.15.0 || >=26.0.0`，应用严格检查 CLI 版本为 `0.2.1`。

1. 完成原有流程，审核通过正式成片与发布资料；B 站至少填写一个标签。
2. 平台发布页选择 Bilibili，点击“扫码连接 B 站”，用哔哩哔哩 App 扫码并确认；页面展示实际账户昵称与 UID。
3. 明确选择投稿子分区、公开或仅自己可见、自制或转载。转载必须提供来源。设置按项目保存在本机，首次不预选。
4. 点击“一键发布到 B 站”。应用直接上传已审核视频、封面、标题、简介和标签，后台保存真实 BV 回执，无需人工上传。
5. 提交完成显示“平台审核中”。点击“核查平台状态”读取审核结果；“打开作品”仅打开回执对应的 B 站 HTTPS 作品链接。

首次连接与登录过期时仍需本人扫码。平台验证或风控会停止任务并提示处理。网络或应用中断后若无法确认是否提交，不自动重传：先核查创作中心，已有稿件时填入 BV 号绑定并核查；确定没有稿件时，使用带确认弹窗的“确认平台没有此稿件”后再手动重试。

## 实现与数据

- 固定使用 [Catbus CLI 0.2.1](https://github.com/cv-cat/catbus)，调研源码提交 `0a6e705f95d991ac3cdc896b774570479a23c0ad`。适配 `auth status/login`、`item categories/publish/list` 的 JSON 信封。
- 保留平台选择 → 共用成片 → 当前平台资料顺序、审核侧栏和底部动作。资料后增加 B 站账号、设置、投稿与回执；原人工导出和链接回填继续可用，抖音仍沿用原流程。
- 复用 VIDEO-WORKFLOW-001 批准的 React 18、Button、Voice 字段和 Radix WorkflowDialog；没有引入新的 UI 库、图标或全局样式。
- SQLite migration 38 单独持久保存投稿记录，冻结已审核版本、文件指纹、账号 UID、发布资料与设置。发送前重新核实审核、文件和实际登录账号；后续编辑不会改变旧投稿快照。成功不写成原人工发布记录，也不改动创作版本历史。
- 按请求 ID 与投稿快照防重复，数据库限制同时一个 B 站上传任务。相同投稿的重复点击返回已有回执；相同视频与账号存在结果不明/风控记录时，改变投稿设置也不能绕过核查。
- 上传开始后的进程取消、超时、断网、非法回执和应用退出保留为“待核查”。尚未开始的任务可取消；不自动删除平台稿件。准确 BV 核查还校验账号；人工补绑 BV 额外核对标题。查询限定最近 200 条，找不到时保留原记录。
- 凭据在应用 userData 下 `config/publishing/catbus`，独立别名 `mydashboard-bili`；不读取其他 Catbus 账号，断开时删除此隔离目录。现有备份只包含数据库与内容目录，不包含该凭据目录。投稿历史会进入数据库备份。
- CLI 使用参数数组与 `shell: false`；不保存原始 stderr、cookie 或平台原始错误。简介写入权限受限的临时文本文件，提交结束后清理，防止简介以 `@` 开头时被 CLI 当作任意文件引用。

## 验证

| 项目 | 结果 |
| --- | --- |
| `pnpm test:bilibili-publishing` | 14/14 通过：真实子进程、临时 SQLite、审核门禁、冻结输入、参数/账号/文件检查、幂等、取消、风控确认、未知结果、准确 BV、私密/转载、退出恢复与扫码取消 |
| `pnpm test:video-workflow` | 53/53 通过，原生成、版本、文件与导出流程回归 |
| `pnpm build` | main/preload/renderer 生产构建通过 |
| 实际 npm 发布包 | 隔离 `CATBUS_HOME` 下通过 `npm exec` 运行真实 `catbus-cli@0.2.1` / Node `24.15.0`，`version -o json` 返回符合适配器要求的成功信封；没有登录或上传 |
| `pnpm design:check` / `pnpm design:build` | 通过；仅证明设计资产合同 |
| `tsc --noEmit -p tsconfig.web.json` | 仍有原有错误，新增工作流代码无诊断 |
| `tsc -b --pretty false` | 82 项诊断，与临时导出 HEAD 的基线完全相同，仅规范化依赖路径前缀后逐字比对 |
| `pnpm exec electron scripts/test-bilibili-publishing-ui.cjs` | 真实 Electron、隔离 userData、测试 CLI：扫码、必填门禁、键盘下拉、双击防重、作品链接 IPC、回执/审核核查、跨平台设置恢复、抖音保留、断网待核查、确认弹窗/Escape/焦点返回通过 |
| 主题/视口 | 浅深色 1440、深色 1024、200% 缩放截图与无页面横向溢出断言通过；保留原桌面布局 |
| macOS arm64 打包 | `electron-builder --mac --dir`，关闭签名，打包成功；真实打包程序 `app.isPackaged=true`、隔离配置、私密投稿回执与核查通过 |
| 高对比/减少动效 | 打包程序中模拟 `forced-colors: active` / `prefers-reduced-motion: reduce`，媒体查询、键盘焦点与截图检查通过；未宣称完整 WCAG 认证 |

测试使用明确的测试 CLI 与虚构 BV，不使用真实用户账号，不进行真实平台投稿。打包验证未签名，不等同于发布分发包。实际 B 站接受视频、平台审核、账号风控与长期接口兼容性仍需首次真实使用验证。

当前 Catbus 适配范围不含字幕文件单独上传和定时发布；已烧录在成片里的字幕会随视频上传。本机原默认 Node `24.13.0` 不满足 Catbus 要求，使用前必须配置兼容版本。

日志：`/tmp/bilibili-tests.log`、`/tmp/bilibili-workflow-regression.log`、`/tmp/bilibili-build.log`、`/tmp/bilibili-design-check.log`、`/tmp/bilibili-design-build.log`、`/tmp/bilibili-web-types.log`、`/tmp/bilibili-all-types.log`、`/tmp/bilibili-baseline-types.log`、`/tmp/bilibili-ui.log`、`/tmp/bilibili-package.log`、`/tmp/bilibili-packaged-ui.log`、`/tmp/bilibili-real-cli.log`。

截图见本目录 `video-workflow-production/bilibili-*.png`。完整界面测试产物目录由 `/tmp/bilibili-ui.log` 首行记录；打包程序证据目录见 `/tmp/bilibili-packaged-ui.log`。
