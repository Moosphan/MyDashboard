# 抖音发布与圆底播放按钮验证

日期：2026-10-26。承接 B 站多账号实现，用户明确要求接入抖音，并将封面播放按钮改为半透明黑色圆底与浅色图标。

## 能力依据与实现

已核实本机安装的 `catbus-cli@0.2.1`：真实 CLI 的 `platforms douyin -o json` 返回 web 登录与视频投稿已实现（`/tmp/douyin-real-capabilities.json`）。`dist/platforms/douyin/index.js`、`web/commands.js` 和 `web/normalize.js` 证实支持扫码、视频、封面、标题、正文、标签、可见性及作品列表；身份为 sec_uid，作品 ID 为数字。未进行真实扫码或投稿。

- 现有账号索引、Catbus 适配器、投稿服务、账号弹窗和投稿面板增加平台参数，保留原 B 站导出名、IPC、目录与记录；没有复制第二套投稿状态机。
- 抖音索引在 `config/publishing/douyin-accounts.json`，新增账号各使用 `config/publishing/douyin-accounts/<id>`，默认隔离目录为 `config/publishing/catbus-douyin`，CLI 别名为 `mydashboard-douyin`。B 站索引与凭据不变，两边选择、解除、请求幂等键和历史记录互不混用。
- 数据迁移 39 新建 `video_douyin_submissions`；保留原 B 站表，历史版本不变。投稿冻结已审核文件、资料与实际账号标识，发送前再校验审核和文件；结果不明不自动重传，核查须校验原账号、准确作品 ID 与手工绑定时的标题。私密状态以抖音实际回执为准。
- 抖音不支持 Catbus 分区、转载来源和版权声明参数；这些继续记录与导出为建议，页面和 AI 提示词明确区分。可见性实际提交，不将保存建议声称为已完成平台声明。人工导出与链接回填保留。
- 播放入口保持封面 160×90 和 40px 点击范围，背景为黑色 48% 不透明度，悬浮/焦点为 64%；使用浅色 PlayIcon，不覆盖整张封面。沿用预览弹窗、Escape、焦点返回和关闭卸载媒体。
- 沿用 `VIDEO-WORKFLOW-001` 生产例外、现有 Button、Voice 控件和 Radix WorkflowDialog、主题及桌面布局；账号和投稿表单保持原有顺序。状态、错误、取消、解绑确认和后台扫码复用既有交互。

## 验证范围

服务测试覆盖两平台账号隔离、sec_uid、绑定与选择恢复、独立投稿表与请求去重、冻结资料、审核与文件变更、支持参数、平台信封校验、私密回执、原账号核查、取消和未知结果。Electron 使用隔离 userData 与测试 CLI，验证两平台扫码、弹窗关闭重开、账号切换/解除、保存审核后投稿、平台回执、作品链接、断网待核查，以及播放加载、关闭和焦点返回。截图包含浅深色封面、复杂封面、账号弹窗 1440/1024、200% 缩放及键盘检查。

测试只使用虚构账号/作品与本地生成的短视频，不操作用户作品。真实平台登录、风控、声明要求及审核仍需实际使用验证。

## 命令结果

- `pnpm test:bilibili-publishing`：26/26，包含两平台集成测试；`/tmp/douyin-tests-final.log`。新增行为先运行失败测试，日志见 `/tmp/douyin-red.log`、`/tmp/douyin-visibility-red.log`、`/tmp/douyin-platform-error-red.log`。
- `pnpm test:video-workflow`：56/56；`/tmp/douyin-workflow-final.log`。
- `pnpm test:bilibili-publishing:ui`：生产构建与真实 Electron 两平台界面验证通过；`/tmp/douyin-ui-final.log` 首个 `Bilibili UI artifacts` 行提供隔离截图目录，包含各主题、视口、200% 缩放、播放按钮和抖音账号/回执截图。
- `pnpm design:check` 与 `pnpm design:build`：通过；`/tmp/douyin-design-check.log`、`/tmp/douyin-design-build.log`。设计资产检查不等同于全生产迁移完成。
- 修改范围 Prettier 与 ESLint：通过；`/tmp/douyin-format-final.log`、`/tmp/douyin-lint-final.log`。`catbus.ts` 的既有空 catch 按 `allowEmptyCatch` 检查，未顺带修改其他存量问题。
- `pnpm exec tsc -b --pretty false`：仍有 82 项既有诊断，与前次基线对应，没有变更文件新增错误；`/tmp/douyin-types-final.log`。不宣称全项目类型检查通过。
- macOS arm64 未签名打包成功，真实打包程序验证 `app.isPackaged=true`、隔离 userData、抖音双账号扫码与切换、保存并审核设置、模拟视频投稿、私密回执核查、预览关闭，以及高对比/减少动效；`/tmp/douyin-package.log`、`/tmp/douyin-packaged-ui.log`，后者包含 `PACKAGED_DOUYIN_OK`。不等同于签名分发包或完整 WCAG 认证。
