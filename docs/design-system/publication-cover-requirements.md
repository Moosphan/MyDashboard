# B 站封面规范核验

2026-10-26 直接读取官方投稿页及其当前脚本，未使用第三方尺寸文章作为依据：

- 页面：https://member.bilibili.com/york/videoup
- 官方脚本：https://s1.hdslb.com/bfs/static/creator-monorepo/videoup/static/js/index.1a0ef7ad.js
- `homepageCoverFourThree`：首页推荐封面（4:3）；`profileCoverSixteenNine`：个人空间封面（16:9）。
- `recommendedCoverResolution` / `batchCoverRecommendation`：推荐 ≥1200×900、4:3 高清封面。
- `imageResolutionError` 与加载校验：输入宽 ≥960、高 ≥600；`imageAspectRatioOutOfRange`：宽高比 4:3–16:9。
- `check_cover_size_fail` 附近实际校验 `size > 0x1400000`，错误参数 20，即原始图片 20 MiB。

项目封面输出：1600×1200 与 1600×900 PNG，沿用受管图片上限各 4 MiB；这是比官方原图大小更严格的内部限制。AI 代码分别排版，Image2 生成 4:3 后按中心安全区截出 16:9，预览中同时可核对。Catbus 0.2.1 仅接收一个 `--cover`，自动上传 16:9；发布包同时导出 4:3，用户可在创作中心单独设置首页推荐封面。
