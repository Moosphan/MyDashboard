# 中国传统文化 SVG 装饰资源参考

研究日期：2026-10-26。目标是给「史笺」牛皮纸画面补充可复用的古塔、寺院、山川、宫阙等原创插画。以下资料均以 `curl` 实际读取一手 README、源码或许可证；没有下载远程图片、复制现成图标或引入这些项目的运行时依赖。

## 一手参考与取舍

| 参考                                                                                   | 实际核实的能力或方法                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 本次采用的思路 / 边界                                                                                                                                                                |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [LingDong- / shan-shui-inf](https://github.com/LingDong-/shan-shui-inf)                | [README](https://github.com/LingDong-/shan-shui-inf/blob/master/README.md) 说明以噪声和数学函数从零生成中国山水，并输出 SVG；[源码](https://github.com/LingDong-/shan-shui-inf/blob/master/index.html) 包含 `stroke`、`texture`、山体、树木及建筑生成。许可证为 [MIT](https://github.com/LingDong-/shan-shui-inf/blob/master/LICENSE)。                                                                                                                                          | 借鉴山体轮廓、层次疏密和短线皴纹的分工；给装饰图预先固定形状，不在播放时随机生成。原工程的无限滚动和全局随机数处理不适合作为分镜静态素材直接搬入。                                   |
| [rough-stuff / rough](https://github.com/rough-stuff/rough)                            | [README](https://github.com/rough-stuff/rough/blob/master/README.md) 展示 SVG/Canvas、手绘线条及 hachure / cross-hatch 等填充；[配置类型](https://github.com/rough-stuff/rough/blob/master/src/core.ts) 提供 `roughness`、`bowing`、`seed`、`hachureGap`；[随机数实现](https://github.com/rough-stuff/rough/blob/master/src/math.ts) 的非零 seed 使用确定性序列。许可证为 [MIT](https://github.com/rough-stuff/rough/blob/master/LICENSE)。                                      | 借鉴轻微不规则轮廓与排线遮阴，控制抖动幅度，建筑中轴、层檐及柱网仍应稳定。代码可直接输出原创路径，无需为几幅图增加库依赖。                                                           |
| [ByteDance / IconPark](https://github.com/bytedance/IconPark)                          | [README](https://github.com/bytedance/IconPark/blob/master/README.md) 说明通过同一 SVG 的 fill/stroke 属性生成 outline、filled、two-tone、multi-color 主题，使用 48×48 网格；实际读取 [chinese-pavilion.svg](https://github.com/bytedance/IconPark/blob/master/source/Build/chinese-pavilion.svg) 与 [palace.svg](https://github.com/bytedance/IconPark/blob/master/source/Build/palace.svg)。许可证为 [Apache-2.0](https://github.com/bytedance/IconPark/blob/master/LICENSE)。 | 借鉴透明底、轮廓与色块分层、统一线宽的资源组织。注意该库的 `palace.svg` 实际是三角山花与柱廊造型，不能因名称含 palace 就当作中国宫殿。小尺寸图标适合识别，不足以直接放大成历史插画。 |
| [Remix Design / RemixIcon](https://github.com/Remix-Design/RemixIcon)                  | [README](https://github.com/Remix-Design/RemixIcon/blob/master/README.md) 说明 24×24 网格、描边/填充两套风格；[ancient-gate-line.svg](https://github.com/Remix-Design/RemixIcon/blob/master/icons/Buildings/ancient-gate-line.svg) 用屋檐与门洞建立古建识别。当前 [License](https://github.com/Remix-Design/RemixIcon/blob/master/License) 是 **Remix Icon License v1.0（2026-01）**，不能沿用旧印象称其为 Apache-2.0。                                                          | 借鉴远看可识别的外轮廓和视觉简化。本任务是可下载的资源库，当前许可证第 3 节对独立素材集合及竞争性图标库有额外限制，因此不收录或轻改其图标，仅作为观察参考，所有演示路径原创。        |
| [svgdotjs / svg.js](https://github.com/svgdotjs/svg.js)                                | [README](https://github.com/svgdotjs/svg.js/blob/master/README.md) 定位为无依赖 SVG 操作与动画库；[许可证](https://github.com/svgdotjs/svg.js/blob/master/LICENSE.txt) 为 MIT。                                                                                                                                                                                                                                                                                                  | 参考将形状、组合与变换分开管理的实现方向。当前素材导出纯 SVG 即可，不需要给展示页增加绘图库或依赖外部 CDN。                                                                          |
| [MDN：SVG `<g>`](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/g) | 实际读取 [MDN 文档源](https://github.com/mdn/content/blob/main/files/en-us/web/svg/reference/element/g/index.md)：`<g>` 用于元素分组，变换作用于子元素，多数表现属性可继承，`id` 不继承。                                                                                                                                                                                                                                                                                        | 用独立语义组组织屋顶、柱身、台基、山体、松树、云气；以后可分别定位、改色、隐藏或添加动效。文档内容不作为素材代码复制。                                                               |

## 适配牛皮纸的原创设计方向

- 采用「墨线版画＋淡赭设色」：深墨轮廓、茶褐排线、少量朱砂点睛，纸底从透明区域自然透出。纯黑厚轮廓和鲜艳大色块容易压过文字。
- 建筑先抓可辨识结构，再加细节：古塔的逐层收分与层檐、寺院的中轴殿堂与院落、宫阙的台基与重檐。绘制概括性的原创古建意象，不把混合设计命名为某座真实文物，也不宣称准确朝代复原。
- 山川以远淡近浓、轮廓留白和短线皴纹形成深度。纹理密度应低于正文笔画；云气、水纹和松枝可以作为独立小配件。
- 轮廓、填色、纹理分层。细排线在大图可见，在小图缩放时不会成为主要识别条件；适合 160–400 px 点缀，也可放大到页面一侧作主体。
- 页内装饰不承载未经证实的史实。示例明确使用“原创装饰示意”，真实地标、文物或历史肖像仍需单独核验。

## 建议的资源结构

每个元素输出独立透明底 SVG：固定 `viewBox`，不添加全画布实色背景，不引用脚本、外链图片、网络字体或外部滤镜。提供 `<title>` 与 `<desc>`；作为纯装饰嵌入页面时由使用方设置 `aria-hidden="true"`。

使用可读且稳定的组名，例如 `pagoda-roofs`、`pagoda-body`、`temple-hall`、`palace-platform`、`mountain-far`、`mountain-near`、`clouds`、`pines`。组合进入同一 HTML 前给每个实例加 ID 前缀，避免 clipPath、pattern、gradient 等内部引用冲突。

牛皮纸预览和透明底导出分开；不要把纸纹烘焙进每个资源。可另提供纯墨线与淡彩两版，保持几何结构一致，后续只需要改色或切换纹理。所有噪声与路径扰动在生成时固定种子，导出结果可重复。

## 授权边界与访问结果

上表的 README、列出的图标源码、Rough.js 配置与随机数源码、MDN 文档源及六处项目相关许可证链接均成功读取。SVG.js 额外尝试的旧源码路径 `src/types/G.js` 返回 404，未把该路径作为证据；本文对 SVG.js 的判断仅据成功读取的 README 与许可证。

研究中没有引入第三方素材或复制代码，因此本轮演示资源不混入其许可证。未来若实际复用 MIT 或 Apache 项目代码，应保留对应版权、许可证及适用通知；未来若要收录 Remix 图标，需先按当前许可证核对资源库用途，不能把“网站可商用”扩大解释为“可以重新打包成素材库”。
