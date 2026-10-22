const { readFileSync, writeFileSync, existsSync } = require('node:fs')
const { resolve, join } = require('node:path')

const root = resolve(__dirname, '..', 'docs', 'design-system')
const tokens = JSON.parse(readFileSync(join(root, 'tokens.json'), 'utf8'))
const definitions = JSON.parse(readFileSync(join(root, 'components.json'), 'utf8'))
const check = process.argv.includes('--check')
const lookup = (path) => {
  const value = path.split('.').reduce((current, key) => current?.[key], tokens)
  if (typeof value !== 'string') throw new Error(`Unknown token: ${path}`)
  return value
}
const interpolate = (value) => value.replace(/\{\{([\w.-]+)\}\}/g, (_, path) => lookup(path))
const flatten = (value, prefix = '') =>
  Object.entries(value).flatMap(([key, child]) => {
    const name = prefix ? `${prefix}-${key}` : key
    return typeof child === 'object' ? flatten(child, name) : [[name, child]]
  })
const required = [
  'button',
  'icon-button',
  'fab',
  'segmented',
  'button-group',
  'toolbar',
  'textfield',
  'textarea',
  'select',
  'combobox',
  'checkbox',
  'radio',
  'switch',
  'slider',
  'chips',
  'search',
  'date-picker',
  'time-picker',
  'color-picker',
  'upload',
  'card',
  'list',
  'table',
  'carousel',
  'divider',
  'tree',
  'chart',
  'appbar',
  'navigation-drawer',
  'navigation-rail',
  'navigation-bar',
  'tabs',
  'breadcrumb',
  'pagination',
  'dialog',
  'bottom-sheet',
  'side-sheet',
  'menu',
  'tooltip',
  'popover',
  'badge',
  'progress',
  'loading-indicator',
  'snackbar',
  'banner',
  'skeleton',
  'empty',
  'notification',
  'logo',
  'icon',
  'typography',
  'avatar',
  'rich-editor',
  'audio',
  'video',
  'split-pane',
  'stepper',
  'keyboard',
]
const identifiers = new Set(definitions.map((component) => component.id))
if (identifiers.size !== definitions.length) throw new Error('Duplicate component id')
for (const identifier of required)
  if (!identifiers.has(identifier)) throw new Error(`Missing component: ${identifier}`)
const lightKeys = Object.keys(tokens.color.light).sort()
if (JSON.stringify(lightKeys) !== JSON.stringify(Object.keys(tokens.color.dark).sort()))
  throw new Error('Theme roles differ')
const luminance = (hex) => {
  const channels = hex
    .slice(1)
    .match(/../g)
    .map((channel) => parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}
const contrast = (foreground, background) => {
  const levels = [luminance(foreground), luminance(background)].sort(
    (first, second) => second - first,
  )
  return (levels[0] + 0.05) / (levels[1] + 0.05)
}
const contrasts = []
for (const [theme, colors] of Object.entries(tokens.color)) {
  for (const [role, color] of Object.entries(colors))
    if (!/^#[\da-f]{6}$/i.test(color)) throw new Error(`Invalid color ${theme}.${role}`)
  for (const role of [
    'primary',
    'primary-container',
    'secondary',
    'secondary-container',
    'tertiary',
    'tertiary-container',
    'surface',
    'error',
    'error-container',
    'success',
    'success-container',
    'warning',
    'warning-container',
    'info',
    'info-container',
    'inverse-surface',
  ]) {
    const onRole = role === 'inverse-surface' ? 'inverse-on-surface' : `on-${role}`
    const ratio = contrast(colors[onRole], colors[role])
    if (ratio < 4.5)
      throw new Error(`Text contrast ${theme}.${onRole}/${role}: ${ratio.toFixed(2)}`)
    contrasts.push({ theme, pair: `${onRole} / ${role}`, ratio: Number(ratio.toFixed(2)) })
  }
  for (const background of ['surface', 'surface-lowest', 'surface-low']) {
    const ratio = contrast(colors['on-surface-variant'], colors[background])
    if (ratio < 4.5) throw new Error(`Secondary text contrast ${theme}.${background}`)
    contrasts.push({
      theme,
      pair: `on-surface-variant / ${background}`,
      ratio: Number(ratio.toFixed(2)),
    })
    if (contrast(colors.outline, colors[background]) < 3)
      throw new Error(`Control outline contrast ${theme}.${background}`)
    if (contrast(colors['control-border'], colors[background]) < 3)
      throw new Error(`Control border contrast ${theme}.${background}`)
  }
}
const components = definitions.map((component) => {
  for (const field of [
    'id',
    'name',
    'group',
    'status',
    'origin',
    'usage',
    'variants',
    'spec',
    'behavior',
  ])
    if (!component[field]) throw new Error(`Missing ${component.id}.${field}`)
  return {
    ...component,
    spec: Object.fromEntries(
      Object.entries(component.spec).map(([key, value]) => [key, interpolate(value)]),
    ),
    refs: [
      ...new Set(
        Object.values(component.spec)
          .join(' ')
          .match(/\{\{[\w.-]+\}\}/g) ?? [],
      ),
    ].map((value) => value.slice(2, -2)),
  }
})
const declarations = (entries) =>
  entries.map(([key, value]) => `  --md-${key}: ${value};`).join('\n')
const otherTokens = Object.fromEntries(
  Object.entries(tokens).filter(([key]) => !['version', 'name', 'reviewed', 'color'].includes(key)),
)
const css = `:root {\n${declarations([...flatten(otherTokens), ...flatten(tokens.color.light, 'color')])}\n  color-scheme: light;\n}\n[data-theme="dark"] {\n${declarations(flatten(tokens.color.dark, 'color'))}\n  color-scheme: dark;\n}\n`
const bundle = `window.MDDesign = ${JSON.stringify({ tokens, components, contrasts }, null, 2)};\n`
const catalog = `# 组件规格目录\n\n版本 ${tokens.version} · ${components.length} 类组件 · 由 scripts/design-system.cjs 生成。修改 components.json 与 tokens.json 后重新生成。\n\n所有组件继承 [全局状态、可访问性与变更流程](README.md)。状态“已有/局部”表示项目存在对应模式，不表示生产代码已符合当前版本。\n\n${components
  .map(
    (component) =>
      `## ${component.name}\n\n- 类别：${component.group}；来源：${component.origin}；项目情况：${component.status}\n- 使用：${component.usage}\n- 变体：${component.variants}\n\n| 规范项 | 数值 / 规则 |\n| --- | --- |\n${Object.entries(
        component.spec,
      )
        .map(([key, value]) => `| ${key} | ${value} |`)
        .join(
          '\n',
        )}\n\n交互：${component.behavior}\n\n令牌：${component.refs.map((ref) => `\`${ref}\``).join('、') || '组件专属参数见 components.json'}\n`,
  )
  .join('\n')}`
let stale = false
for (const [file, content] of [
  ['tokens.generated.css', css],
  ['system.generated.js', bundle],
  ['components.md', catalog],
]) {
  const path = join(root, file)
  if (check) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== content) {
      console.error(`Out of date: ${file}. Run npm run design:generate`)
      stale = true
    }
  } else writeFileSync(path, content)
}
if (stale) process.exitCode = 1
else
  console.log(
    `Design system ${tokens.version}: ${components.length} components; ${contrasts.length} text contrast pairs >= 4.5:1; theme roles, control outlines, token references and generated files OK.`,
  )
