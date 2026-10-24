# 单镜口播与修改记录验证（2026-10-24）

## 问题与处理

原实现以整阶段版本为依赖，保存单镜后统一使口播及下游失效；口播只有完整 AI 生成入口，生成任务没有保存单镜范围和修改内容。保留原有审核与过期保护，新增明确的局部恢复路径：

- 分镜审核通过后，稳定分镜 ID/顺序一致时可沿用当前保存的全部口播，无需调用 Agent 或语音引擎，关联新输入后创建待审核版本。
- 当前镜生成提示词仅请求一个 ID，服务端校验返回范围后合并，其他口播正文、读音、顺序原样保留；非法目标、错镜、多镜或分镜顺序变化均拒绝。
- 单镜生成保存目标序号/标题/ID、用户意见、源/结果版本；人工保存分镜也生成执行记录。完成时从真实前后版本计算字段差异，不以用户意见代替实际结果。
- 修改前后以 React 文本节点展示，HTML 不执行；详情可键盘展开及选择复制。旧任务无 operation 时保留原显示，不补造历史操作。
- 沿用、局部生成后均需人工审核，保持原来的下游失效机制。本次仅优化口播处理，不自动批准或重新生成配音。

## 验证证据

- Red：`/tmp/scene-narration-red.log`，3 项新回归按预期失败（沿用入口缺失、单镜未合并、人工编辑无记录）。
- Green：`pnpm test:video-workflow` 42/42，`/tmp/scene-narration-final-unit.log`。覆盖真实 SQLite migration、审核门禁、过期口播局部替换、沿用、保留其他镜、错误目标/结果拒绝、顺序变化拒绝、请求幂等及前后差异。
- Electron：`pnpm test:video-workflow:ui` 通过，`/tmp/scene-narration-final-ui.log`。在隔离配置运行真实应用，通过 IPC 保存/审核分镜，键盘 Space 沿用及局部生成，校验结果/锁定/执行记录及修改详情；切换真实 light/dark 设置，检查 1440、1024、200% 及页面重开后的持久记录。
- 截图目录：`/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/video-workflow-ui-9doUGT/`，含 `storyboard-scene-operation-detail.png`、`narration-single-scene-operation-dark.png`、`narration-scene-{light,dark}-{1440,1024,200percent}.png`。
- UI 脚本包括 `pnpm build`；生产构建通过。`pnpm design:check`、`pnpm design:build` 通过，日志 `/tmp/scene-narration-design-{check,build}.log`。
- 受影响生产文件 ESLint、Prettier 与 `git diff --check` 通过。
- `tsc -b --pretty false` 与 `tsc --noEmit -p tsconfig.web.json` 仍被仓库既有类型错误阻塞（例如 MainLayout IPC effect cleanup、BaseRepository 返回类型、缺失 @swc/core）；本次修改的工作流文件无诊断。日志 `/tmp/scene-narration-tsc.log`、`/tmp/scene-narration-web-tsc.log`。

## 范围

沿用 VIDEO-WORKFLOW-001 的现有 React 18 / Radix、Button、表单、时间线和主题，不引入新依赖或重新排列页面；只为修改前后文本补中性主题样式。生产项目没有执行 AI、TTS 或视频合成，测试产物不登记到用户项目。
