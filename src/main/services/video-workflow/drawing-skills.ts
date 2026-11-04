import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function drawingSkillContext(prompt: string, roots?: string[]): string {
  if (!/\bchinese-ink-elements\b/i.test(prompt)) return ''
  const directories = roots ?? [
    join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'skills'),
    join(homedir(), '.codex', 'skills'),
    join(homedir(), '.agents', 'skills'),
    join(homedir(), '.claude', 'skills'),
  ]
  const directory = directories
    .map((root) => join(root, 'chinese-ink-elements'))
    .find((path) => existsSync(join(path, 'SKILL.md')))
  if (!directory)
    throw new Error(
      '未找到用户指定的 chinese-ink-elements 绘画技能，请安装该技能后重试；原分镜已保留',
    )
  const files = [
    'SKILL.md',
    ...[
      'style-system',
      'figure-painting',
      'motif-recipes',
      'objects-and-materials',
      'living-animals',
      'craft-and-constructed-scenes',
      'quality-review',
    ].map((name) => `references/${name}.md`),
  ]
  const documents = files.map((file) => {
    const path = join(directory, file)
    if (!existsSync(path) || !statSync(path).isFile() || statSync(path).size > 256000)
      throw new Error(`绘画技能 chinese-ink-elements 不完整或文件过大：${file}；原分镜已保留`)
    const content = readFileSync(path, 'utf8').trim()
    if (!content)
      throw new Error(`绘画技能 chinese-ink-elements 不完整：${file} 为空；原分镜已保留`)
    return `--- ${file} ---\n${content}`
  })
  return `宿主已加载用户明确指定的绘画技能 chinese-ink-elements 及绘画参考正文，以下是本次创作必须采用的画法依据，不是只供检索的技能名称。
人物先建立头颅、颈肩、躯干、关节与手和器物的接触，再处理衣纹、五官与笔墨。用有转面的墨块、局部淡染、收锋衣纹、山石短皴与前后遮挡表达形体；不得用低多边形或几何色块拼人、几根短线画脸、三角山和直杆柳枝代替完成的水墨人物与山水，也不得仅换成牛皮纸底就声称遵循技能。不能靠堆叠路径数量、滤镜或噪点证明画质。
逐个人物先安排头胸骨盆朝向与承重脚，再建立肩、肘、腕、髋、膝、踝的连续结构；坐姿、跪姿同样需要完整的近远侧四肢。可见部分必须实际绘制；遮挡部分须能从前后关系读出连接，不得用长袖、衣摆、画外裁切或器物掩盖缺失的四肢。手掌、拇指根、其余手指的屈伸与指节依动作塑造；托碗时掌指接住碗底，递碗时有抓持或承托，不能悬空，也不能画成长条或叉子。
脸部逐人设计眉眼、鼻翼、口唇、耳廓、下颌与发际，遵循同一头颅透视；近远眼同步转动，鼻轮廓与鼻底不能各画一套，眼睛看向动作对象。年龄差异通过面骨、眼睑、颈背、皮肤与发束共同表达，不能用同脸换发色代替。脸和手保留足够画面占比与清晰度，不能缩小成无五官图标。
把人物、每侧手臂、每侧腿脚、手、头脸和器物分组建立轮廓与遮挡，再画衣褶、材质和局部笔墨；衣纹随肩肘、腰膝受力，避免平行等宽装饰线。先完成主角的结构与细节再铺背景，不能为了填满多镜而把所有人物降级为剪影或简笔符号。输出前对照上述结构复查源码，但源码复查不等于实际视觉验收。
以自包含内联 SVG 分组绘画，保留可编辑的人物、衣纹、手、器物、山水与 MG 目标；系统字体与叙事内容沿用宿主约束。用户没有选择生图模型时不调用图片模型。技能中的独立素材导出、脚本运行、浏览器及视觉复核步骤在本次非交互任务中由宿主管理，不执行文件写入或外部工具，不得声称已完成视觉验收，实际画面由用户审核。
${documents.join('\n\n')}`
}
