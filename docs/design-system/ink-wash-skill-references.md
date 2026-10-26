# 水墨绘画 Skill 参考与本地实现取舍

研究日期：2026-10-26。本次只核对公开仓库的技能说明与参考文档，未复制第三方代码、滤镜或画面，也没有把外部运行时依赖加入项目。

## 直接相关的代码绘画 Skill

### 23ag1/ink-wash-painting-skill

- 仓库：[ink-wash-painting-skill](https://github.com/23ag1/ink-wash-painting-skill)，说明：[SKILL.md](https://raw.githubusercontent.com/23ag1/ink-wash-painting-skill/main/SKILL.md)。它是以 WebGL2、Canvas 和 GLSL 程序化绘制中国水墨的 Claude skill，明确把山水、塔、寺院和建筑作为可绘制对象。仓库 README 声明它是教学与渲染方法，不能把一个固定场景当成生成器。
- [composition.md](https://raw.githubusercontent.com/23ag1/ink-wash-painting-skill/main/references/composition.md) 建议墨灰、暖纸、远景蓝灰、近坡淡赭；饱和红只保留给一至三个印章或灯笼点。构图使用主宾、虚实、藏露和前中后景，避免等高山峰和规律排列。
- [materials.md](https://raw.githubusercontent.com/23ag1/ink-wash-painting-skill/main/references/materials.md) 把墨分为焦、浓、重、淡、清五个层次；湿墨负责宽阔的晕染，干墨负责清晰的皴线，并警告整幅统一 Gaussian blur 会变成“灰泥”。
- [brush.md](https://raw.githubusercontent.com/23ag1/ink-wash-painting-skill/main/references/brush.md) 将飞白解释为多根笔锋各自干涸的轨迹，而不是在一个色块上切白线；宽笔应有淡底和偏侧的暗芯，皴线应随地形、屋面或树干的方向变化。
- [motif-studies.md](https://raw.githubusercontent.com/23ag1/ink-wash-painting-skill/main/references/motif-studies.md) 对塔的结构给出可验证约束：先建立共同透视骨架；屋檐是带上翘檐角、脊线和檐下暗面的连续结构；每层约为下层 0.85 倍，屋顶约为 0.9 倍，细节不要铺满瓦片线。山体皴法应沿山势分布，不在山上贴几条平行长线。
- 仓库树列表没有返回许可证文件，不能直接把其 `kit/`、GLSL 或示例源码合入本项目。本项目只采用上述公开方法描述，当前 SVG/PNG 仍为独立原创实现。

### JimLiu/baoyu-skills 的 ink-brush 与 mono-ink

- [ink-brush.md](https://raw.githubusercontent.com/JimLiu/baoyu-skills/main/skills/baoyu-comic/references/art-styles/ink-brush.md) 适合做风格词汇参考：动态粗细、墨洗、飞白、有限朱砂/金色点缀、雾中分层和负空间。它是图像生成/漫画技能的风格参考，不是 SVG 渲染实现。
- [mono-ink.md](https://raw.githubusercontent.com/JimLiu/baoyu-skills/main/skills/baoyu-article-illustrator/references/palettes/mono-ink.md) 强调结构使用近黑墨，颜色只承担语义强调。与本项目牛皮纸底不直接照搬；这里将其限制转译为低饱和赭石，保留朱砂只作印章或重点。
- 仓库许可证：[LICENSE](https://raw.githubusercontent.com/JimLiu/baoyu-skills/main/LICENSE)。本项目没有复制这些提示词或资源。

### saoxxWeb/ink-wash-style 与 augchan42/inkstone

- [ink-wash-style/SKILL.md](https://raw.githubusercontent.com/saoxxWeb/ink-wash-style/main/SKILL.md) 主要是上传图片的整图水墨转换器，区分写实彩墨、写意、工笔等模式，并建议彩墨使用石青/石绿/赭石的低饱和组合。它需要图像生成后端，不适合替代当前透明 SVG 资产管线。许可证为 [MIT](https://raw.githubusercontent.com/saoxxWeb/ink-wash-style/main/LICENSE)。
- [inkstone/verse-to-prompt](https://raw.githubusercontent.com/augchan42/inkstone/main/skills/verse-to-prompt/SKILL.md) 是把古诗转成水墨图像提示词，建议用前景/中景/远景、垂直或对角线和一个暖色点。它是提示词工作流，不提供本项目需要的矢量分组或透明导出。

## 对本批素材的具体改进

1. 山体先用三层不同墨度的宽湿笔建立主峰、陪峰和留白，再把皴线限制为短段，并沿山面方向分布；远山不加清晰长线，近山才保留少量枯笔。
2. 塔先修正结构：缩小上层比例，统一每层中轴与檐口透视，给檐下加入一块很薄的暗部，墙体以淡墨留白，不再使用连续厚黑檐板。
3. 色板从单一灰绿改成暖纸 `#dfc69c`、远景蓝灰 `#687277`、中景墨灰 `#4b514b`、近景焦墨 `#252c29`，朱砂 `#8c4836` 只用于印章和一个小重点。所有色彩保持低饱和，避免把牛皮纸背景染成同一块灰。
4. 审查顺序按 Skill 的建议执行：缩略图先看构图与虚实，再看塔的结构连接，最后才检查皴线和飞白；每次只改一项，避免再次用模糊滤镜掩盖结构问题。

这些参考支持“墨块、干湿、结构、留白”的方向，但不能证明当前 SVG 滤镜等同真实宣纸；SVG 仍属于可缩放的近似表达，后续若需要更接近写实水墨，应另做 WebGL/Canvas 渲染版本并保留静态 PNG 导出。
