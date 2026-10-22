;(() => {
  'use strict'
  const { tokens, components, contrasts } = window.MDDesign
  const root = document.documentElement
  const escape = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (character) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
    )
  const icon = (name) => `<span class="sym" aria-hidden="true">${escape(name)}</span>`
  const action = (label, variant = 'tonal', extra = '') =>
    `<button class="btn ${variant}" ${extra}>${label}</button>`
  const iconAction = (name, label, extra = '') => {
    const classes = extra.match(/class="([^"]*)"/)?.[1] || ''
    return `<button class="btn icon-btn ${classes}" aria-label="${escape(label)}" data-tooltip="${escape(label)}" ${extra.replace(/class="[^"]*"/, '')}>${icon(name)}</button>`
  }
  const badge = (label, tone = 'neutral') => `<span class="badge ${tone}">${escape(label)}</span>`
  const themeValue = () => root.dataset.theme || 'light'
  let toastTimer
  let toastRemaining = 5000
  let toastStarted = 0
  const closeToast = () => {
    clearTimeout(toastTimer)
    document.getElementById('snackbar').hidden = true
  }
  const resumeToast = () => {
    toastStarted = Date.now()
    clearTimeout(toastTimer)
    toastTimer = setTimeout(closeToast, Math.max(100, toastRemaining))
  }
  const pauseToast = () => {
    clearTimeout(toastTimer)
    toastRemaining = Math.max(100, toastRemaining - (Date.now() - toastStarted))
  }
  function toast(message) {
    const element = document.getElementById('snackbar')
    if (!element) return
    element.innerHTML = `<span>${escape(message)}</span>${iconAction('close', '关闭消息', 'data-close-toast')}`
    element.hidden = false
    toastRemaining = 5000
    resumeToast()
  }
  const toastElement = document.getElementById('snackbar')
  toastElement?.addEventListener('mouseenter', pauseToast)
  toastElement?.addEventListener('mouseleave', resumeToast)
  toastElement?.addEventListener('focusin', pauseToast)
  toastElement?.addEventListener('focusout', resumeToast)
  const dialog = document.getElementById('demo-dialog')
  function openDialog(kind = 'dialog') {
    dialog.classList.remove('sheet-right', 'sheet-bottom')
    if (document.body.dataset.page !== 'ai-lab') {
      const titles = {
        'bottom-sheet': '选择导出方式',
        'side-sheet': '任务详情',
        notification: '通知中心',
        popover: '筛选设置',
        dialog: '保存工作区设置',
        fab: '新建内容',
      }
      document.getElementById('demo-dialog-title').textContent = titles[kind] || '保存工作区设置'
      dialog.setAttribute('aria-labelledby', 'demo-dialog-title')
      if (kind === 'bottom-sheet') dialog.classList.add('sheet-bottom')
      if (['side-sheet', 'notification'].includes(kind)) dialog.classList.add('sheet-right')
      document.getElementById('demo-dialog-body').innerHTML =
        kind === 'notification'
          ? `<ul class="mini-list"><li>${icon('check_circle')}<div>配音已生成<small>刚刚 · 可前往素材库试听</small></div></li><li>${icon('sync')}<div>用量已同步<small>2分钟前 · 示例数据</small></div></li></ul>`
          : `<p class="muted">这是交互与外观演示。${kind === 'popover' ? '正式 Popover 应锚定触发器，此处用聚焦弹层演示表单内容。' : '关闭后焦点返回触发按钮，不会修改实际项目数据。'}</p><div class="form-stack"><label class="field-label">显示名称<input class="field" value="我的工作区"></label><label class="choice"><input type="checkbox" checked>保留当前偏好</label></div>`
    }
    window.MDControls.enhance(dialog)
    dialog.showModal()
  }
  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) {
      const bounds = dialog.getBoundingClientRect()
      if (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      )
        dialog.close()
    }
  })
  dialog?.addEventListener('close', () => {
    if (dialog.returnValue === 'confirm') toast('设置已保存 · 仅为设计演示')
  })
  function syncFrame() {
    document
      .getElementById('ai-frame')
      ?.contentWindow?.postMessage(
        { type: 'md-design-theme', theme: themeValue(), density: root.dataset.density },
        '*',
      )
  }
  function setTheme(theme) {
    root.dataset.theme = theme
    document.querySelectorAll('[data-theme-control], #theme-toggle').forEach((button) => {
      const label = theme === 'light' ? '切换到深色主题' : '切换到浅色主题'
      button.setAttribute('aria-label', label)
      button.setAttribute('data-tooltip', label)
      button.innerHTML = icon(theme === 'light' ? 'dark_mode' : 'light_mode')
    })
    updatePalette()
    updateSpecimenLabels()
    syncFrame()
  }
  const sampleAudio = () =>
    `<div class="demo-audio"><div class="row">${action(icon('play_arrow'), 'filled icon-btn', 'data-play-audio aria-label="播放演示提示音"')}<input class="range" type="range" min="0" max="2" step="0.01" value="0" aria-label="演示提示音进度"><span class="muted audio-time">0:00 / 0:02</span><audio hidden></audio></div><p class="muted">本地合成提示音 · 2秒 · 用于验证播放器交互</p></div>`
  const templates = {
    button: () =>
      '<div><span class="demo-section-label">常用操作 / Actions</span><div class="demo-row">' +
      action(icon('add') + '创建项目', 'filled', 'data-demo="创建项目"') +
      action('导出', 'outlined', 'data-demo="导出"') +
      action('保存草稿', 'neutral', 'data-demo="保存草稿"') +
      action('取消', 'text', 'data-demo="取消"') +
      '</div></div><div><span class="demo-section-label">补充变体 / Supporting</span><div class="demo-row">' +
      action('品牌次要', 'tonal', 'data-demo="品牌次要动作"') +
      action(icon('delete') + '删除', 'danger', 'data-demo="删除"') +
      action('处理中', 'neutral', 'disabled') +
      '</div></div>',
    'icon-button': () =>
      `<div class="demo-row">${iconAction('refresh', '刷新', 'data-demo="刷新"')}${action(icon('play_arrow'), 'filled icon-btn', 'aria-label="播放" data-demo="播放"')}${action(icon('favorite'), 'tonal icon-btn', 'aria-label="收藏" aria-pressed="true" data-toggle')}${action(icon('close'), 'outlined icon-btn', 'aria-label="关闭" data-demo="关闭"')}</div>`,
    fab: () =>
      `<div class="demo-row"><button class="fab" data-open="fab" aria-label="新建">${icon('add')}</button><button class="fab extended" data-open="fab">${icon('add')}新建内容</button></div>`,
    segmented: () =>
      `<div class="segments" data-segments aria-label="视图选择"><button class="segment selected" aria-pressed="true">${icon('view_module')} 网格</button><button class="segment" aria-pressed="false">${icon('view_list')} 列表</button></div><p class="muted">同一数据切换视图，保持内容与选中状态。</p>`,
    'button-group': () =>
      `<div class="segments connected">${action('导出 WAV', 'filled', 'data-demo="导出WAV"')}${action(icon('expand_more'), 'filled', 'aria-label="其他导出格式" data-open="bottom-sheet"')}</div><p class="muted">默认动作与菜单入口分别可聚焦。</p>`,
    toolbar: () =>
      `<div class="mini-toolbar" role="toolbar" aria-label="编辑工具栏">${iconAction('format_bold', '加粗', 'aria-pressed="false" data-toggle')}${iconAction('format_italic', '斜体', 'aria-pressed="false" data-toggle')}<span class="divider-v" aria-hidden="true"></span>${iconAction('link', '插入链接', 'data-demo="插入链接"')}${iconAction('image', '插入图片', 'data-demo="插入图片"')}${iconAction('undo', '撤销', 'data-demo="撤销"')}</div>`,
    textfield: () =>
      '<label class="field-label">项目名称<input class="field" value="MyDashboard 发布计划" aria-describedby="field-help"></label><span id="field-help" class="help">用于工作区、导出文件与分享标题。</span><label class="field-label">项目链接<input class="field" value="example" aria-invalid="true" aria-describedby="field-error"></label><span class="help error-text" id="field-error">请输入完整的 https:// 链接</span>',
    textarea: () =>
      `<label class="field-label">配音文案<textarea class="field" maxlength="300" data-counter>让熟悉的声音，讲述每一次灵感。</textarea></label><span class="help counter" aria-live="polite">18 / 300</span>`,
    select: () =>
      '<div class="form-pair"><label class="field-label">克隆引擎<select class="field"><option>VoxCPM2</option><option>Qwen3-TTS</option><option>Edge TTS</option><option disabled>更多引擎 · 即将支持</option></select></label><label class="field-label">我的音色<select class="field"><option>发布演示 · 男声</option><option>温暖自然 · 女声</option></select></label></div><p class="muted">统一浮层与选中标记；方向键浏览、Enter确认、Escape收起。</p>',
    combobox: () =>
      `<label class="field-label">搜索模型<input class="field" list="model-list" placeholder="输入 Qwen 或 Vox"><datalist id="model-list"><option value="Qwen3-TTS"><option value="VoxCPM2"><option value="Edge TTS"></datalist></label><p class="muted">输入筛选模型；方向键浏览，Enter选择；支持无结果反馈。</p>`,
    checkbox: () =>
      `<label class="choice"><input type="checkbox" checked>任务完成后发送通知</label><label class="choice"><input type="checkbox">自动添加到时间线</label><label class="choice"><input type="checkbox" data-indeterminate>部分素材已选中</label><label class="choice"><input type="checkbox" disabled>不可用的选项</label>`,
    radio: () =>
      `<div role="radiogroup" aria-label="配音方式" class="demo-row"><label class="choice"><input type="radio" name="voice-mode" value="preset" checked>预设音色</label><label class="choice"><input type="radio" name="voice-mode" value="clone">声音克隆</label></div>`,
    switch: () =>
      '<label class="row switch-row" style="justify-content:space-between"><span>自动保存<span class="switch-description">编辑内容会保留在本地</span></span><input class="switch" type="checkbox" role="switch" aria-label="自动保存" checked></label><label class="row switch-row" style="justify-content:space-between"><span>后台通知<span class="switch-description">任务完成后显示桌面提示</span></span><input class="switch" type="checkbox" role="switch" aria-label="后台通知"></label>',
    slider: () =>
      '<label class="field-label">语速<span class="row"><input class="range" type="range" min="-50" max="50" value="0" aria-label="语速" aria-valuetext="0%" data-unit="%"><output class="range-value">0%</output></span></label><label class="field-label">音量<span class="row"><input class="range" type="range" min="0" max="100" value="72" aria-label="音量" aria-valuetext="72%" data-unit="%"><output class="range-value">72%</output></span></label>',
    chips: () =>
      `<div class="demo-row"><button class="chip selected" aria-pressed="true" data-toggle>${icon('check')}精细 · 20步</button><button class="chip" aria-pressed="false" data-toggle>快速 · 10步</button><button class="chip" data-demo="导入参考">${icon('upload')}导入参考</button><button class="chip" data-remove>中文${icon('close')}</button></div>`,
    search: () =>
      `<label class="search-field">${icon('search')}<input placeholder="搜索工具、文档、任务" aria-label="搜索演示"><kbd>⌘ K</kbd></label><p class="muted">全局搜索快捷键；组件库顶部搜索可实际过滤组件。</p>`,
    'date-picker': () =>
      `<label class="field-label">下次续费日期<input class="field" type="date" value="2026-11-01"></label><p class="muted">统一日历浮层，支持手输；方向键移日，PageUp / Down翻月。</p>`,
    'time-picker': () =>
      `<label class="field-label">提醒时间<input class="field" type="time" value="09:30"></label><p class="muted">24小时制 · Asia/Shanghai；快捷选项每30分钟，手输精确到分钟。</p>`,
    'color-picker': () =>
      `<div class="color-dots"><button style="background:var(--md-color-primary)" aria-label="选择紫色" aria-pressed="false" data-color-choice="primary"></button><button style="background:var(--md-color-info)" aria-label="选择蓝色" aria-pressed="false" data-color-choice="info"></button><button style="background:var(--md-color-success)" aria-label="选择绿色" aria-pressed="false" data-color-choice="success"></button></div><label class="field-label">自定义颜色<input type="color" value="#6b38d4" class="field" aria-label="自定义颜色"></label>`,
    upload: () =>
      `<label class="dropzone">${icon('upload_file')}<strong>选择参考录音</strong><span class="muted">M4A / WAV / MP3 · 本地预览，不上传</span><input type="file" accept="audio/*" aria-label="选择参考录音" data-file-input></label><span class="help" data-file-name>选择文件后在这里显示名称。</span>`,
    card: () =>
      `<div class="mini-card"><div class="row">${icon('science')}<h3>AI Lab</h3></div><p class="muted">管理订阅、查看用量，进入常用AI工具。</p>${action('打开工作台', 'tonal', 'data-demo="打开工作台"')}</div>`,
    list: () =>
      `<ul class="mini-list"><li>${icon('graphic_eq')}<div>发布演示配音<small>WAV · 00:45 · 刚刚生成</small></div>${iconAction('more_horiz', '配音更多操作', 'data-demo="更多操作"')}</li><li>${icon('article')}<div>产品介绍文案<small>草稿 · 2分钟前更新</small></div></li></ul>`,
    table: () =>
      `<table class="mini-table"><thead><tr><th scope="col">服务</th><th scope="col">状态</th><th scope="col" class="amount">月费用</th></tr></thead><tbody><tr><td>OpenAI Plus</td><td>${badge('运行正常', 'success')}</td><td class="amount">$20.00</td></tr><tr><td>Claude Pro</td><td>${badge('即将续费', 'warning')}</td><td class="amount">$20.00</td></tr></tbody></table>`,
    carousel: () =>
      `<div class="row">${iconAction('chevron_left', '上一项', 'data-carousel="-1"')}<div class="mini-card" data-carousel-content style="flex:1;text-align:center">封面 1 / 3<br><span class="muted">产品发布 · 16:9</span></div>${iconAction('chevron_right', '下一项', 'data-carousel="1"')}</div>`,
    divider: () =>
      `<p>当前任务</p><hr style="width:100%;border:0;border-top:1px solid var(--md-color-outline-variant)"><p class="muted">历史任务 · 按组划分信息</p>`,
    tree: () =>
      `<details open><summary>${icon('folder')} 发布项目</summary><div style="padding-left:16px"><details open><summary>${icon('folder')} 音频</summary><p style="padding:8px 0 8px 16px">${icon('audio_file')} 配音.wav</p></details><p>${icon('description')} 发布文案.md</p></div></details>`,
    chart: () =>
      `<div class="row" style="justify-content:space-between"><h3>近7天用量</h3><span class="muted">示例 / M Tokens</span></div><div class="chart-bars" role="img" aria-label="7天用量依次为3、5、4、8、6、9、7百万Tokens">${[30, 50, 40, 80, 60, 90, 70].map((height) => `<span class="chart-bar" style="height:${height}%"></span>`).join('')}</div><div class="chart-ticks"><span>10/15</span><span>10/21</span></div>`,
    appbar: () =>
      `<div class="mini-appbar">${iconAction('menu', '打开导航', 'data-demo="打开导航"')}<strong>工作空间</strong>${iconAction('search', '搜索', 'data-demo="搜索"')}${iconAction('more_vert', '更多', 'data-demo="更多"')}</div>`,
    'navigation-drawer': () =>
      `<nav class="mini-nav" aria-label="模块示例"><a class="btn tonal" href="#ai-lab" aria-current="page">${icon('science')}AI Lab</a><button class="btn" data-demo="Writing">${icon('edit_note')}Writing</button><button class="btn" data-demo="Video">${icon('movie')}Video</button></nav>`,
    'navigation-rail': () =>
      `<div class="mini-rail">${[
        ['dashboard', '概览'],
        ['science', '实验室'],
        ['settings', '设置'],
      ]
        .map(
          ([name, label], index) =>
            `<button class="nav-destination ${index === 1 ? 'active' : ''}" data-demo="${label}">${icon(name)}<span>${label}</span></button>`,
        )
        .join('')}</div>`,
    'navigation-bar': () =>
      `<div class="mini-bottom-nav">${[
        ['dashboard', '概览'],
        ['science', 'AI Lab'],
        ['folder', '素材'],
      ]
        .map(
          ([name, label], index) =>
            `<button class="nav-destination ${index === 1 ? 'active' : ''}" data-demo="${label}">${icon(name)}<span>${label}</span></button>`,
        )
        .join('')}</div>`,
    tabs: () =>
      `<div class="tabs-demo" role="tablist" aria-label="音频工作区"><button role="tab" id="sample-tab-compose" aria-controls="sample-tab-panel" aria-selected="true">配音</button><button role="tab" id="sample-tab-profiles" aria-controls="sample-tab-panel" aria-selected="false" tabindex="-1">我的音色</button><button role="tab" id="sample-tab-models" aria-controls="sample-tab-panel" aria-selected="false" tabindex="-1">本地模型</button></div><p id="sample-tab-panel" class="muted" role="tabpanel" aria-labelledby="sample-tab-compose">配音内容区域</p>`,
    breadcrumb: () =>
      `<nav aria-label="示例面包屑" class="row"><a href="#components">组件</a>${icon('chevron_right')}<a href="#ai-lab">AI Lab</a>${icon('chevron_right')}<span aria-current="page">订阅</span></nav>`,
    pagination: () =>
      `<nav class="demo-row" aria-label="分页示例">${iconAction('chevron_left', '上一页', 'disabled')}${action('1', 'tonal', 'aria-current="page" data-page-button')}${action('2', '', 'data-page-button')}${action('3', '', 'data-page-button')}${iconAction('chevron_right', '下一页', 'data-demo="下一页"')}</nav><span class="muted">共24条 · 每页8条</span>`,
    dialog: () =>
      `<div class="mini-card"><h3>保存更改？</h3><p class="muted">弹窗16px圆角，普通按钮8px。内容与操作保持清晰分区。</p>${action('打开弹窗', 'filled', 'data-open="dialog"')}</div>`,
    'bottom-sheet': () =>
      `<div class="mini-card" style="border-radius:16px 16px 0 0"><div style="width:32px;height:4px;background:var(--md-color-outline);border-radius:4px;margin:0 auto 16px"></div><h3>导出选项</h3><p class="muted">窄屏补充任务，可拖动也可明确关闭。</p>${action('打开底部面板', 'tonal', 'data-open="bottom-sheet"')}</div>`,
    'side-sheet': () =>
      `<div class="pane-demo"><div><h3>主内容</h3><p class="muted">当前工作保持可见</p></div><div class="pane-divider"></div><div><h3>详情面板</h3><p class="muted">固定360px</p></div></div>${action('打开侧面板', 'tonal', 'data-open="side-sheet"')}`,
    menu: () =>
      '<div class="mini-menu" role="menu" aria-label="文件操作菜单"><button role="menuitem" data-demo="重命名">' +
      icon('edit') +
      '重命名<span class="menu-shortcut">↵</span></button><button role="menuitem" data-demo="复制">' +
      icon('content_copy') +
      '复制<span class="menu-shortcut">⌘ C</span></button><hr role="separator"><button role="menuitem" data-demo="移至回收站" style="color:var(--md-color-error)">' +
      icon('delete') +
      '移至回收站</button></div>',
    tooltip: () =>
      `<span class="mini-tooltip">刷新用量 · 普通提示</span>${iconAction('refresh', '刷新用量', 'data-demo="刷新用量"')}<p class="muted">悬停或聚焦按钮查看提示，Escape收起；必要信息不能藏在提示内。</p>`,
    popover: () =>
      `<div class="mini-card"><label class="field-label">任务状态<select class="field"><option>全部状态</option><option>已完成</option><option>失败</option></select></label></div><p class="muted">浮层表单内容示例；正式实现锚定触发器，不阻断背景。</p>`,
    badge: () =>
      `<div class="demo-row">${badge('已完成', 'success')}${badge('待处理', 'warning')}${badge('生成失败', 'error')}${badge('本地', 'neutral')}<span aria-label="3条未读" style="background:var(--md-color-error);color:var(--md-color-on-error);border-radius:9999px;padding:0 5px;font-size:11px;line-height:16px">3</span></div>`,
    progress: () =>
      `<div class="row" style="justify-content:space-between"><span>正在生成配音</span><span class="muted">65%</span></div><div class="progress" role="progressbar" aria-label="配音生成进度" aria-valuenow="65" aria-valuemin="0" aria-valuemax="100"><span style="width:65%"></span></div><span class="muted">示例确定进度 · 可离开页面继续处理</span>`,
    'loading-indicator': () =>
      `<div class="row" role="status"><span class="spinner" aria-hidden="true"></span><span>正在读取本地模型…</span></div>`,
    snackbar: () =>
      `<div class="mini-snackbar"><span>已移至回收站</span><button data-demo="撤销删除">撤销</button></div>${action('显示消息条', 'text', 'data-demo="设置已保存 · 示例消息"')}`,
    banner: () =>
      `<div class="inline-banner">${icon('info')}<span>尚未配置本地模型。<br><span style="font-size:12px">配置完成后即可在本机生成配音。</span></span></div>${action('配置模型', 'text', 'data-demo="配置模型"')}`,
    skeleton: () =>
      `<div aria-hidden="true"><div class="skeleton-line" style="width:40%"></div><div class="skeleton-line" style="width:85%"></div><div class="skeleton-line" style="width:65%"></div></div><span class="muted">首屏数据加载 · 与最终布局保持一致</span>`,
    empty: () =>
      `<div class="empty-box">${icon('graphic_eq')}<h3>还没有生成配音</h3><p>添加文案与音色，开始第一段创作。</p>${action('创建配音', 'tonal', 'data-demo="创建配音"')}</div>`,
    notification: () =>
      `<ul class="mini-list"><li>${icon('check_circle')}<div>发布配音已生成<small>刚刚 · 本地任务</small></div>${badge('未读', 'info')}</li><li>${icon('sync')}<div>订阅用量已同步<small>2分钟前</small></div></li></ul>${action('打开通知中心', 'text', 'data-open="notification"')}`,
    logo: () =>
      `<div class="demo-row"><span class="brand-base logo-spec"><img src="../../assets/app-logo.svg" alt="MyDashboard" width="48" height="48"></span><div><h3>MyDashboard</h3><p class="muted">Ribbon Hub · 原始品牌SVG</p></div></div>`,
    icon: () =>
      `<div class="demo-row icon-spec">${['dashboard', 'science', 'movie', 'mic', 'tune', 'delete'].map(icon).join('')}</div><div class="demo-row">${icon('favorite')}<span class="sym fill" aria-hidden="true">favorite</span><span class="muted">rest FILL 0 → selected FILL 1</span></div>`,
    typography: () =>
      `<div><h2 style="font-size:var(--md-type-headline-md-size);line-height:var(--md-type-headline-md-line);font-weight:var(--md-type-headline-md-weight)">清晰的工作台</h2><h3 style="margin-top:16px">标题与信息，各有层级</h3><p style="margin-top:8px;font-size:var(--md-type-body-md-size);font-weight:var(--md-type-body-md-weight);line-height:var(--md-type-body-md-line)">正文14px，保留中文阅读所需的行高。</p><p class="muted" style="margin-top:8px">辅助12px · 标签13px/500 · 数值 12,480</p></div>`,
    avatar: () =>
      `<div class="demo-row"><span class="avatar" style="width:24px;height:24px;font-size:11px" role="img" aria-label="成员林">林</span><span class="avatar" style="width:32px;height:32px;font-size:12px" role="img" aria-label="成员周">周</span><span class="avatar" role="img" aria-label="当前用户">我</span><span class="avatar" style="width:56px;height:56px" role="img" aria-label="工作区成员">MD</span></div>`,
    'rich-editor': () =>
      `<div class="editor-demo"><div class="mini-toolbar">${iconAction('format_bold', '加粗', 'data-demo="加粗"')}${iconAction('link', '链接', 'data-demo="插入链接"')}</div><div contenteditable="true" role="textbox" aria-label="富文本编辑示例" aria-multiline="true">灵感在这里成为作品。<br>写下你的下一段产品故事。</div></div>`,
    audio: sampleAudio,
    video: () =>
      `<div class="video-demo">${action(icon('play_arrow'), 'tonal icon-btn', 'aria-label="播放视频控件示例" data-demo="视频控制器外观示例，未加载媒体"')}<small>00:00 / 00:45 · 控件示意</small></div>`,
    'split-pane': () =>
      `<div class="pane-demo"><div><h3>配音文案</h3><p class="muted">编辑区独立滚动</p></div><div class="pane-divider"></div><div><h3>固定试听</h3><p class="muted">播放器始终可见</p></div></div>`,
    stepper: () =>
      `<div class="step-demo"><span class="step-node"><b>✓</b>导入录音</span><span class="step-line"></span><span class="step-node"><b>2</b>提取文字</span><span class="step-line"></span><span class="step-node"><b>3</b>生成配音</span></div>`,
    keyboard: () =>
      `<div class="demo-row"><kbd>⌘</kbd><span>+</span><kbd>K</kbd><span class="muted">打开搜索</span></div><div class="row">${icon('drag_indicator')}<span>发布任务</span>${action('上移', 'text', 'data-demo="上移任务"')}${action('下移', 'text', 'data-demo="下移任务"')}</div>`,
  }
  function updateRange(input) {
    const min = Number(input.min || 0)
    const max = Number(input.max || 100)
    input.style.setProperty(
      '--range-progress',
      `${((Number(input.value) - min) / (max - min)) * 100}%`,
    )
    if (input.dataset.unit) {
      input.setAttribute('aria-valuetext', `${input.value}${input.dataset.unit}`)
      const output = input.parentElement.querySelector('output')
      if (output) output.textContent = `${input.value}${input.dataset.unit}`
    }
  }
  function updatePalette() {
    const palette = document.getElementById('palette')
    if (!palette) return
    const colors = tokens.color[themeValue()]
    const roles = [
      ['primary', 'on-primary', '主色 / Primary'],
      ['primary-container', 'on-primary-container', '浅紫容器 / Tonal'],
      ['secondary-container', 'on-secondary-container', '品牌点缀 / Amber'],
      ['surface-lowest', 'on-surface', '卡片 / Surface'],
      ['surface-low', 'on-surface', '分组 / Surface low'],
      ['success-container', 'on-success-container', '成功 / Success'],
      ['warning-container', 'on-warning-container', '提醒 / Warning'],
      ['error-container', 'on-error-container', '错误 / Error'],
    ]
    palette.innerHTML = roles
      .map(
        ([background, foreground, label]) =>
          `<div class="swatch"><div class="swatch-color" style="background:var(--md-color-${background});color:var(--md-color-${foreground})"><span>${escape(label)}</span>${icon(background.includes('container') ? 'circle' : 'check')}</div><div class="swatch-body"><strong>${escape(background)}</strong><code>${colors[background]}</code></div></div>`,
      )
      .join('')
  }
  let category = '全部'
  function renderComponents() {
    const grid = document.getElementById('component-grid')
    if (!grid) return
    const query = document.getElementById('component-search').value.trim().toLowerCase()
    const filtered = components.filter(
      (component) =>
        (category === '全部' || component.group === category) &&
        JSON.stringify(component).toLowerCase().includes(query),
    )
    grid.innerHTML = filtered
      .map(
        (component) =>
          `<article class="component-card" id="component-${component.id}"><div class="component-heading"><div class="row"><h2>${escape(component.name)}</h2>${badge(component.status)}</div><p>${escape(component.usage)}</p><div class="component-origin"><span>${escape(component.group)}</span><span>·</span><code>${escape(component.id)}</code></div></div><div class="specimen-caption"><span>交互示例</span><span data-specimen-mode>桌面 / 浅色</span></div><div class="component-demo">${templates[component.id]()}</div><dl class="spec-list">${Object.entries(
            component.spec,
          )
            .slice(0, 3)
            .map(([key, value]) => `<dt>${escape(key)}</dt><dd>${escape(value)}</dd>`)
            .join(
              '',
            )}</dl><details class="component-rules"><summary>完整规格与交互规则 <span style="margin-left:auto">${Object.keys(component.spec).length} 项</span></summary><dl class="spec-list">${Object.entries(
            component.spec,
          )
            .slice(3)
            .map(([key, value]) => `<dt>${escape(key)}</dt><dd>${escape(value)}</dd>`)
            .join(
              '',
            )}</dl><p>${escape(component.variants)}</p><p>${escape(component.behavior)}</p><p class="token-refs">${component.refs.map((ref) => `<code>${escape(ref)}</code>`).join(' · ')}</p></details></article>`,
      )
      .join('')
    document.getElementById('component-count').textContent =
      `${filtered.length} / ${components.length} 类组件`
    document.getElementById('no-components').hidden = filtered.length > 0
    document.querySelectorAll('[data-category]').forEach((button) => {
      const selected = button.dataset.category === category
      button.classList.toggle('selected', selected)
      button.classList.toggle('active', selected)
      button.setAttribute('aria-pressed', String(selected))
    })
    window.MDControls.close()
    window.MDControls.enhance(grid)
    grid.querySelectorAll('[data-indeterminate]').forEach((input) => (input.indeterminate = true))
    updateSpecimenLabels()
    grid.querySelectorAll('.range').forEach(updateRange)
    grid.querySelectorAll('[data-counter]').forEach(updateCounter)
    grid
      .querySelectorAll('[role=toolbar], [role=menu]')
      .forEach((group) =>
        group
          .querySelectorAll('button')
          .forEach((button, index) => (button.tabIndex = index === 0 ? 0 : -1)),
      )
  }
  function updateSpecimenLabels() {
    document.querySelectorAll('[data-specimen-mode]').forEach((label) => {
      const densityLabel =
        root.dataset.density === 'touch'
          ? '触控'
          : root.dataset.density === 'compact'
            ? '紧凑'
            : '桌面'
      label.textContent = densityLabel + ' / ' + (themeValue() === 'dark' ? '深色' : '浅色')
    })
  }
  function updateCounter(input) {
    input.parentElement.parentElement.querySelector('.counter').textContent =
      `${Array.from(input.value).length} / ${input.maxLength}`
  }
  function setView() {
    const view = location.hash.slice(1).split('/')[0] || 'foundations'
    const safeView = ['foundations', 'components', 'ai-lab', 'governance'].includes(view)
      ? view
      : 'foundations'
    document
      .querySelectorAll('[data-view]')
      .forEach((section) => (section.hidden = section.dataset.view !== safeView))
    document.querySelectorAll('[data-view-link]').forEach((link) => {
      if (link.dataset.viewLink === safeView) link.setAttribute('aria-current', 'page')
      else link.removeAttribute('aria-current')
    })
    root.dataset.activeView = safeView
    document.getElementById('group-nav').hidden = safeView !== 'components'
    const componentId = location.hash.split('/')[1]
    if (componentId && safeView === 'components') {
      category = '全部'
      document.getElementById('component-search').value = ''
      renderComponents()
      document.getElementById(`component-${componentId}`)?.scrollIntoView({ block: 'start' })
    } else window.scrollTo(0, 0)
  }
  function initBook() {
    updatePalette()
    document.getElementById('contrast-count').textContent = `${contrasts.length} 组文字色配对`
    document.getElementById('color-table').innerHTML = Object.keys(tokens.color.light)
      .map(
        (role) =>
          `<tr><td><code>${role}</code></td><td><span style="display:inline-block;width:12px;height:12px;border:1px solid var(--md-color-outline);background:${tokens.color.light[role]};vertical-align:middle;margin-right:8px"></span>${tokens.color.light[role]}</td><td>${tokens.color.dark[role]}</td></tr>`,
      )
      .join('')
    document.getElementById('typography').innerHTML = Object.entries(tokens.type)
      .map(
        ([role, values]) =>
          `<div class="type-row"><span class="role">${role}</span><span class="type-text" style="font-size:var(--md-type-${role}-size);line-height:var(--md-type-${role}-line);font-weight:var(--md-type-${role}-weight)">${role.startsWith('display') ? '灵感，成为作品' : role.startsWith('headline') ? '让工作更有秩序' : role.startsWith('title') ? '清晰表达每一层信息' : '用熟悉的方式，创造新的价值。'}</span><span class="type-value">${values.size} / ${values.line}<br>wght ${values.weight}</span></div>`,
      )
      .join('')
    document.getElementById('shape-grid').innerHTML = [
      ['control', '按钮 / 输入'],
      ['nested', '菜单 / 子面板'],
      ['card', '卡片'],
      ['dialog', '弹窗'],
      ['full', '图标按钮 / 头像'],
    ]
      .map(
        ([role, label]) =>
          `<div class="shape-item"><div class="shape-block" style="border-radius:var(--md-shape-${role})"></div><strong>${label}</strong><small>${role === 'full' ? 'Full' : tokens.shape[role]} · shape.${role}</small></div>`,
      )
      .join('')
    document.getElementById('spacing').innerHTML = [1, 2, 3, 4, 6, 8, 12, 16]
      .map(
        (step) =>
          `<div class="space-item"><div class="space-bar" style="height:var(--md-space-${step})"></div>${tokens.space[step]}</div>`,
      )
      .join('')
    document.getElementById('contrast-table').innerHTML = contrasts
      .map(
        (item) =>
          `<tr><td>${item.theme}</td><td><code>${item.pair}</code></td><td>${item.ratio.toFixed(2)} : 1</td><td>${badge('AA 文字通过', 'success')}</td></tr>`,
      )
      .join('')
    const categories = ['全部', ...new Set(components.map((component) => component.group))]
    document.getElementById('component-filters').innerHTML = categories
      .map(
        (group) =>
          `<button class="chip ${group === '全部' ? 'selected' : ''}" data-category="${group}" aria-pressed="${group === '全部'}">${group}</button>`,
      )
      .join('')
    document.getElementById('group-nav').innerHTML = categories
      .slice(1)
      .map(
        (group) =>
          `<button data-category="${group}">${group}<span style="float:right">${components.filter((component) => component.group === group).length}</span></button>`,
      )
      .join('')
    document.getElementById('component-search').addEventListener('input', renderComponents)
    document.getElementById('density').addEventListener('change', (event) => {
      root.dataset.density = event.target.value
      updateSpecimenLabels()
      syncFrame()
    })
    document.getElementById('ai-frame').addEventListener('load', syncFrame)
    renderComponents()
    setView()
    window.addEventListener('hashchange', setView)
  }
  const services = [
    {
      name: 'OpenAI',
      plan: 'Plus',
      cost: 20,
      date: '11月01日',
      status: '运行正常',
      tone: 'success',
      logo: 'openai-light.svg',
      dark: 'openai-dark.svg',
    },
    {
      name: 'Anthropic',
      plan: 'Claude Pro',
      cost: 20,
      date: '10月24日',
      status: '即将续费',
      tone: 'warning',
      logo: 'anthropic.svg',
    },
    {
      name: 'Google',
      plan: 'AI Pro',
      cost: 19.99,
      date: '11月08日',
      status: '运行正常',
      tone: 'success',
      logo: 'google.svg',
    },
  ]
  const tools = [
    {
      name: 'ChatGPT',
      provider: 'OpenAI',
      category: '文本',
      symbol: 'chat',
      description: '日常问答、内容草拟与多模态协作。',
    },
    {
      name: 'Claude',
      provider: 'Anthropic',
      category: '文本',
      symbol: 'smart_toy',
      description: '长文理解、深度推理与编码协作。',
    },
    {
      name: 'Gemini',
      provider: 'Google',
      category: '文本',
      symbol: 'auto_awesome',
      description: '跨文本、图像与代码的多模态助手。',
    },
    {
      name: 'GitHub Copilot',
      provider: 'GitHub',
      category: '代码',
      symbol: 'code',
      description: '在开发工作流中完成代码与测试。',
    },
    {
      name: 'Midjourney',
      provider: 'Midjourney',
      category: '图像',
      symbol: 'palette',
      description: '探索视觉方向，生成产品与品牌图像。',
    },
    {
      name: 'VoxCPM2',
      provider: 'OpenBMB',
      category: '音频',
      symbol: 'graphic_eq',
      description: '使用本地模型生成自然表达的克隆配音。',
    },
    {
      name: 'Qwen3-TTS',
      provider: 'Qwen',
      category: '音频',
      symbol: 'mic',
      description: '声音克隆与多语言语音生成。',
    },
    {
      name: 'Video Studio',
      provider: 'MyDashboard',
      category: '视频',
      symbol: 'movie',
      description: '组织视频素材、音频与发布演示。',
    },
  ]
  let toolCategory = '全部'
  function renderSubscriptions() {
    document.getElementById('subscription-total').textContent =
      `$${services.reduce((total, service) => total + service.cost, 0).toFixed(2)}`
    document.getElementById('subscription-count').textContent = `${services.length}项订阅`
    document.getElementById('subscription-rows').innerHTML = services
      .map(
        (service) =>
          `<article class="subscription-card"><div class="provider-cell"><span class="provider-logo">${service.logo ? `<img src="../../src/renderer/assets/logos/${service.logo}" ${service.dark ? `data-light-logo="${service.logo}" data-dark-logo="${service.dark}"` : ''} alt="">` : `<span class="provider-initial">${escape(service.name.slice(0, 2))}</span>`}</span><span><strong>${escape(service.plan)}</strong><small class="muted">${escape(service.name)}</small></span></div><div class="subscription-card-price">$${service.cost.toFixed(2)}<small class="muted"> / 月</small></div></article>`,
      )
      .join('')
    updateLogos()
  }
  function updateLogos() {
    document
      .querySelectorAll('[data-dark-logo]')
      .forEach(
        (image) =>
          (image.src = `../../src/renderer/assets/logos/${themeValue() === 'dark' ? image.dataset.darkLogo : image.dataset.lightLogo}`),
      )
  }
  function renderTools() {
    const query = document.getElementById('tool-search').value.toLowerCase().trim()
    const matching = tools.filter(
      (tool) =>
        (toolCategory === '全部' || tool.category === toolCategory) &&
        `${tool.name} ${tool.provider} ${tool.description}`.toLowerCase().includes(query),
    )
    document.getElementById('tool-grid').innerHTML = matching.length
      ? matching
          .map(
            (tool) =>
              `<button class="tool-card" data-demo="${escape(tool.name)} · 工具入口为设计演示"><header><span class="tool-icon">${icon(tool.symbol)}</span><span class="muted">${tool.category}</span></header><h3>${escape(tool.name)}</h3><p>${escape(tool.description)}</p><footer><span>${escape(tool.provider)}</span>${icon('arrow_outward')}</footer></button>`,
          )
          .join('')
      : '<div class="empty-box" style="grid-column:1/-1">未找到工具，请尝试其他名称或清空筛选。</div>'
    document.querySelectorAll('[data-tool-category]').forEach((button) => {
      const selected = button.dataset.toolCategory === toolCategory
      button.classList.toggle('selected', selected)
      button.setAttribute('aria-pressed', String(selected))
    })
    document.getElementById('tool-result-count').textContent = `${matching.length}个工具`
  }
  function initProduct() {
    document.getElementById('product').innerHTML =
      `<div class="product-app"><aside class="product-sidebar" id="product-nav"><a class="product-brand" href="index.html#foundations"><span class="brand-base"><img src="../../assets/app-logo.svg" width="32" height="32" alt=""></span><span>MyDashboard<small>你的本地创作工作台</small></span></a>${action(`${icon('add')}新建项目`, 'outlined create-btn', 'data-demo="新建项目"')}<nav class="product-navigation" aria-label="主导航">${[
        ['dashboard', 'Dashboard'],
        ['edit_note', 'Writing'],
        ['movie', 'Video'],
        ['insights', 'Insights'],
        ['science', 'AI Lab'],
        ['construction', 'Toolbox'],
      ]
        .map(
          ([symbol, label]) =>
            `<button class="btn ${label === 'AI Lab' ? 'current' : ''}" ${label === 'AI Lab' ? 'aria-current="page"' : ''} data-demo="${label} · 当前为AI Lab设计提案">${icon(symbol)}<span class="nav-label">${label}</span></button>`,
        )
        .join(
          '',
        )}</nav><div class="product-sidebar-bottom"><div class="product-navigation">${action(`${icon('settings')}<span class="settings-label">设置</span>`, '', 'data-demo="设置"')}</div><div class="product-owner"><span class="avatar" role="img" aria-label="示例用户">我</span><div>我的工作空间<small class="muted">本地优先 · 数据由你掌控</small></div></div></div></aside><div class="product-shell"><header class="product-topbar">${iconAction('menu', '展开导航', 'class="mobile-menu" data-mobile-nav')}<label class="search-field product-search">${icon('search')}<input id="global-demo-search" placeholder="搜索工作台内容" aria-label="全局搜索演示"><kbd>⌘ K</kbd></label><div class="row"><span class="product-note">设计提案</span>${iconAction('dark_mode', '切换到深色主题', 'data-theme-control')}${iconAction('notifications', '通知，2条未读', 'data-demo="2条示例通知 · 配音完成、用量同步"')}<span class="avatar" style="width:32px;height:32px;font-size:12px" role="img" aria-label="示例用户">我</span></div></header><main id="product-main" class="product-main"><div class="product-grid"><article class="product-card"><header><div class="card-heading"><span class="card-symbol">${icon('radar')}</span><div><h2 style="font-size:var(--md-type-title-md-size);line-height:var(--md-type-title-md-line);font-weight:var(--md-type-title-md-weight)">Codex Reset Radar</h2><p class="muted">公开信号 · 已连接</p></div></div>${iconAction('history', '查看重置历史', 'data-demo="重置历史 · 示例账户"')}</header><div class="radar-body"><div class="radar-visual" aria-hidden="true"></div><div>${badge('信号平稳', 'success')}<h3>当前未发现重置信号</h3><p class="muted" style="margin-top:4px">基于公开来源估算，非官方承诺</p></div></div><div class="radar-metrics"><div><span class="muted">估算概率</span><strong>24<span style="font-size:18px">%</span></strong></div><div><span class="muted">估算时间</span><strong class="time">未来72小时</strong></div></div><div class="card-divider"></div><div class="meta-line"><span>当前重置卡</span><strong>暂无数据</strong></div><div class="meta-line"><span>上次重置</span><span>10月18日 10:34</span></div><div class="meta-line"><span>来源：公开公告与账户信号</span><span>刚刚更新</span></div><div class="radar-actions">${action('更换绑定', 'outlined', 'data-demo="管理账户连接"')}${action(`打开会话 ${icon('arrow_outward')}`, 'filled', 'data-demo="打开会话 · 设计演示"')}</div></article><article class="product-card"><header><div class="card-heading"><span class="card-symbol">${icon('monitoring')}</span><div><h2 style="font-size:var(--md-type-title-md-size);line-height:var(--md-type-title-md-line);font-weight:var(--md-type-title-md-weight)">使用统计</h2><p class="muted">ChatGPT Plus · dem***@example.com</p></div></div>${iconAction('sync', '同步使用统计', 'data-sync')}</header><div class="usage-sync"><span>实时额度<small>每 2 分钟从已绑定会话同步</small></span><span class="muted">同步 10/21 17:00</span></div><div class="quota-grid"><div><div class="quota-label"><span>5小时额度</span><strong>68%<small class="muted"> 剩余</small></strong></div><div class="progress" role="progressbar" aria-label="5小时剩余额度" aria-valuenow="68" aria-valuemin="0" aria-valuemax="100"><span style="width:68%"></span></div><p class="muted">重置于今天 18:30</p></div><div><div class="quota-label"><span>每周额度</span><strong>42%<small class="muted"> 剩余</small></strong></div><div class="progress" role="progressbar" aria-label="每周剩余额度" aria-valuenow="42" aria-valuemin="0" aria-valuemax="100"><span style="width:42%"></span></div><p class="muted">重置于10月25日</p></div></div><div class="usage-chart"><div class="row" style="justify-content:space-between"><span class="muted">近7天 Token 消耗</span><span class="muted">本地日志估算</span></div><div class="chart-bars" role="img" aria-label="近7天用量依次为32、48、40、72、56、88、65万Tokens">${[32, 48, 40, 72, 56, 88, 65].map((height, index) => `<span class="chart-bar" style="height:${height}%;${index === 6 ? 'background:var(--md-color-info)' : ''}"></span>`).join('')}</div><div class="chart-ticks">${['10/15', '16', '17', '18', '19', '20', '21'].map((date) => `<span>${date}</span>`).join('')}</div></div><div class="usage-footer"><div><span class="muted">近7天 Token</span><strong>13.2M</strong></div><div><span class="muted">今日 Token</span><strong>650K</strong></div><div><span class="muted">单日峰值</span><strong>880K</strong></div><div><span class="muted">连续活跃</span><strong>5<small> 天</small></strong></div><div><span class="muted">最长连续</span><strong>12<small> 天</small></strong></div></div></article></div><section class="product-card subscription-section"><header><div class="subscription-summary"><div><h2 style="font-size:var(--md-type-title-md-size);line-height:var(--md-type-title-md-line);font-weight:var(--md-type-title-md-weight)">Active Subscriptions</h2><p class="muted"><span id="subscription-count">3项订阅</span> · 每月合计 <strong id="subscription-total" style="color:var(--md-color-primary)"></strong></p></div></div><div class="row">${badge('示例币种 USD', 'neutral')}${action(`${icon('sync')}用量追踪`, 'outlined', 'data-sync')}${action(`${icon('add')}添加`, 'filled', 'data-open="subscription"')}</div></header><div class="subscription-cards" id="subscription-rows"></div></section><section class="directory"><div class="directory-heading"><div><h2>AI Tool Directory</h2><p class="muted" style="margin-top:4px">为不同阶段，找到合适的创作伙伴。</p></div><div class="directory-filters">${['全部', '文本', '图像', '代码', '音频', '视频'].map((category) => `<button class="chip ${category === '全部' ? 'selected' : ''}" data-tool-category="${category}" aria-pressed="${category === '全部'}">${category}</button>`).join('')}</div></div><div class="row directory-search-row"><label class="search-field">${icon('search')}<input id="tool-search" placeholder="搜索工具（预览辅助）" aria-label="搜索AI工具"></label><span id="tool-result-count" class="muted" role="status" style="padding-top:22px;white-space:nowrap"></span></div><div class="tool-grid" id="tool-grid"></div></section><footer class="product-footnote"><span>所有内容均为设计演示数据，不连接真实账户。</span><span>Quiet Workspace v3 · 保留现有页面结构</span></footer></main></div></div>`
    const mobileButton = document.querySelector('[data-mobile-nav]')
    mobileButton.classList.add('mobile-menu')
    renderSubscriptions()
    renderTools()
    document.getElementById('tool-search').addEventListener('input', renderTools)
    document.getElementById('subscription-form').addEventListener('submit', (event) => {
      event.preventDefault()
      const data = new FormData(event.target)
      const plan = String(data.get('plan')).trim()
      if (!plan) {
        event.target.elements.plan.setCustomValidity('请输入套餐名称')
        event.target.elements.plan.reportValidity()
        return
      }
      services.push({
        name: String(data.get('provider')),
        plan,
        cost: Number(data.get('cost')),
        date: '11月21日',
        status: '运行正常',
        tone: 'success',
      })
      renderSubscriptions()
      dialog.close()
      event.target.reset()
      toast('订阅已添加 · 仅保留在当前演示页面')
    })
    document
      .querySelector('[name=plan]')
      .addEventListener('input', (event) => event.target.setCustomValidity(''))
    window.addEventListener('message', (event) => {
      if (event.source !== parent || event.data?.type !== 'md-design-theme') return
      if (['light', 'dark'].includes(event.data.theme)) setTheme(event.data.theme)
      if (['standard', 'compact', 'touch'].includes(event.data.density))
        root.dataset.density = event.data.density
      updateLogos()
    })
    setTheme(themeValue())
  }
  function audioSource() {
    const rate = 16000
    const samples = rate * 2
    const buffer = new ArrayBuffer(44 + samples * 2)
    const view = new DataView(buffer)
    const word = (offset, text) =>
      [...text].forEach((character, index) =>
        view.setUint8(offset + index, character.charCodeAt(0)),
      )
    word(0, 'RIFF')
    view.setUint32(4, 36 + samples * 2, true)
    word(8, 'WAVE')
    word(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, rate, true)
    view.setUint32(28, rate * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    word(36, 'data')
    view.setUint32(40, samples * 2, true)
    for (let index = 0; index < samples; index++) {
      const fade = Math.min(1, index / (rate * 0.1), (samples - index) / (rate * 0.15))
      view.setInt16(
        44 + index * 2,
        Math.sin((index / rate) * 2 * Math.PI * 440) * fade * 4500,
        true,
      )
    }
    return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
  }
  let audioUrl
  document.addEventListener('click', (event) => {
    const button = event.target.closest('button,a[data-demo]')
    if (!button) return
    if (button.matches('#theme-toggle,[data-theme-control]')) {
      setTheme(themeValue() === 'light' ? 'dark' : 'light')
      updateLogos()
    }
    if (button.hasAttribute('data-category')) {
      category = button.dataset.category
      renderComponents()
    }
    if (button.hasAttribute('data-demo'))
      toast(`${button.dataset.demo}${button.dataset.demo.includes('演示') ? '' : ' · 设计演示'}`)
    if (button.hasAttribute('data-open')) openDialog(button.dataset.open)
    if (button.hasAttribute('data-close-dialog')) dialog.close()
    if (button.hasAttribute('data-close-toast')) closeToast()
    if (button.hasAttribute('data-toggle')) {
      const selected = button.getAttribute('aria-pressed') !== 'true'
      button.setAttribute('aria-pressed', String(selected))
      button.classList.toggle('selected', selected)
    }
    if (button.hasAttribute('data-remove')) button.remove()
    if (button.closest('[data-segments]'))
      button.parentElement.querySelectorAll('button').forEach((sibling) => {
        sibling.classList.toggle('selected', sibling === button)
        sibling.setAttribute('aria-pressed', String(sibling === button))
      })
    if (button.matches('[role=tab]')) {
      button.parentElement.querySelectorAll('[role=tab]').forEach((tab) => {
        tab.setAttribute('aria-selected', String(tab === button))
        tab.tabIndex = tab === button ? 0 : -1
      })
      const panel = document.getElementById(button.getAttribute('aria-controls'))
      panel.textContent = `${button.textContent}内容区域`
      panel.setAttribute('aria-labelledby', button.id)
    }
    if (button.hasAttribute('data-compare')) {
      const mode = button.dataset.compare
      document.getElementById('comparison').className = `comparison ${mode}`
      document.querySelectorAll('[data-compare]').forEach((sibling) => {
        sibling.classList.toggle('selected', sibling === button)
        sibling.setAttribute('aria-pressed', String(sibling === button))
      })
    }
    if (button.hasAttribute('data-carousel')) {
      const target = button.parentElement.querySelector('[data-carousel-content]')
      const index = (Number(target.dataset.index || 0) + Number(button.dataset.carousel) + 3) % 3
      target.dataset.index = index
      target.innerHTML = `封面 ${index + 1} / 3<br><span class="muted">产品发布 · 16:9</span>`
    }
    if (button.hasAttribute('data-page-button'))
      button.parentElement.querySelectorAll('[data-page-button]').forEach((sibling) => {
        sibling.classList.toggle('tonal', sibling === button)
        if (sibling === button) sibling.setAttribute('aria-current', 'page')
        else sibling.removeAttribute('aria-current')
      })
    if (button.hasAttribute('data-tool-category')) {
      toolCategory = button.dataset.toolCategory
      renderTools()
    }
    if (button.hasAttribute('data-sync')) {
      button.disabled = true
      button.setAttribute('aria-busy', 'true')
      const label = button.innerHTML
      button.innerHTML = `${icon('sync')}同步中`
      setTimeout(() => {
        button.innerHTML = label
        button.disabled = false
        button.removeAttribute('aria-busy')
        toast('用量已同步 · 当前为示例数据')
      }, 750)
    }
    if (button.hasAttribute('data-mobile-nav')) {
      const navigation = document.getElementById('product-nav')
      const open = navigation.classList.toggle('mobile-open')
      button.setAttribute('aria-expanded', String(open))
      if (open) navigation.querySelector('a,button').focus()
    }
    if (button.hasAttribute('data-play-audio')) {
      const container = button.closest('.demo-audio')
      const audio = container.querySelector('audio')
      if (!audio.src) {
        audioUrl ??= audioSource()
        audio.src = audioUrl
        audio.volume = 0.35
        audio.addEventListener('timeupdate', () => {
          const range = container.querySelector('.range')
          range.value = audio.currentTime
          updateRange(range)
          container.querySelector('.audio-time').textContent =
            `0:0${Math.floor(audio.currentTime)} / 0:02`
        })
        audio.addEventListener('pause', () => {
          button.innerHTML = icon('play_arrow')
          button.setAttribute('aria-label', '播放演示提示音')
        })
        audio.addEventListener('play', () => {
          button.innerHTML = icon('pause')
          button.setAttribute('aria-label', '暂停演示提示音')
        })
      }
      if (audio.paused) {
        document.querySelectorAll('audio').forEach((other) => {
          if (other !== audio) other.pause()
        })
        audio.play().catch(() => toast('浏览器未能播放，请再次点击'))
      } else audio.pause()
    }
  })
  document.addEventListener('input', (event) => {
    if (event.target.matches('.range')) {
      updateRange(event.target)
      const audio = event.target.closest('.demo-audio')?.querySelector('audio')
      if (audio?.src) audio.currentTime = Number(event.target.value)
    }
    if (event.target.matches('[data-counter]')) updateCounter(event.target)
  })
  document.addEventListener('change', (event) => {
    if (event.target.matches('[data-file-input]'))
      event.target.closest('.component-demo').querySelector('[data-file-name]').textContent = event
        .target.files[0]
        ? `已选择：${event.target.files[0].name} · 仅显示，不上传`
        : '选择文件仅显示名称，不上传。'
  })
  document.addEventListener('keydown', (event) => {
    const group = event.target.closest('[role=tablist],[role=toolbar],[role=menu],[data-segments]')
    if (
      group &&
      ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
    ) {
      const buttons = [...group.querySelectorAll('button:not(:disabled)')]
      const index = buttons.indexOf(document.activeElement)
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? buttons.length - 1
            : (index +
                (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) +
                buttons.length) %
              buttons.length
      event.preventDefault()
      buttons.forEach((button, position) => (button.tabIndex = position === next ? 0 : -1))
      buttons[next]?.focus()
      if (group.matches('[role=tablist]')) buttons[next]?.click()
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      const search =
        document.getElementById('global-demo-search') || document.getElementById('component-search')
      if (document.body.dataset.page !== 'ai-lab') {
        location.hash = 'components'
        setView()
      }
      search?.focus()
    }
    if (event.key === 'Escape') {
      const navigation = document.getElementById('product-nav')
      if (navigation?.classList.contains('mobile-open')) {
        navigation.classList.remove('mobile-open')
        document.querySelector('[data-mobile-nav]').setAttribute('aria-expanded', 'false')
        document.querySelector('[data-mobile-nav]').focus()
      }
    }
  })
  if (document.body.dataset.page === 'ai-lab') initProduct()
  else initBook()
  window.MDControls.enhance()
})()
