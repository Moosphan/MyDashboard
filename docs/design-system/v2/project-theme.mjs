import { readFileSync } from 'node:fs'

export const themeSources = [
  new URL('../../../src/renderer/styles/globals.css', import.meta.url),
  new URL('../../../src/renderer/stores/settingsStore.ts', import.meta.url),
]

export function projectThemeCss() {
  const paletteSource = readFileSync(themeSources[0], 'utf8')
  const settingsSource = readFileSync(themeSources[1], 'utf8')
  const primaryHex = settingsSource.match(
    /const defaultTheme:[\s\S]*?primaryColor:\s*'(#[\da-f]{6})'/i,
  )?.[1]
  if (!primaryHex) throw new Error('Cannot resolve the existing default primary color')
  const primary = primaryHex
    .slice(1)
    .match(/../g)
    .map((channel) => parseInt(channel, 16))
  const lighten = (amount) =>
    primary.map((channel) => Math.round(channel + (255 - channel) * amount)).join(' ')
  const darken = (amount) => primary.map((channel) => Math.round(channel * (1 - amount))).join(' ')
  const roles = {
    background: 'background',
    foreground: 'on-surface',
    surface: 'surface-container-lowest',
    'surface-foreground': 'on-surface',
    'surface-secondary': 'surface-container-low',
    'surface-secondary-foreground': 'on-surface',
    'surface-tertiary': 'surface-container',
    'surface-tertiary-foreground': 'on-surface',
    overlay: 'surface-container-lowest',
    'overlay-foreground': 'on-surface',
    default: 'surface-container',
    'default-foreground': 'on-surface',
    muted: 'on-surface-variant',
    accent: 'primary',
    'accent-foreground': 'on-primary',
    'accent-soft': 'primary-fixed',
    'accent-soft-foreground': 'on-primary-fixed-variant',
    focus: 'primary',
    border: 'outline-variant',
    separator: 'outline-variant',
    'field-background': 'surface-container-lowest',
    'field-foreground': 'on-surface',
    'field-placeholder': 'on-surface-variant',
    'field-border': 'outline-variant',
    segment: 'surface-container-high',
    'segment-foreground': 'on-surface',
    warning: 'secondary-container',
    'warning-foreground': 'on-secondary-container',
    danger: 'error',
    'danger-foreground': 'on-error',
  }
  return ['light', 'dark']
    .map((mode) => {
      const block = paletteSource.match(
        mode === 'light' ? /:root\s*{([^}]+)}/ : /\.dark\s*{([^}]+)}/,
      )?.[1]
      if (!block) throw new Error(`Cannot resolve the existing ${mode} palette`)
      const palette = Object.fromEntries(
        [...block.matchAll(/--color-([\w-]+):\s*(\d+\s+\d+\s+\d+)\s*;/g)].map((match) => [
          match[1],
          match[2],
        ]),
      )
      Object.assign(
        palette,
        mode === 'light'
          ? {
              primary: primary.join(' '),
              'on-primary': '255 255 255',
              'primary-fixed': lighten(0.85),
              'on-primary-fixed-variant': darken(0.5),
            }
          : {
              primary: lighten(0.6),
              'on-primary': darken(0.8),
              'primary-fixed': darken(0.4),
              'on-primary-fixed-variant': lighten(0.85),
            },
      )
      const declarations = Object.entries(roles).map(([role, source]) => {
        if (!palette[source]) throw new Error(`Missing project palette role: ${source}`)
        return `  --${role}: rgb(${palette[source]});`
      })
      declarations.push(
        `  --md-theme-sidebar: rgb(${palette[mode === 'light' ? 'surface-container-low' : 'surface-dim']});`,
      )
      declarations.push(`  --md-theme-secondary: rgb(${palette['secondary-container']});`)
      declarations.push(`  --md-theme-on-secondary: rgb(${palette['on-secondary-container']});`)
      return `:root.${mode} {\n${declarations.join('\n')}\n}`
    })
    .join('\n')
}
