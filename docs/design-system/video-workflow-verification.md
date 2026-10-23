# 视频工作流设计交付 · 验证记录

日期：2026-10-22（Asia/Shanghai）。此处保留原工作区设计站的历史记录；当前功能分支真实 Electron 验证见 [生产布局对齐记录](video-workflow-production-alignment.md)。验证对象为独立设计站与技术文档，**不是生产视频功能**。相关：[完整方案](../video-studio-technical-design.zh-CN.md)、[UI规格](video-workflow-ui-spec.md)。

## 历史设计站执行结果

| 命令 | 实际结果 |
| --- | --- |
| `pnpm design:check` | exit 0；入口、布局源、固定版本和外观覆盖边界检查通过 |
| `pnpm design:build` | exit 0；TypeScript + Vite 构建通过，2108 modules；JS约710KB，有>500KB分包建议警告，不影响本次设计构建 |
| `pnpm design:verify` | **21 passed，44.2s，0 failed**；Chrome headless，1 worker；含原有8项及视频13项 |
| `pnpm --dir docs/design-system/v2 verify checks/video-workflow.spec.ts -g 'Agent settings remain'` | **1 passed，3.9s**；追加验证自由创作弹窗深色/窄窗口及未生成时保存设置的门禁；合计22项检查通过 |
| `git diff --check` | exit 0，无新增空白错误 |

环境：真实 React19 / Tailwind4 / HeroUI React与Styles 3.2.6；Heroicons 2.2.0 outline；Chrome由现有 Playwright 配置启动，默认1440×1100，reduced-motion。沿用已运行的127.0.0.1:3046预览服务，没有终止或替换用户已有服务。

## 已验证行为

视频专项检查现为14项，文件为 原工作区的 `docs/design-system/v2/checks/video-workflow.spec.ts`，并通过原有8项设计站回归。第14项追加后单独运行；不把前次21项的完整运行描述为一次22项运行。

1. 未通过不能下一步；人工通过后才能进入；生成完成停在待审核，不自动批准。
2. 更换模板取消不改变已采用模板；保存新版本需要重审；上游编辑使已存在下游标为需更新。
3. 空修改意见有就近错误；失败重试、取消与再次生成保留正文。
4. 配音需全部示例段落检查；CLI未就绪打开环境窗口；Select先于Modal响应Escape并返回焦点；选文件和登记导入仅模拟。
5. 平台资料先审核再导出；下载文件名明确design-demo；错误域名被拒；人工回填来源明确；两平台状态独立。
6. 八个阶段与列表在浅深主题均渲染，无页面横向溢出、无捕获到的页面脚本错误。
7. 1024×900、1440×720与720×550下模板弹窗主操作在视口内；Escape返回触发器；模板方向键选择有效。
8. 分镜文字修改取消不变；确认后写入内存新版本，下一步仍等待审核。
9. 新建必填校验、创建示例、搜索；同项目跨阶段返回保留正文草稿，并阻止审核未保存内容。
10. 跟随系统深色生效；forced-colors与reduced-motion模拟下可键盘批准当前版本并启用下一步。
11. Stepview八个步骤有列表语义、当前步骤可访问名称与审核门禁；默认桌面无步骤横向滚动。
12. 自由创作至少一项参考校验、URL协议校验、HTML文件名登记、取消不提交、单镜保存与要求回看；不访问外网或运行文件。
13. 同一视觉模板包含四种版式；切换风格保留逐镜布局，单镜版式编辑保留其他镜头并要求重审。
14. 自由创作弹窗在1440×1100、1024×900、720×550深色视窗主操作可达、Escape焦点返回；未生成分镜仅保存设置不产生可审核画面。初次补充检查误定位到HeroUI隐藏原生radio，改用可见标签操作后通过，未覆盖组件外观或强制点击。

页面截图已目视检查：分镜浅深色、项目列表、发布深色、模板在1024和720宽度的弹窗、分镜编辑弹窗，以及本轮自由创作的浅深色与720×550稿。Stepview状态置于Button外，采用上游Radio.Content包Control/Label，没有覆盖控件高度或内距。优化前后证据见下方，使用现有设计审计skill的层级/间距/图标/动作检查方法，仍以桌面规范2.0为准。

## 高保真页面截图

