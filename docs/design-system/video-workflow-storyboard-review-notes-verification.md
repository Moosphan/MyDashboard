# 分镜审核说明验证 · 2026-10-26

## 故障与修复边界

“西汉人物志刘邦”HTML 分镜 v2 的第一镜把两条过程说明写入 motion.blockers：

- 未提供实测配音，归一化卡点需在粗剪时按原口播词锚与实际配音校准。
- 独立子 agent 设计复核尚未完成：审核会话未收到任务内容，重新创建会话失败，需补做复核。

其他七镜没有 blockers；本版八镜均有独立动效计划。分镜位于配音之前，上述过程说明不表示 DOM 或动画无法执行，却被前后端统一当成两处动效缺口。既有“接受原创示意图降级”仅适用于素材缺口，因此没有出现。

新增可选 motion.notes，生成提示明确区分过程说明与真实缺口。仅对以上两条已核实历史原文作兼容分类，保留原始 blockers 数据；不根据“配音”“复核”等关键词宽泛放行。真实选择器、动作、素材和缺失计划继续阻断，人工确认时仍调用实际 DOM 动效验证。未添加通用跳过，也未直接审核或修改用户项目。

## 验证证据

- 单元回归修复前失败，错误为“因 2 处动效缺口无法审核”；修复后工作流 67 项通过。覆盖历史原文保留、说明提取去重、notes 校验及往返、真实缺口仍阻断。
- 真实 Electron 动效集成修复前在 service.approve 复现相同错误；修复后通过，继续覆盖缺失 selector、素材降级及 WAAPI 反向定位。
- 将用户实际八镜 payload 只读复制到临时数据库，真实 Electron 人工审核交互通过；IPC 验证审核成功、下一阶段开放、历史原文保留。用户原项目审核状态未变。
- 明暗主题、1440/1024 宽度、200% 缩放截图；审核弹窗 Escape 关闭、焦点返回、再次确认通过。沿用现有两栏、信息顺序及底部动作。
- 应用构建、TypeScript 检查、design:check 与 design:build 通过；设计构建仅有既有 bundle 大小提示。改动代码的 Prettier 检查与 git diff --check 通过。
- 生产改动文件 ESLint 通过；测试脚本有既有 prefer-const 错误，未作为本次故障扩展修改。

Electron 图像与临时测试数据：`/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/storyboard-review-notes-ui-t2G8pb`。
动效集成测试数据：`/var/folders/tp/lp03pbbn6wb275zsvn3lfrq00000gn/T/storyboard-motion-wFAIEv`。

重现入口：`pnpm test:video-workflow`、`pnpm exec electron scripts/test-storyboard-motion.cjs`、构建后 `STORYBOARD_REPRO_FILE=<只读导出的分镜 JSON> pnpm exec electron scripts/test-storyboard-review-notes-ui.cjs`。UI 测试只审批其临时 fixture。
