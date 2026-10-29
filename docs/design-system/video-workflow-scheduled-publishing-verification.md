# 应用内定时发布验证

日期：2026-10-29。授权依据：用户要求在发布页增加自动定时发布折叠块，并明确选择“应用运行时到点投稿；关机或休眠错过则标已错过，由用户重新安排”。

## 实现与边界

- B 站、抖音共用原投稿引擎和真实回执。每个平台原一键发布按钮后增加默认收起的定时块，时间字段使用本机时区，未来 1 分钟至 30 天；确认弹窗列出平台、UID/账号标识、标题、成片/发布版本及时间。原立即投稿、审核、导出和封面布局保持原顺序。
- 计划保存于既有 SQLite 投稿记录 JSON，新增 `scheduled` / `missed` 状态及 `scheduledAt`，无需表结构迁移。冻结原账号、媒体校验和、封面、投稿设置及审核版本；到点原子认领为 queued，再复用原文件/账号/版本检查和投稿流程。
- 应用启动恢复未到期计划，无需打开视频页；每 15 秒检查一次。启动时已过期、休眠期间到期的计划标“已错过”，不补发。正常运行时平台操作占用可排队最多 5 分钟，超时也标已错过。此时间是开始上传投稿时间，非保证公开时间。
- 等待计划可取消后重新安排；切换当前账号不改变计划目标，解绑原账号则执行失败。修改审核版本、归档、文件损坏/丢失时停止；失败或结果不明不自动重试。取消恰好碰上已开始上传时保留 unknown 和平台核查提示，不误报取消成功。
- 创建计划的成功提示必须匹配实际返回的 scheduled 状态和时间；已投稿内容被幂等合并时保留弹窗并解释原因，不误报计划已保存。账号索引损坏时允许应用启动，通过工作流 IPC 报配置错误，并清理部分构建服务的定时器。
- 使用既有 `VIDEO-WORKFLOW-001` React 18/Radix/Voice 控件局部兼容边界，无新依赖、图标、主题或全局样式；本次不宣称完成 HeroUI 生产迁移或完整 WCAG 审计。

## 验证结果

| 场景                 | 结果                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 默认折叠、输入和门禁 | 默认收起，Space 展开；空/无效时间禁止设置；保存审核、有效账号和投稿设置仍为前置条件                                |
| 确认/取消            | 确认列出账号/版本/时间；Escape 返回设置按钮；保存后可取消，持久记录为 cancelled                                    |
| 到点和恢复           | 两平台到点前无上传，到点仅提交一次；重复 tick/请求幂等；重建服务保留未来计划                                       |
| 错过时间             | 重启过期、系统 suspend/resume 错过、运行中延迟超时均为 missed，不上传                                              |
| 安全停止             | 原账号解绑/登录错配、归档、审核版本改变、媒体被改写均无投稿；切换当前账号仍用冻结账号                              |
| 未知/取消竞态        | 网络提交结果不明不会自动重试；取消已派发上传返回 unknown，须核查平台                                               |
| 保存失败             | 同一版本已投稿时弹窗显示“未创建定时计划”，保留输入，不伪报成功                                                     |
| 应用启动异常         | 损坏的抖音账号索引不阻止 Electron 主窗口打开；工作流 IPC 返回明确配置错误                                          |
| 显示/键盘            | 明暗主题 1440/1024、200% 确认弹窗、Tab/Shift+Tab 焦点限制、Escape 返回、高对比/reduced-motion 已检查；局部滚动可达 |

## 检查记录

- 实现前红灯记录：`.scratch/scheduled-red.log`、`.scratch/scheduled-ui-red.log`，分别暴露缺少等待状态和折叠入口。
- `ELECTRON_RUN_AS_NODE=1 pnpm exec electron --import tsx --test scripts/test-import-finished-video.ts`：10/10；包括原成片导入、真实 FFmpeg 素材及两平台本地 CLI fixture。未向真实平台投稿。
- `pnpm test:bilibili-publishing`：29/29，既有认证、多账号、防重、话题适配、回执/人工核查回归通过。
- `pnpm build`、受影响 TypeScript 的 ESLint、Prettier、CJS `node --check`、`git diff --check` 通过。CJS 测试脚本沿用仓库现有 Node CommonJS 方式，未将其套入仅配置浏览器全局的 ESLint 规则。
- `pnpm design:check`、`pnpm design:build` 通过；只证明设计资产合同，不代替生产 UI 及完整无障碍检查。
- `pnpm exec tsc --noEmit -p tsconfig.web.json` 和 `pnpm exec tsc -b --pretty false` 仍有仓库既有 52/82 项类型错误；受影响模块无新增报错，未将全仓类型检查标为通过。
- `pnpm exec electron scripts/test-import-finished-video-ui.cjs`：隔离用户目录、编译后真实主进程/预加载/渲染器及 IPC，覆盖导入、审核、定时确认/保存/取消、已投稿再定时错误、主题和键盘；本地 CLI 模拟投稿。
- `MYDASHBOARD_TEST_BAD_PUBLISHING_INDEX=1 pnpm exec electron scripts/test-import-finished-video-ui.cjs`：损坏账号索引的隔离启动检查通过。
- 本轮截图在临时目录 `import-video-ui-*`，文件包括 `scheduled-{light,dark}-{1440,1024}.png`、`scheduled-confirmation.png`、`scheduled-confirmation-200percent.png`、`scheduled-high-contrast-reduced-motion.png`；不提交临时素材、账号配置或私有人物贴纸。

## 使用限制

需电脑开机联网且应用主进程运行；关闭窗口后若应用仍运行则计划继续，退出应用则停止。未创建任何用户真实发布计划，未验证真实平台当次风控或审核通过时间。