| 画面 | 浅色 | 深色 |
| --- | --- | --- |
| 项目列表 | [查看](video-workflow-reference/video-workflow-projects-light.png) | [查看](video-workflow-reference/video-workflow-projects-dark.png) |
| 创作简报 | [查看](video-workflow-reference/video-workflow-brief-light.png) | [查看](video-workflow-reference/video-workflow-brief-dark.png) |
| 内容文案 | [查看](video-workflow-reference/video-workflow-copy-light.png) | [查看](video-workflow-reference/video-workflow-copy-dark.png) |
| HTML分镜 | [查看](video-workflow-reference/video-workflow-storyboard-light.png) | [查看](video-workflow-reference/video-workflow-storyboard-dark.png) |
| 口播定稿 | [查看](video-workflow-reference/video-workflow-narration-light.png) | [查看](video-workflow-reference/video-workflow-narration-dark.png) |
| 配音审核 | [查看](video-workflow-reference/video-workflow-audio-light.png) | [查看](video-workflow-reference/video-workflow-audio-dark.png) |
| 动态粗剪 | [查看](video-workflow-reference/video-workflow-roughcut-light.png) | [查看](video-workflow-reference/video-workflow-roughcut-dark.png) |
| 正式成片 | [查看](video-workflow-reference/video-workflow-final-light.png) | [查看](video-workflow-reference/video-workflow-final-dark.png) |
| 平台发布 | [查看](video-workflow-reference/video-workflow-publish-light.png) | [查看](video-workflow-reference/video-workflow-publish-dark.png) |

专项截图共10张：

- [修改影响确认](video-workflow-reference/video-workflow-impact-light.png)、[分镜编辑](video-workflow-reference/video-workflow-scene-edit-light.png)、[新建项目](video-workflow-reference/video-workflow-new-project-light.png)。
- [依赖失效](video-workflow-reference/video-workflow-stale.png)、[失败重试](video-workflow-reference/video-workflow-error.png)、[环境未就绪](video-workflow-reference/video-workflow-runtime.png)。
- [1024×900](video-workflow-reference/video-workflow-1024x900.png)、[1440×720](video-workflow-reference/video-workflow-1440x720.png)、[720×550](video-workflow-reference/video-workflow-720x550.png)、[高对比模拟](video-workflow-reference/video-workflow-forced-colors.png)。

本轮新增证据：[优化前](video-workflow-reference/video-workflow-before-stepview.png)、[模板多版式预览](video-workflow-reference/video-workflow-template-family-light.png)、[自由创作浅色](video-workflow-reference/video-workflow-agent-creation-light.png)、[自由创作深色](video-workflow-reference/video-workflow-agent-1440x1100-dark.png)、[1024深色](video-workflow-reference/video-workflow-agent-1024x900-dark.png)、[720深色](video-workflow-reference/video-workflow-agent-720x550-dark.png)。优化前保留原截图，其余为本轮浏览器截图。

总计34张 `video-workflow-*.png`。受全站评审入口新增影响，原设计站截图也按完整回归重新生成。截图为窗口视图，长阶段内容可在交互稿内继续滚动，不代表整条视频的素材或真实成片。

## 验证边界与生产门槛

- 720×550是1440×1100的**200%缩放等效布局**，不是Chrome原生缩放或Electron实际200%实测；正式实施须补真实缩放、辅助技术与完整对比度验收。forced-colors可操作不等于完整WCAG通过。
- 概况、波形、时长、模板画面是设计示例；无真实媒体，播放禁用。自由创作入口仅在内存登记参考和设置，不抓取链接、读取HTML或调用Agent。已生成示例切换设置只模拟新版本；生产须有真实候选才能审核。只导出标明designPreview的JSON清单，不生成视频/音频/发布包，不访问平台。导入只显示文件名，不声称生产校验完成。
- 原型保持当前项目内的主要草稿；示例项目详情共用演示场景，不提供跨项目持久草稿库。任务只模拟当前工作区，不代表后台/跨重启恢复已实现。归档、真实字幕校正、输出规格编辑、历史版本恢复和完整素材关联需生产补齐。
- 生产Renderer仍React18/Tailwind3；未安装HeroUI到生产、未改业务IPC/数据库、未调用CLI生成。生产Electron运行/打包、真实渲染五分钟样片、磁盘失败、跨窗口CAS、进程回收与备份恢复均**未执行**。
- 正式开发先确认新布局和待决规则，再按技术方案A–D实施；执行生产类型检查、构建、配音/备份回归和Electron打包运行。设计站通过不能替代这些门槛。
