const assert = require('node:assert/strict')
const { readFileSync, readdirSync } = require('node:fs')
const { resolve, join } = require('node:path')
const { createRequire } = require('node:module')

const root = resolve(__dirname, '..')
const designRoot = join(root, 'docs/design-system')
const workbench = join(designRoot, 'v2')
const read = (path) => readFileSync(join(root, path), 'utf8')
const manifest = JSON.parse(readFileSync(join(workbench, 'package.json'), 'utf8'))
const tokens = JSON.parse(readFileSync(join(workbench, 'layout.json'), 'utf8'))
const localRequire = createRequire(join(workbench, 'package.json'))
const ts = localRequire('typescript')

for (const file of [
  'README.md',
  'spec-v2.md',
  'page-specs-v2.md',
  'migration.md',
  'verification-v2.md',
  'v2/README.md',
]) {
  assert.ok(
    readFileSync(join(designRoot, file), 'utf8').includes('2.0'),
    `${file}: missing current version`,
  )
}
for (const file of ['AGENTS.md', 'src/renderer/AGENTS.md', 'docs/design-guidelines.md']) {
  assert.ok(read(file).includes('spec-v2.md'), `${file}: missing authoritative contract`)
}
for (const packageName of ['@heroui/react', '@heroui/styles']) {
  assert.equal(
    manifest.dependencies[packageName],
    '3.2.6',
    `${packageName}: exact baseline required`,
  )
}
for (const dependencies of [manifest.dependencies, manifest.devDependencies]) {
  for (const [name, version] of Object.entries(dependencies)) {
    assert.match(version, /^\d+\.\d+\.\d+$/, `${name}: use an exact version`)
  }
}
assert.equal(manifest.dependencies.react, manifest.dependencies['react-dom'])
assert.equal(manifest.dependencies['@heroicons/react'], '2.2.0')
assert.match(manifest.dependencies.react, /^19\./)
assert.match(manifest.devDependencies.tailwindcss, /^4\./)
assert.equal(manifest.devDependencies.tailwindcss, manifest.devDependencies['@tailwindcss/vite'])
assert.equal(tokens.version, '2.0.0')
assert.deepEqual(Object.keys(tokens).sort(), ['layout', 'version'])
for (const [name, value] of Object.entries(tokens.layout)) {
  assert.match(value, /^\d+px$/, `${name}: only project layout dimensions belong here`)
}
assert.equal(tokens.layout.sidebar, '280px')
assert.equal(tokens.layout['page-padding'], '48px')
assert.equal(tokens.layout['page-max'], '1280px')
const lock = readFileSync(join(workbench, 'pnpm-lock.yaml'), 'utf8')
assert.ok(
  lock.includes('3.2.6') && lock.includes(manifest.dependencies.react),
  'Lockfile missing baseline versions',
)
const css = readFileSync(join(workbench, 'src/theme.css'), 'utf8')
assert.ok(
  css.indexOf("@import 'tailwindcss'") < css.indexOf("@import '@heroui/styles'"),
  'Import Tailwind before HeroUI',
)
assert.doesNotMatch(
  css,
  /--(?:accent|background|foreground|surface|radius|field|color|font|shadow|spacing)[\w-]*\s*:/,
  'Upstream token override',
)
assert.doesNotMatch(css, /#[\da-f]{3,8}\b|\brgba?\(|\boklch\(/i, 'Use upstream semantic colors')
assert.doesNotMatch(
  css,
  /\.(?:button|input|select|checkbox|radio|switch|slider|tabs|modal|card)(?:\b|__|--)[^{]*\{/,
  'Upstream component selector override',
)
assert.doesNotMatch(css, /!important/, 'Avoid specificity overrides')
const themeAdapter = readFileSync(join(workbench, 'project-theme.mjs'), 'utf8')
assert.ok(
  themeAdapter.includes('src/renderer/styles/globals.css'),
  'Read the existing project palette',
)
assert.ok(
  themeAdapter.includes('src/renderer/stores/settingsStore.ts'),
  'Read the existing primary color',
)
assert.doesNotMatch(themeAdapter, /#[\da-f]{6}\b/i, 'Do not copy a separate project palette')
const icons = readFileSync(join(workbench, 'src/icons.tsx'), 'utf8')
assert.ok(icons.includes("from '@heroui/react'"), 'Use built-in HeroUI icons first')
assert.ok(
  icons.includes("from '@heroicons/react/24/outline'"),
  'Use the approved business icon supplement',
)
assert.doesNotMatch(
  css + icons,
  /Material Symbols|woff2|material-symbols/,
  'Retire the previous icon source in new designs',
)
const appearance =
  /(?:^|\s)(?:[\w-]+:)*(?:rounded|shadow|bg|border|p[xytrbl]?|h|min-h|max-h|text|font)-/
const sourceFiles = readdirSync(join(workbench, 'src')).filter((file) => file.endsWith('.tsx'))
for (const file of sourceFiles) {
  const content = readFileSync(join(workbench, 'src', file), 'utf8')
  assert.doesNotMatch(
    content,
    /HeroUIProvider|@heroui\/theme|tokens\.generated|legacy-theme|Material Symbols|material-symbols/,
    `${file}: legacy UI dependency`,
  )
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source)
      const libraryComponent =
        /^(?:Button|Card|Input|TextArea|Select|Checkbox|Radio|Switch|Slider|Tabs|Modal|Chip|ProgressBar)(?:\.|$)/.test(
          tag,
        )
      if (libraryComponent) {
        for (const attribute of node.attributes.properties) {
          if (!ts.isJsxAttribute(attribute)) continue
          const name = attribute.name.getText(source)
          assert.notEqual(name, 'style', `${file}: inline style on ${tag}`)
          if (name === 'className' && attribute.initializer) {
            assert.ok(
              !appearance.test(attribute.initializer.getText(source).replace(/["'{}]/g, '')),
              `${file}: appearance utility on ${tag}`,
            )
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}
console.log(
  'Design 2.0 contract passed: entry points, layout source, pinned versions and workbench style boundaries.',
)
console.log(
  'Scope: design assets only; production UI, Electron compatibility and complete accessibility require separate verification.',
)
