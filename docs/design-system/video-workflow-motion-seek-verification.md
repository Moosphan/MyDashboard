# 粗剪动画修改与分镜定位验证

日期：2026-10-24。受影响页面为动态粗剪及共用同一播放器的正式成片预览。沿用 VIDEO-WORKFLOW-001 例外，保持原有布局、信息顺序、主题、播放器、缩略图及审核入口。

## 原因与修复

旧修改提示词把所有历史 MG 要求重新标为必须执行，局部调整也可能因为其他镜缺少元素而要求回上游。首次生成继续执行完整创作要求；后续修改只落实本次意见，单镜上下文不携带其他镜的 HTML 注释和逐镜要求。已有元素的入场、透明度、位移、缩放、旋转、时序及转场可直接规划；新增文字、图形、HTML 元素或素材确实需要回分镜阶段，不能承诺仅靠关键帧完成。

原视频可能在取消计划后沿用旧分镜及配音，而当前上游已经存在新版。修改计划的提示词、目标元素校验、实测时长、MG 开关及确认后的粗剪合成统一绑定预览视频实际来源。新粗剪保存原来源 ID，上游现有版本不变；不偷偷混入新画面或新配音。仍由用户确认计划、合成新版并审核。

旧分镜点击使用平铺配音累加定位，播放事件则按分镜聚合后累加。定位恰好落在边界，浏览器微秒精度和浮点差异会将时间判为上一镜；实测第六镜点击后变为第五镜。现在统一时间轴与合成工程的微秒边界，点击定位到 30 fps 的首个有效视频帧，忽略 seek 未完成时的旧 timeupdate，在 seeked 后同步时间、选中项、标题和口播。正常播放和原生时间条跳转继续同步分镜。

## 验证证据

- `pnpm test:video-workflow`：53/53；新增回归在修复前失败，覆盖 16 镜小数时长、多段配音、前后边界、片尾、局部提示词及旧视频来源版本的计划持久化。日志 `/tmp/roughcut-fixes-red2.log`、`/tmp/roughcut-fixes-green.log`。
- `pnpm test:video-workflow:ui`：真实 Electron 和 253 秒测试 MP4。修复前稳定复现第六镜跳到第五镜；修复后 16 镜乱序点击、播放时快速连续点击、向前跳、向后跳及原生进度条均通过。Space 触发缩略图后焦点与选中状态稳定。明暗主题、1440/1024、200% 缩放通过，未改布局。日志 `/tmp/roughcut-ui-red.log`、`/tmp/roughcut-ui-green.log`；截图目录 `/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/video-workflow-ui-WXzyB3`，文件前缀 `scene-seek-`。
- `scripts/test-roughcut-motion.cjs`：从隔离 smoke 工程复制测试数据，先修改当前上游的分镜 ID、HTML、配音时长和 MG 设置，再通过测试 Agent 生成旧视频的局部动画计划。真实 DOM 目标校验和 HyperFrames 合成通过，输出保持原来源与时长，其他镜动画不变；新增 SVG 的明确上游要求仍返回错误且保留当前视频。没有调用 TTS 或生产 Agent。日志 `/tmp/roughcut-motion-render.log`，隔离产物 `/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/roughcut-motion-tT2geS`。

测试不修改生产项目，不替用户生成、取消、确认或审核视频。测试 Agent 验证应用传参和执行链路，不代表对真实模型任意自然语言建议都能成功的保证。

## 交付复核

- 最终回归 53/53，日志 `/tmp/roughcut-tests-final.log`；最终真实合成再次通过，日志 `/tmp/roughcut-motion-render-final.log`，产物位于隔离目录 `/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/roughcut-motion-bAXPQh`。
- 生产构建、受影响源码 ESLint、Prettier、`git diff --check`、设计检查和设计站构建通过，日志为 `/tmp/roughcut-build-final.log`、`/tmp/roughcut-source-lint.log`、`/tmp/roughcut-format.log`、`/tmp/roughcut-doc-format.log`、`/tmp/roughcut-design-check.log`、`/tmp/roughcut-design-build.log`。
- 全量类型检查仍有既有 main 29 条、web 52 条错误，本次工作流文件无类型诊断。测试文件整体 ESLint 另有既有单镜口播用例的 `prefer-const`，未改动无关用例。日志 `/tmp/roughcut-types-main.log`、`/tmp/roughcut-types-web.log`、`/tmp/roughcut-lint.log`。
