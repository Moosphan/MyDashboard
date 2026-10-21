# 工具箱扩展

工具描述、偏好、快照和 IPC 合约统一位于 `src/shared/toolbox.ts`。主进程注册描述和协调器任务后，在 `registry.tsx` 的 `toolRegistry` 添加对应 ID 的 `ToolDefinition`：必须提供 `Content`，可提供 `Configuration`、`officialUrl`、`canRefresh(snapshot, state)` 与 `needsConfiguration(snapshot, state)`。配置组件接收当前状态和 `onState`，自行管理工具专用操作与确认提示。增加需要配置的第二个工具只需新增注册定义和其组件，不需修改卡片或页面。

公共 `ToolCard` 负责尺寸、状态、刷新、时间、官网入口、配置入口、置顶、隐藏和排序，页面负责通用配置 Modal、管理、订阅与活动状态。VPN 登录、退出确认及会话告知都由注册表内的配置组件负责。不要在内容组件重复通用控制或创建独立刷新定时器。成功获取时间采用紧凑显示，悬停可查看完整本地日期时间；官网日期保持来源语义。

页面标题和留白对齐 Insights 的 `headline-xl`、`body-lg` 与 1280px 内容容器。卡片保持 320px 高，网格建议最小宽度 360px；身份图标 18px，右侧拖拽、置顶和隐藏图标 16px。`ToolManager` 负责工具设置列表，`ToolboxDialog` 复用项目的 Radix Dialog 与 Button 构建左对齐的表单弹窗；危险确认继续使用现有 Modal。

工具只通过主进程返回的 `ToolboxState.tools` 显示。新工具默认等待启用。开发示例 ID 为 `toolbox-example`，仅在启动应用时显式设置 `TOOLBOX_DEV_TOOLS=1` 由主进程注册；正式默认仅提供 VPN。示例正文不伪造成功用量。

布局变更通过 `toolboxAPI.update` 等待主进程持久化结果，不在渲染层单独存储偏好。移动使用 `move/toolId/targetId`，只允许同组显示项。隐藏和停用由主进程暂停任务；页面卸载和文档隐藏也报告非活动状态。

主进程每次状态变更递增 `ToolboxState.revision`。页面和配置组件的响应统一经过版本过滤，避免较早的 IPC 响应覆盖较新的完成事件。工具不得直接绕过公共状态接收入口。

页面标题及侧边栏入口统一为 Toolbox。VPN 使用 Material Symbols 的 send 纸飞机图标，正文以紧凑行展示完整流量、余额和日期，正常及有旧数据的错误状态在 320px 卡片内无需滚动。错误详情在状态标记的悬停提示和辅助技术状态中提供。VPN 正文按官网源字符串展示 GB，额外包与月配额分开。付款日期不代表到期日期；缺失字段显示未知。官网内容、会话与服务标识不得进入正文注册组件。

官网加载完成不代表统计已渲染。适配器在取消信号与代次保护下等待有限次数，连续两次有效且一致的统计才接受；登录、安全检查和服务权限错误直接分类返回。

登录 Cookie、所选服务和最近成功用量由主进程通过 Electron safeStorage（macOS 钥匙串、Windows DPAPI、Linux 支持的系统密钥服务）加密至 userData/toolbox/portal-cache.enc。文件采用 0600 权限和原子替换；Chromium 始终使用独立内存分区，不创建磁盘 Cookie 数据库。恢复 Cookie 后才发起请求；重启先显示本机缓存，成功联网后替换，失败保留原成功时间。系统加密不可用或 Linux basic_text 后端不得明文回退。缓存损坏/解密失败提供重新登录提示。退出清除 Cookie、服务关联及加密用量；更换服务立即撤销旧用量。不会保存密码、订阅地址或原始页面。

静态类型检查和 ESLint 不能证明实际指针拖拽、独立官网登录、套餐确认、受保护会话、真实字段兼容性或应用重启持久化。以上需要实际 Electron 应用与授权账号验收，原型和示例数据不能替代这些证据。

## 验证命令

```sh
node --import tsx --test scripts/test-toolbox.ts scripts/test-toolbox-portal.ts scripts/test-toolbox-protection.ts scripts/test-toolbox-ui-tokens.ts
npm run build
npx electron scripts/test-toolbox-electron.cjs --ui
node scripts/test-toolbox-restart.cjs
node scripts/test-toolbox-cache-restart.cjs
```

Electron 测试使用临时用户目录及合成官网响应，不读取实际账号。布局测试验证普通开发示例不恢复快照；加密缓存测试运行两个独立 Electron 进程，使用实际系统加解密验证令牌/用量恢复、离线保留、缓存损坏与退出清除。真实官网可能在服务器端使会话过期，届时仍需重新登录。
