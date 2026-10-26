# 史笺 · 历史文化模板实施记录

目标：在现有视频工作流的视觉模板族内，增加精美、可离线渲染、适合历史文化普及的牛皮纸模板，不改变工作台布局和审核流程。

## 研究与设计依据

2026-10-26 阅读的开源一手资料：

- [Slidev](https://github.com/slidevjs/slidev)：内容与主题分离、不同叙事采用不同 layout；[Seriph 的布局样式](https://github.com/slidevjs/themes/blob/main/packages/theme-seriph/styles/layouts.css) 和 [cover](https://github.com/slidevjs/themes/blob/main/packages/theme-seriph/layouts/cover.vue) 展示 cover / fact / quote / section 的字体尺度差异。借鉴角色分工，不复制远程图片或页面代码。
- [Marp Gaia](https://github.com/marp-team/marp-core/blob/main/themes/gaia.scss)：标题、正文、引文与页眉页脚层级；固定画布与边距、浅色背景中的深色文字。借鉴清晰的内容层次，不引入其网络字体、CSS 或运行时。
- HyperFrames registry 检索 `paper texture editorial timeline`：纸片转场与 Beat Timeline 偏向动态效果，不适合当前无脚本静态关键帧合同。本次原创静态纸纹和山川版画，动画沿用现有结构化 motion 引擎。usage 返回 no_subscription_login，不推断订阅额度。

## 视觉合同

- 1920×1080 全幅牛皮纸（#dfc69c），深墨（#302a23）、朱砂（#873b2a），纸上压印细线；不用网页卡片或大圆角。
- 本地宋体标题与黑体正文；不依赖网络字体。标题 76–112 px，正文 32–38 px；底部 140 px 字幕安全区。
- 十种构图：卷首山川 / 人物与背景分栏 / 编年脉络 / 双栏辨析 / 史料引文 / 结语索引 / 山川行旅 / 人物关系 / 器物解读 / 章节过渡。山川为原创装饰，路线与器形标注原创示意，不作为史实地图或真实文物。
- 独立标题、正文、时间轴、节点、规则线与装饰元素，可供现有 MG 引擎选择；不开启 MG 时不注入动画或脚本。
- 事实只来自用户文案，不自动补年代、人物、引文或来源。长文明确提示拆镜，不静默删字或用省略号遮蔽。

## 实施与验证

- [x] 注册模板并测试合法载荷、文案保留、转义、离线和十种版式。
- [x] 独立 `history-template.ts` 提供样式、构图及 Agent 视觉参考，沿用 sceneHtml 分发。
- [x] 现有创作设置展示相应样本；选择模板族时应用到画面，保留文案及镜头 ID。
- [x] 扩展为十页展示稿与截图，检查长标题、90/180 字正文、多节点长标签、字幕安全区及溢出。
- [x] 执行工作流测试、设计检查、构建与 Electron 明暗主题/键盘/窗口测试，记录实际结果。

实现直接在当前会话进行。已先提交原有改动为 114946b；本模板留作本轮可审阅变更。

十版式扩展的 registry 检索 `map route relationship diagram artifact` 返回美国地图等动态块，与当前历史叙事及无脚本静态模板合同不匹配。本次沿用原创 SVG 路线、关联线和器形；不引入地图数据或外部素材。
