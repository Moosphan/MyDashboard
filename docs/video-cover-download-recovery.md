# Image2 封面下载恢复

2026-10-29 的失败发生在“图片生成成功之后”的独立下载阶段：每次下载限定 120 秒，5 次重试后仍只有部分字节。它不能被当作模型没有出图，直接重新生图可能产生额外费用。

旧实现的下载分片只存在 CLI 内存，未保存响应 URL；CLI 退出后工作流还会清理任务临时目录。因此，错误中显示的 `saved N bytes` 不表示存在可恢复的本地文件。没有原图 URL 或服务商提供的结果时，无法还原该次完整图片。服务商用量日志只能证明生成已成功，不包含图片本身；本次没有重新生图，也没有替换旧封面。

## 修复

- 在运行现有 Image2 CLI 前通过 Bun/Node 兼容的 `--import` 加载结果记录器；仅捕获 `/images/edits`、`/images/generations` 的成功结果。
- 下载前将原图 URL 原子保存至用户数据目录 `cache/video-cover-recovery/<project-id>/<job-id>/result.json`；返回 base64 时直接保存原图。记录绑定源项目及成片/发布版本，权限为目录 0700、文件 0600，不保存 API Key、请求头或提示词。
- CLI 下载失败但已留下结果时，使用 Electron `net.fetch` 下载同一 URL，沿用系统网络和代理。请求不携带凭据，限 HTTPS、120 秒、16 MiB；失败留下 `download.part` 和结果记录，完成后原子改名 `original.png`。不调用生图 API。
- 下载成功后仍经过原 PNG、分辨率、4:3 比例和 4 MiB 产物校验，再生成 1600×1200 与中央裁切的 1600×900 候选。进入原版本/审核流程，不自动投稿或审核。
- 原临时任务目录可以正常清理；独立恢复目录保留。包含签名的 URL 不进入错误日志。历史失败若没有响应 URL，本修复不能凭空找回旧图。

## 验证

`pnpm exec tsx --test scripts/test-image2-recovery.ts` 使用真实 Bun 子进程与本地模拟图片 API，验证 CLI 下载失败前已落盘 URL、恢复仅 GET 同一图片、不写入凭据、失败保留部分字节且不误认为完整图片。

`ELECTRON_RUN_AS_NODE=1 pnpm exec electron --import tsx --test --test-name-pattern='image2 failures|cover requests|publication preserves' scripts/test-video-workflow.ts` 检查原诊断脱敏、封面来源及双比例合同。

`pnpm build` 后运行 `pnpm exec electron scripts/test-publication-covers-ui.cjs`，使用本地 fixture 验证封面正常生成、CLI 下载失败后的应用网络恢复、只生成一次、保留恢复记录、旧封面/版本/导出/审核流程；不向实际图片 API 发起付费生成或向平台投稿。
