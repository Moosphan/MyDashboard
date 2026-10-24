# 配音参数与单段重生成验证

日期：2026-10-24。范围：VoxCPM2 参考尾部停顿参数、视频工作流单段重生成。

实现保留 VoxCPM2 的 `ref_audio` 和续说提示，将临时提示末尾静音从固定 320ms 改为 `promptPauseMs`。共享请求只允许 VoxCPM2 使用该字段，默认 320，范围 0–1000，0 不追加停顿。AI Voiceover 高级参数和工作流“配音参数”均提供同一字段。

播放器每段右侧新增现有 Radix 菜单“更多操作 → 重新生成此段配音”。请求携带当前冻结的 `WorkflowVoice` 和所选 `audioTrackId`。服务端只重新生成该受管文件对应片段，复用其他段，使用真实新时长重新合并 WAV 和 SRT；成功创建 `review` 版本并使粗剪及后续版本失效，失败/取消不替换旧完整版本。无效、过期、导入模式或非 audio 阶段请求在创建任务前拒绝。

## 验证结果

- `pnpm test:voice-runtime`：3 个 Python 测试通过，覆盖 16/24 kHz、默认/0/自定义停顿、异常清理和原始参考不变。
- `pnpm test:voiceover`：29 个测试通过，覆盖请求默认值、边界和引擎隔离。
- `pnpm test:video-workflow`：32 个测试通过，覆盖只替换选中片段、同镜其他片段复用、真实时长/SRT、成功新版本、失败/取消保留旧版本和请求校验。
- `pnpm exec electron scripts/test-workflow-audio-controls.cjs`：通过；真实 Electron 验证原生播放器、菜单键盘 Space/Escape、失败保留旧音频、停顿参数传递、明暗主题、1440/1024 和 200% 缩放。
- `pnpm build`、`pnpm design:check`、`pnpm design:build`：通过；`pnpm exec electron-builder --mac --dir --arm64 -c.mac.identity=null`：通过，打包资源包含更新后的 `voice-runtime/adapters/voxcpm2.py`。
- `pnpm exec tsc --noEmit -p tsconfig.web.json` 仍受既有 `MainLayout.tsx`、`EmbeddedBrowser.tsx` 等错误阻断；`pnpm exec tsc -b --pretty false` 仍受既有 `@swc/core`、AI repository 和 `codex-session-usage-service.ts` 错误阻断。本次改动文件未新增类型错误。
- 打包后 Playwright 检查未执行：当前工作区没有可解析的 `playwright-core` Node 包；Electron builder 本身已完成 arm64 目录构建。

未对用户生产数据库或已有完整音频做覆盖；单段生成在隔离 Electron 数据库中验证。
