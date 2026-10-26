# 发布预览与 B 站多账号验证

日期：2026-10-26。此记录对应本轮初版；同日后续已按用户要求加入抖音和圆底播放按钮，最新范围与验证见 [抖音发布验证](video-workflow-douyin-publishing-verification.md)。

## 交互与兼容

- 封面保持 160×90 及原有信息顺序。播放入口使用 Heroicons outline PlayIcon，半透明白色三角、深色细描边和轻微阴影，无圆形底、双环或封面蒙层。按钮保留 40px 点击范围、名称、焦点和预览弹窗，关闭弹窗卸载播放器。
- 账号区通过可复用的 `BilibiliAccountsDialog` 管理新增扫码、重新登录、切换和解除绑定。显示昵称、UID 与当前账号标记；解除前明确确认。关闭弹窗继续扫码，取消扫码恢复此前连接。
- 重新登录核验原 UID，同 UID 重复添加合并为一个条目；账号排序保持稳定。上传、登录和账号核查期间阻止账号变更。账号选择在本机保存，解除当前账号后不自动切换其他账号。
- 历史投稿冻结原 UID，切换当前账号后仍使用原账号核查。原账号已解除时要求重新绑定，不使用其他账号代查；投稿记录保留。
- 原单账号目录 `config/publishing/catbus` 与别名 `mydashboard-bili` 保持兼容。新增账号各有独立 `CATBUS_HOME`，索引 `config/publishing/bilibili-accounts.json` 仅保存账号元数据与选择，不保存 cookie。已核实本机安装的 Catbus `dist/core/paths.js` 使用该环境变量，`dist/core/auth-store.js` 将凭据存到对应 home 的 auth 目录。
- 沿用已授权的 `VIDEO-WORKFLOW-001` React 18 / Radix 生产例外，复用 Button、WorkflowDialog 与项目主题；不改变桌面分栏、审核位置、断点或发布门禁。

## 验证记录

| 检查             | 结果与证据                                                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B 站服务集成测试 | 18/18：真实子进程与临时 SQLite，覆盖旧账号迁移、多账号持久化、独立登录、同 UID 合并、错误 UID、扫码取消、历史投稿原账号核查、解除绑定、并发锁定及原投稿门禁 |
| 工作流回归       | 56/56；`/tmp/bili-accounts-workflow.log`                                                                                                                    |
| Electron 界面    | 扫码关闭重开、双账号切换、解除确认、上传期间锁定、历史回执、抖音导出、断网待核查通过；预览加载真实短视频，Escape 关闭后媒体卸载且焦点返回                   |
| 主题与尺寸       | 浅深色、1440/1024 视口、200% 缩放、键盘操作和焦点返回通过；模拟高对比与减少动效。浅色、深色和复杂条纹封面均检查播放图标；未宣称完整 WCAG 认证               |
| 生产构建         | main/preload/renderer 构建通过                                                                                                                              |
| 设计资产         | `pnpm design:check`、`pnpm design:build` 通过，仅证明设计资产合同                                                                                           |
| 格式与 lint      | 修改范围 Prettier 检查通过；ESLint 通过，既有 `catbus.ts` 空 catch 使用 `allowEmptyCatch` 检查，未修改该存量代码                                            |
| 类型检查         | 全项目仍有 82 项既有诊断，变更文件没有新增诊断；不宣称全项目类型检查通过                                                                                    |

最终服务测试日志：`/tmp/bili-accounts-unit-final.log`。最终构建和界面测试日志：`/tmp/bili-accounts-ui-final.log`，其中 `Bilibili UI artifacts` 行给出截图目录；包含 `play-button-light.png`、`play-button-dark.png`、`play-button-busy.png` 和账号弹窗截图。设计与类型检查证据见 `/tmp/bili-accounts-design-check.log`、`/tmp/bili-accounts-design-build.log`、`/tmp/bili-accounts-types.log`。

macOS arm64 未签名打包通过（`/tmp/bili-accounts-package.log`），真实打包程序在隔离 userData 下完成旧账号恢复、新账号绑定、切换、保存并审核投稿设置、测试投稿回执核查与视频预览关闭；`/tmp/bili-accounts-packaged-ui.log` 记录 `PACKAGED_MULTI_ACCOUNT_OK`。不等同于签名分发包。

修正界面测试的运行环境选择：pnpm 独立安装模式的 `npm_node_execpath` 可能指向 pnpm 可执行文件，测试现通过 PATH 解析 Node，避免将 pnpm 用于执行测试 CLI；`pnpm test:bilibili-publishing:ui` 已完整通过。

测试使用隔离 userData、测试 CLI、虚构 UID 与 BV，没有使用真实账号扫码或真实投稿。真实平台登录、风控与接受投稿仍以实际使用为准。
