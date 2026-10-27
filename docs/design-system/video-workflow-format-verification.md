# 视频工作流横竖画幅修复验证

日期：2026-10-27。用户要求抖音竖版全屏，但分镜被系统强制为横版。

## 根因与边界

项目此前没有结构化画幅字段；文案、Agent 分镜提示词、安全预览容器、模板、MG 编译、HyperFrames 合成根节点、转场距离、输出校验和页面标签分别固定为 1920×1080。用户的参考要求与文案虽然明确写了竖版，仍被系统级横版约束覆盖。这是项目的集成约束，不是 HyperFrames 不支持竖版。

简报现支持保存 `format: landscape | portrait`，对应 1920×1080 / 1080×1920。显式选择优先；旧项目仅从明确的画幅文字恢复创作意图，单独提到抖音不默认改成竖版。分镜版本冻结实际画幅；无字段历史分镜继续按原横版预览，不改标签伪装竖版。新分镜生成使用项目目标，保存并贯通到预览、模板、动效、字幕及粗剪。正式成片沿用粗剪冻结尺寸，跨画幅不能复用旧帧。

竖版采用上下排版，预留字幕和平台按钮区域。生成、保存、审核时校验竖版主容器及显式 body 尺寸；错误尺寸返回可操作原因，保留旧版。单镜重绘不能跨画幅混合其他旧镜，必须整组重新生成。错误画幅不能审核通过。B 站独立封面的 4:3 / 16:9 规格保持其独立业务含义。

## 生产 UI

受影响：创作简报、项目列表与详情规格、分镜预览和源码说明、粗剪 / 正式成片、发布成片预览。使用既有 VoiceSelect / Radix / Voice 控件及项目主题，沿用 VIDEO-WORKFLOW-001 例外。未增加依赖、图标或主题迁移。

保留标题与动作位置、主区和审核栏、原 16:9 预览与缩略图槽位。槽位内按源画幅完整居中显示；竖版成片文件本身仍为全幅 9:16。项目目标与旧分镜不一致时展示明确说明，审核动作就近解释原因。

覆盖空项目默认值、已保存版本、未保存选择与放弃、历史横版与目标竖版冲突、错误横版 HTML 拒绝、审核拒绝、完整预览、旧版本保留。原有生成任务、取消、失败和人工审核继续复用既有流程；本次未调用外部 AI 或投稿真实作品。

## 验证结果

- `pnpm test:video-workflow`：71/71。先加入失败回归，确认画幅被丢弃、提示词与工程仍是横版、错误来源画幅未被拒绝，再修复并验证通过。
- `pnpm exec electron scripts/test-portrait-storyboards.cjs`：四套模板 28 种版式、普通 / 180 字内容共 56 例通过；包括史笺十种版式。测量文字边界并在真实隔离 Chromium 编译；错误横版 body 尺寸被拒绝。样图与记录：`/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/portrait-storyboards-0x07PQ`。已查看卷首、路线和结语实际图像。
- `pnpm test:history-template`：原横版十种版式、33 页普通 / 长标题长文本 / 多节点用例完成，记录在 `.scratch/history-template/verification.json`，各页 `overflow: []`。
- `pnpm exec electron scripts/test-video-format-ui.cjs`：真实 IPC 保存竖版简报与分镜，拒绝错误主容器，拒绝审核旧横版，检查 iframe 实际 1080×1920 及缩放后 9:16 比例。明暗主题 × 1440/1024、200% 缩放、Tab / Shift+Tab、Space、方向键、Enter、Escape 与焦点返回通过；高对比和 reduced-motion 模拟下选择器仍可操作。最后一轮记录：`/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/video-format-ui-1DP547`。
- `WORKFLOW_FORMAT=portrait WORKFLOW_HYPERFRAMES_PATH=… WORKFLOW_NODE_PATH=… pnpm test:video-workflow:render`：实际 HyperFrames 0.8.181 完成配音导入、两镜粗剪、正式成片、两平台本地发布包及失效链路。`ffprobe` 验证正式文件为 **1080×1920 / 30 fps / 4.000 秒**。音频为测试合成音，没有调用付费配音或真实发布。
- `pnpm build`、`pnpm design:check`、`pnpm design:build` 通过。
- `pnpm exec tsc -b --pretty false` 仍为既有 82 条诊断，`pnpm exec tsc --noEmit -p tsconfig.web.json` 仍为既有 52 条；本轮改动文件没有诊断。不能将构建成功表述为全项目类型检查通过。
- `CSC_IDENTITY_AUTO_DISCOVERY=false pnpm exec electron-builder --mac --dir --arm64 -c.directories.output=.scratch/video-format-package` 完成未签名本地包。`node scripts/test-video-format-package.cjs <MyDashboard.app>` 实际启动包，创建独立测试项目并验证简报保存、模板校验与竖版分镜 iframe，通过。记录：`/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/video-format-package-ovKvB4`。

本地保留的明暗 / 缩放 / 高对比截图及真实竖版 MP4：`.scratch/video-format-verification-20261027/`。构建产物及测试数据均不提交。

## 当前用户项目

只读核实「西汉人物志张良」（`1b3cabfa-1cf6-4e69-aeaa-d46665f064ef`）：新逻辑正确识别目标为竖版，分镜 v1 实际仍为旧横版。旧 HTML 具有横版固定坐标与图形布局，不能仅替换尺寸安全转成竖版。因此保留原版本，界面明确提示整组重新生成；不自动替换画面、不自动审核，也不修改用户已有文案和任务记录。
