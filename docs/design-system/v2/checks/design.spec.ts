import { test, expect, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const screenshots = resolve('../screenshots-v2')
mkdirSync(screenshots, { recursive: true })
const pages = [
  'dashboard',
  'writing',
  'editor',
  'video',
  'insights',
  'ai-lab',
  'toolbox',
  'settings',
  'components',
]

async function ready(page: Page) {
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator('.page-content')).not.toBeEmpty()
  await expect(page.locator('.sidebar-nav .product-icon').first()).toHaveJSProperty(
    'tagName',
    'svg',
  )
}

test('all page designs render in both themes with local assets and no horizontal overflow', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`)
  })
  for (const theme of ['light', 'dark']) {
    for (const name of pages) {
      await page.goto(`/?page=${name}&theme=${theme}&state=ready`)
      await ready(page)
      await expect(page.locator('html')).toHaveClass(theme)
      await expect
        .poll(() =>
          page
            .locator('.page-scroll')
            .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
        )
        .toBe(true)
      await page.screenshot({ path: resolve(screenshots, `${name}-${theme}.png`) })
    }
  }
  expect(errors).toEqual([])
})

test('subscription validation preserves the form; nested Select closes before Modal and restores focus', async ({
  page,
}) => {
  await page.goto('/?page=ai-lab')
  const trigger = page.getByRole('button', { name: '添加订阅', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '添加订阅' })
  await dialog.getByRole('button', { name: '添加到预览' }).click()
  await expect(dialog.getByText('请输入订阅名称')).toBeVisible()
  await dialog.getByRole('textbox', { name: '订阅名称' }).fill('我的测试订阅')
  await dialog.getByRole('button', { name: '服务商' }).click()
  await expect(page.getByRole('listbox')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('listbox')).toBeHidden()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('textbox', { name: '订阅名称' })).toHaveValue('我的测试订阅')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  await trigger.click()
  await expect(dialog.getByRole('textbox', { name: '订阅名称' })).toHaveValue('')
  await dialog.getByRole('textbox', { name: '订阅名称' }).fill('我的测试订阅')
  await dialog.getByRole('button', { name: '添加到预览' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('我的测试订阅', { exact: true })).toBeVisible()
})

test('voiceover keeps text across modes, counts Unicode, cancels and retries an error', async ({
  page,
}) => {
  await page.goto('/?page=video&theme=dark')
  await page.getByRole('button', { name: 'AI Voiceover', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'AI Voiceover' })
  await page.screenshot({ path: resolve(screenshots, 'voiceover-preset-dark.png') })
  const text = dialog.getByRole('textbox', { name: '配音文案' })
  await text.fill('你好😀')
  await expect(dialog.getByText('3 / 300 字符', { exact: false })).toBeVisible()
  await dialog.getByText('声音克隆', { exact: true }).click()
  await expect(text).toHaveValue('你好😀')
  await expect(dialog.getByRole('radio', { name: '声音克隆', exact: true })).toBeChecked()
  await dialog.getByRole('button', { name: '克隆引擎' }).click()
  await page.getByRole('option', { name: 'Qwen3-TTS' }).click()
  await expect(page.getByRole('listbox')).toBeHidden()
  await expect(page.locator('[data-exiting="true"]')).toHaveCount(0)
  await page.screenshot({ path: resolve(screenshots, 'voiceover-clone-dark.png') })
  await text.fill('文'.repeat(301))
  await expect(dialog.getByRole('button', { name: '生成配音', exact: true })).toBeDisabled()
  await text.fill('这是一段设计演示文案。')
  await dialog.getByRole('button', { name: '生成配音', exact: true }).click()
  await dialog.getByRole('button', { name: '取消生成', exact: true }).click()
  await expect(dialog.getByText('任务已取消', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '预览失败' }).click()
  await expect(dialog.getByText('生成失败', { exact: true })).toBeVisible()
  await page.screenshot({ path: resolve(screenshots, 'voiceover-error-dark.png') })
  await dialog.getByRole('button', { name: '重试生成' }).click()
  await expect(dialog.getByText('生成流程演示完成', { exact: true })).toBeVisible()
  await expect(text).toHaveValue('这是一段设计演示文案。')
})

test('narrow layout, zoom equivalent, system theme and page states remain reachable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 900 })
  await page.goto('/?page=ai-lab&theme=light')
  await ready(page)
  await expect(page.locator('.app-sidebar')).toHaveCSS('width', '280px')
  await expect
    .poll(() =>
      page
        .locator('.page-scroll')
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    )
    .toBe(true)
  await page.screenshot({ path: resolve(screenshots, 'ai-lab-1024.png') })
  const columns = await page
    .locator('.lab-top')
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').map(parseFloat))
  expect(columns).toHaveLength(2)
  expect(columns[0] / columns[1]).toBeCloseTo(5 / 7, 1)
  await page.setViewportSize({ width: 720, height: 550 })
  await page.goto('/?page=video&theme=dark&dialog=voiceover')
  const dialog = page.getByRole('dialog', { name: 'AI Voiceover' })
  await expect(dialog.getByRole('button', { name: '生成配音', exact: true })).toBeInViewport()
  await page.screenshot({ path: resolve(screenshots, 'voiceover-zoom-equivalent.png') })
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/?page=ai-lab&theme=system&state=loading')
  await expect(page.locator('html')).toHaveClass('dark')
  await expect(page.getByRole('status', { name: '正在加载页面' })).toBeVisible()
  await page.screenshot({ path: resolve(screenshots, 'state-loading.png') })
  for (const state of ['empty', 'error', 'offline']) {
    await page.goto(`/?page=ai-lab&theme=light&state=${state}`)
    await ready(page)
    await page.screenshot({ path: resolve(screenshots, `state-${state}.png`) })
  }
})

test('upstream button dimensions and keyboard focus are preserved', async ({ page }) => {
  await page.goto('/?page=components')
  const button = page.getByTestId('baseline-button')
  await expect(button).toHaveCSS('height', '36px')
  await expect(button).toHaveCSS('border-radius', '24px')
  await page.getByRole('button', { name: '主要操作', exact: true }).focus()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: '次要操作', exact: true })).toBeFocused()
  await page.screenshot({ path: resolve(screenshots, 'components-keyboard-focus.png') })
  const notifications = page.getByRole('button', { name: '通知中心', exact: true })
  await page.mouse.move(300, 600)
  await notifications.hover()
  await expect(page.getByRole('tooltip', { name: '通知中心', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tooltip')).toBeHidden()
  await notifications.focus()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: '个人资料', exact: true })).toBeFocused()
  await expect(page.getByRole('tooltip', { name: '个人资料', exact: true })).toBeVisible()
})

test('project palette, built-in and approved icons, and existing desktop entries are preserved', async ({
  page,
}) => {
  for (const [theme, background, accent] of [
    ['light', 'rgb(249, 249, 255)', 'rgb(107, 56, 212)'],
    ['dark', 'rgb(21, 28, 39)', 'rgb(196, 175, 238)'],
  ]) {
    await page.goto(`/?page=components&theme=${theme}`)
    await expect(page.locator('body')).toHaveCSS('background-color', background)
    await expect(page.getByTestId('baseline-button')).toHaveCSS('background-color', accent)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible()
    await expect(page.locator('.global-search')).toBeVisible()
    await expect(page.locator('.sidebar-nav svg')).toHaveCount(6)
    expect(await page.locator('.new-project svg').getAttribute('viewBox')).toBe('0 0 16 16')
    const positions = await page.evaluate(() => ({
      search: document.querySelector('.global-search')!.getBoundingClientRect().left,
      actions: document.querySelector('.app-topbar > .action-row')!.getBoundingClientRect().left,
    }))
    expect(positions.search).toBeLessThan(positions.actions)
  }
})

test('voiceover preview task and draft survive closing the dialog and navigating away', async ({
  page,
}) => {
  await page.goto('/?page=video&dialog=voiceover')
  const dialog = page.getByRole('dialog', { name: 'AI Voiceover' })
  await dialog.getByRole('textbox', { name: '配音文案' }).fill('关闭弹窗后继续生成。')
  await dialog.getByRole('button', { name: '生成配音', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByText('AI Lab', { exact: true })
    .click()
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByText('Video Studio', { exact: true })
    .click()
  await page.getByRole('button', { name: 'AI Voiceover', exact: true }).click()
  await expect(dialog.getByText('生成流程演示完成', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('textbox', { name: '配音文案' })).toHaveValue(
    '关闭弹窗后继续生成。',
  )
})

test('low contrast custom primary warns without blocking save; invalid hex is rejected', async ({
  page,
}) => {
  await page.goto('/?page=settings&theme=light')
  const input = page.getByRole('textbox', { name: '界面主色' })
  const save = page.getByRole('button', { name: '保存预览主色' })
  await input.fill('#FFFF00')
  await expect(page.getByText('文字对比度不足', { exact: true })).toBeVisible()
  await expect(save).toBeEnabled()
  await save.click()
  await expect(page.getByRole('status')).toHaveText('预览主色已保存，刷新后恢复项目默认。')
  await page.mouse.move(300, 600)
  await expect(save).toHaveCSS('background-color', 'rgb(255, 255, 0)')
  await page.screenshot({ path: resolve(screenshots, 'settings-contrast-warning.png') })
  const themeOptions = page.getByRole('radiogroup', { name: '颜色模式' })
  await themeOptions.getByText('深色', { exact: true }).click()
  await expect(page.getByText('文字对比度不足', { exact: true })).toBeHidden()
  await expect(save).toHaveCSS('background-color', 'rgb(255, 255, 153)')
  await page.emulateMedia({ colorScheme: 'light' })
  await themeOptions.getByText('跟随系统', { exact: true }).click()
  await expect(page.getByText('文字对比度不足', { exact: true })).toBeVisible()
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.getByText('文字对比度不足', { exact: true })).toBeHidden()
  await themeOptions.getByText('浅色', { exact: true }).click()
  await input.fill('invalid')
  await expect(save).toBeDisabled()
  await page.getByRole('button', { name: '恢复项目默认' }).click()
  await expect(save).toHaveCSS('background-color', 'rgb(107, 56, 212)')
})
