;(() => {
  'use strict'
  const escape = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (character) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
    )
  const icon = (name) => `<span class="sym" aria-hidden="true">${name}</span>`
  let sequence = 0
  let active = null
  const labelFor = (input) =>
    input.getAttribute('aria-label') || input.labels?.[0]?.firstChild?.textContent.trim() || '选择'
  const emit = (input) => {
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }
  function close(restoreFocus = false) {
    if (!active) return
    const { popup, anchor, input } = active
    active = null
    popup.remove()
    anchor.setAttribute('aria-expanded', 'false')
    input.removeAttribute('aria-activedescendant')
    anchor.removeAttribute('aria-controls')
    if (restoreFocus && anchor.isConnected) anchor.focus()
  }
  function position() {
    if (!active) return
    const { popup, anchor } = active
    const bounds = (anchor.closest('.picker-control') || anchor).getBoundingClientRect()
    const preferred =
      popup.getAttribute('role') === 'dialog'
        ? popup.querySelector('.calendar-grid') &&
          document.documentElement.dataset.density === 'touch'
          ? 380
          : Number(popup.dataset.width)
        : Math.max(bounds.width, Number(popup.dataset.width || 220))
    const width = Math.min(preferred, innerWidth - 24)
    popup.style.width = `${width}px`
    const availableBelow = innerHeight - bounds.bottom - 16
    const availableAbove = bounds.top - 16
    const above =
      availableBelow < Math.min(popup.scrollHeight, 280) && availableAbove > availableBelow
    popup.style.maxHeight = `${Math.min(popup.getAttribute('role') === 'listbox' ? 320 : 480, Math.max(80, above ? availableAbove : availableBelow))}px`
    const height = popup.getBoundingClientRect().height
    popup.style.left = `${Math.max(12, Math.min(bounds.left, innerWidth - width - 12))}px`
    popup.style.top = `${above ? bounds.top - height - 6 : bounds.bottom + 6}px`
  }
  function open(anchor, input, role, label, width) {
    hideTooltip()
    close()
    const popup = document.createElement('div')
    popup.className = 'control-popup'
    popup.id = `control-popup-${++sequence}`
    popup.setAttribute('role', role)
    popup.setAttribute('aria-label', label)
    popup.dataset.width = width
    ;(anchor.closest('dialog') || document.body).append(popup)
    anchor.setAttribute('aria-expanded', 'true')
    anchor.setAttribute('aria-controls', popup.id)
    active = { popup, anchor, input }
    return popup
  }
  function optionMarkup(value, label, selected, disabled = false) {
    return `<div class="control-option" role="option" id="control-option-${++sequence}" data-value="${escape(value)}" aria-selected="${selected}" ${disabled ? 'aria-disabled="true"' : ''}><span>${escape(label)}</span>${icon(selected ? 'check' : '')}</div>`
  }
  function highlight(option) {
    if (!active || !option) return
    active.popup.querySelectorAll('[role=option]').forEach((item) => {
      item.classList.toggle('highlighted', item === option)
    })
    active.input.setAttribute('aria-activedescendant', option.id)
    option.scrollIntoView({ block: 'nearest' })
  }
  function listNavigation(event) {
    if (!active) return
    const options = [...active.popup.querySelectorAll('[role=option]:not([aria-disabled=true])')]
    const current = options.findIndex((option) => option.classList.contains('highlighted'))
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter']
    if (!keys.includes(event.key)) return
    if (active.searchable && ['Home', 'End'].includes(event.key)) return
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Enter') {
      if (options[current]) active.choose(options[current].dataset.value)
      return
    }
    const index =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : current < 0
            ? event.key === 'ArrowDown'
              ? 0
              : options.length - 1
            : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
    highlight(options[index])
  }
  function mountList(anchor, input, items, choose, searchable = false) {
    const popup = open(anchor, input, 'listbox', `${labelFor(input)}选项`, 220)
    popup.innerHTML = items.length
      ? items
          .map((item) =>
            optionMarkup(item.value, item.label, item.value === input.value, item.disabled),
          )
          .join('')
      : '<p class="control-empty" role="status">没有匹配的选项</p>'
    active.choose = choose
    active.searchable = searchable
    popup.addEventListener('pointerdown', (event) => event.preventDefault())
    popup.addEventListener('pointermove', (event) =>
      highlight(event.target.closest('[role=option]:not([aria-disabled=true])')),
    )
    popup.addEventListener('click', (event) => {
      const option = event.target.closest('[role=option]:not([aria-disabled=true])')
      if (option) choose(option.dataset.value)
    })
    position()
    highlight(popup.querySelector('[aria-selected=true]:not([aria-disabled=true])'))
  }
  function enhanceSelect(source) {
    const wrapper = document.createElement('span')
    wrapper.className = 'select-control'
    const trigger = document.createElement('button')
    trigger.type = 'button'
    trigger.className = 'field select-trigger'
    trigger.setAttribute('role', 'combobox')
    trigger.setAttribute('aria-label', labelFor(source))
    trigger.setAttribute('aria-haspopup', 'listbox')
    trigger.setAttribute('aria-expanded', 'false')
    trigger.disabled = source.disabled
    source.before(wrapper)
    wrapper.append(trigger, source)
    source.hidden = true
    source.setAttribute('aria-hidden', 'true')
    source.tabIndex = -1
    const sync = () => {
      trigger.value = source.value
      trigger.innerHTML = `<span>${escape(source.selectedOptions[0]?.label || '请选择')}</span>${icon('expand_more')}`
    }
    const show = () => {
      const items = [...source.options].map((option) => ({
        value: option.value,
        label: option.label,
        disabled: option.disabled || option.parentElement.disabled,
      }))
      mountList(trigger, trigger, items, (value) => {
        source.value = value
        sync()
        emit(source)
        close(true)
      })
    }
    trigger.addEventListener('click', (event) => {
      event.preventDefault()
      active?.anchor === trigger ? close() : show()
    })
    let typed = ''
    let lastTyped = 0
    trigger.addEventListener('keydown', (event) => {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        if (active?.anchor !== trigger) {
          event.preventDefault()
          show()
          if (event.key.startsWith('Arrow')) return
        }
        listNavigation(event)
      } else if (active?.anchor === trigger && event.key === 'Enter') listNavigation(event)
      else if (active?.anchor === trigger && event.key === ' ') {
        event.preventDefault()
        active.popup.querySelector('.highlighted')?.click()
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && event.key !== ' ') {
        event.preventDefault()
        typed = Date.now() - lastTyped > 700 ? event.key : typed + event.key
        lastTyped = Date.now()
        if (active?.anchor !== trigger) show()
        const match = [
          ...active.popup.querySelectorAll('[role=option]:not([aria-disabled=true])'),
        ].find((option) => option.textContent.trim().toLowerCase().startsWith(typed.toLowerCase()))
        highlight(match)
      }
    })
    source.addEventListener('change', sync)
    sync()
  }
  function enhanceAutocomplete(input) {
    const items = [...document.getElementById(input.getAttribute('list')).options].map(
      (option) => ({ value: option.value, label: option.label || option.value }),
    )
    input.removeAttribute('list')
    input.setAttribute('role', 'combobox')
    input.setAttribute('aria-autocomplete', 'list')
    input.setAttribute('aria-expanded', 'false')
    input.setAttribute('autocomplete', 'off')
    const show = () =>
      mountList(
        input,
        input,
        items.filter((item) => item.label.toLowerCase().includes(input.value.toLowerCase())),
        (value) => {
          input.value = value
          emit(input)
          close(true)
        },
        true,
      )
    input.addEventListener('input', (event) => {
      if (event.isTrusted && !event.isComposing) show()
    })
    input.addEventListener('compositionend', show)
    input.addEventListener('click', show)
    input.addEventListener('keydown', (event) => {
      if (event.isComposing) return
      if (active?.anchor !== input && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault()
        show()
      } else if (active?.anchor === input) listNavigation(event)
    })
  }
  const dateValue = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const parseDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
    const [year, month, day] = value.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    return dateValue(date) === value ? date : null
  }
  function openCalendar(trigger, input) {
    let focused = parseDate(input.value) || new Date()
    let month = new Date(focused.getFullYear(), focused.getMonth(), 1)
    const popup = open(trigger, input, 'dialog', '选择日期', 312)
    const draw = () => {
      const first = (month.getDay() + 6) % 7
      const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
      popup.innerHTML = `<header class="calendar-header"><button type="button" class="btn icon-btn" data-month="-1" aria-label="上个月">${icon('chevron_left')}</button><strong aria-live="polite">${month.getFullYear()}年 ${month.getMonth() + 1}月</strong><button type="button" class="btn icon-btn" data-month="1" aria-label="下个月">${icon('chevron_right')}</button></header><div class="calendar-week" aria-hidden="true">${['一', '二', '三', '四', '五', '六', '日'].map((day) => `<span>${day}</span>`).join('')}</div><div class="calendar-grid" role="group" aria-label="日期">${Array.from({ length: first }, () => '<span></span>').join('')}${Array.from(
        { length: days },
        (_, index) => {
          const date = new Date(month.getFullYear(), month.getMonth(), index + 1)
          const value = dateValue(date)
          return `<button type="button" class="calendar-day" data-date="${value}" aria-label="${value}" aria-pressed="${value === input.value}" ${value === dateValue(new Date()) ? 'aria-current="date"' : ''} tabindex="${value === dateValue(focused) ? 0 : -1}">${index + 1}</button>`
        },
      ).join(
        '',
      )}</div><footer class="picker-footer"><button type="button" class="btn text small" data-today>今天</button><span class="muted">方向键选择 · Enter确认</span></footer>`
      position()
    }
    draw()
    const focusDay = () => popup.querySelector(`[data-date="${dateValue(focused)}"]`)?.focus()
    focusDay()
    popup.addEventListener('click', (event) => {
      const day = event.target.closest('[data-date]')
      if (day || event.target.closest('[data-today]')) {
        input.value = day ? day.dataset.date : dateValue(new Date())
        emit(input)
        close(true)
      } else {
        const control = event.target.closest('[data-month]')
        if (!control) return
        month = new Date(month.getFullYear(), month.getMonth() + Number(control.dataset.month), 1)
        focused = new Date(month)
        draw()
        popup.querySelector(`[data-month="${control.dataset.month}"]`).focus()
      }
    })
    popup.addEventListener('keydown', (event) => {
      if (!event.target.matches('[data-date]')) return
      const shifts = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
      if (event.key in shifts) focused.setDate(focused.getDate() + shifts[event.key])
      else if (event.key === 'Home')
        focused.setDate(focused.getDate() - ((focused.getDay() + 6) % 7))
      else if (event.key === 'End')
        focused.setDate(focused.getDate() + 6 - ((focused.getDay() + 6) % 7))
      else if (['PageUp', 'PageDown'].includes(event.key))
        focused = new Date(
          focused.getFullYear(),
          focused.getMonth() + (event.key === 'PageUp' ? -1 : 1),
          1,
        )
      else return
      event.preventDefault()
      month = new Date(focused.getFullYear(), focused.getMonth(), 1)
      draw()
      focusDay()
    })
  }
  function openTime(trigger, input) {
    trigger.value = input.value
    const items = Array.from({ length: 48 }, (_, index) => {
      const value = `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`
      return { value, label: value }
    })
    mountList(trigger, trigger, items, (value) => {
      input.value = value
      emit(input)
      close(true)
    })
    highlight(
      active.popup.querySelector(`[data-value="${input.value}"]`) ||
        active.popup.querySelector('[role=option]'),
    )
  }
  function openColor(trigger, input) {
    const popup = open(trigger, input, 'dialog', '选择颜色', 260)
    const colors = [
      '#6941C6',
      '#4176E6',
      '#16856B',
      '#B45F15',
      '#BA1A1A',
      '#BE4088',
      '#202023',
      '#85858F',
      '#E4E4E7',
      '#FFFFFF',
    ]
    popup.innerHTML = `<p class="picker-title">工作区色板</p><div class="picker-swatches">${colors.map((color) => `<button type="button" class="picker-swatch" style="--swatch:${color}" data-color="${color}" aria-label="${color}" aria-pressed="${color.toLowerCase() === input.value.toLowerCase()}">${color.toLowerCase() === input.value.toLowerCase() ? icon('check') : ''}</button>`).join('')}</div><label class="field-label">HEX颜色值<input class="field color-hex" aria-label="HEX颜色值" maxlength="7" value="${escape(input.value)}" spellcheck="false"></label><div class="picker-footer"><span class="muted">支持 #RRGGBB</span><button type="button" class="btn filled small" data-apply-color>应用</button></div>`
    const hex = popup.querySelector('.color-hex')
    const apply = (value) => {
      if (!/^#[\da-f]{6}$/i.test(value)) {
        hex.setAttribute('aria-invalid', 'true')
        hex.setCustomValidity('请输入 #RRGGBB 格式的颜色值')
        showError(hex)
        return
      }
      input.value = value.toUpperCase()
      emit(input)
      close(true)
    }
    popup.addEventListener('click', (event) => {
      const swatch = event.target.closest('[data-color]')
      if (swatch) apply(swatch.dataset.color)
      if (event.target.closest('[data-apply-color]')) apply(hex.value)
    })
    hex.addEventListener('input', () => {
      hex.setCustomValidity('')
      hex.removeAttribute('aria-invalid')
      clearError(hex)
    })
    hex.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        apply(hex.value)
      }
    })
    position()
    hex.focus()
  }
  function enhancePicker(input) {
    const kind = input.type
    const label = labelFor(input)
    input.setAttribute('aria-label', label)
    input.type = 'text'
    input.dataset.pickerKind = kind
    input.autocomplete = 'off'
    input.spellcheck = false
    input.placeholder = { date: 'YYYY-MM-DD', time: 'HH:mm', color: '#RRGGBB' }[kind]
    input.pattern = {
      date: '[0-9]{4}-[0-9]{2}-[0-9]{2}',
      time: '([01][0-9]|2[0-3]):[0-5][0-9]',
      color: '#[a-fA-F0-9]{6}',
    }[kind]
    const wrapper = document.createElement('span')
    wrapper.className = 'picker-control'
    input.before(wrapper)
    wrapper.append(input)
    const trigger = document.createElement('button')
    trigger.type = 'button'
    trigger.className = 'btn icon-btn picker-trigger'
    trigger.setAttribute('aria-label', `选择${label}`)
    trigger.setAttribute('aria-haspopup', kind === 'time' ? 'listbox' : 'dialog')
    if (kind === 'time') trigger.setAttribute('role', 'combobox')
    trigger.setAttribute('aria-expanded', 'false')
    trigger.innerHTML =
      kind === 'color'
        ? '<span class="color-preview"></span>'
        : icon(kind === 'date' ? 'calendar_today' : 'schedule')
    wrapper.append(trigger)
    const validate = () => {
      const valid =
        !input.value ||
        (kind === 'date'
          ? Boolean(parseDate(input.value))
          : new RegExp(`^${input.pattern}$`).test(input.value))
      input.setCustomValidity(valid ? '' : `请输入有效的${input.placeholder}`)
      if (valid) {
        input.removeAttribute('aria-invalid')
        clearError(input)
      } else {
        input.setAttribute('aria-invalid', 'true')
        showError(input)
      }
      if (kind === 'color' && valid && input.value)
        trigger.style.setProperty('--swatch', input.value)
    }
    input.addEventListener('input', validate)
    input.addEventListener('change', validate)
    validate()
    const show = () =>
      ({ date: openCalendar, time: openTime, color: openColor })[kind](trigger, input)
    trigger.addEventListener('click', (event) => {
      event.preventDefault()
      active?.anchor === trigger ? close() : show()
    })
    trigger.addEventListener('keydown', (event) => {
      if (kind !== 'time') return
      if (active?.anchor !== trigger && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault()
        show()
      } else if (active?.anchor === trigger) listNavigation(event)
    })
    input.addEventListener('keydown', (event) => {
      if (event.altKey && event.key === 'ArrowDown') {
        event.preventDefault()
        show()
      }
    })
  }
  function enhance(container = document) {
    container
      .querySelectorAll(
        'select:not([data-custom-control]), input[list]:not([data-custom-control]), input[type=date], input[type=time], input[type=color]',
      )
      .forEach((source) => {
        source.dataset.customControl = 'true'
        if (source.tagName === 'SELECT') enhanceSelect(source)
        else if (source.hasAttribute('list')) enhanceAutocomplete(source)
        else enhancePicker(source)
      })
  }
  let tooltip = null
  let tooltipTimer
  let tooltipAnchor = null
  function hideTooltip() {
    clearTimeout(tooltipTimer)
    if (!tooltip) return
    const references = (tooltipAnchor.getAttribute('aria-describedby') || '')
      .split(' ')
      .filter((id) => id !== tooltip.id)
    if (references.length) tooltipAnchor.setAttribute('aria-describedby', references.join(' '))
    else tooltipAnchor.removeAttribute('aria-describedby')
    tooltip.remove()
    tooltip = null
    tooltipAnchor = null
  }
  function showTooltip(anchor, delay = 0) {
    hideTooltip()
    if (active) return
    tooltipTimer = setTimeout(() => {
      if (!anchor.isConnected) return
      tooltipAnchor = anchor
      tooltip = document.createElement('div')
      tooltip.className = 'control-tooltip'
      tooltip.id = `control-tooltip-${++sequence}`
      tooltip.setAttribute('role', 'tooltip')
      tooltip.textContent = anchor.getAttribute('aria-label') || anchor.dataset.tooltip
      ;(anchor.closest('dialog') || document.body).append(tooltip)
      anchor.setAttribute(
        'aria-describedby',
        [anchor.getAttribute('aria-describedby'), tooltip.id].filter(Boolean).join(' '),
      )
      const bounds = anchor.getBoundingClientRect()
      const tip = tooltip.getBoundingClientRect()
      tooltip.style.left = `${Math.max(8, Math.min(bounds.left + bounds.width / 2 - tip.width / 2, innerWidth - tip.width - 8))}px`
      tooltip.style.top = `${bounds.top > tip.height + 12 ? bounds.top - tip.height - 6 : bounds.bottom + 6}px`
    }, delay)
  }
  document.addEventListener('pointerover', (event) => {
    const anchor = event.target.closest('[data-tooltip]')
    if (anchor && !anchor.contains(event.relatedTarget)) showTooltip(anchor, 500)
  })
  document.addEventListener('pointerout', (event) => {
    const anchor = event.target.closest('[data-tooltip]')
    if (anchor && !anchor.contains(event.relatedTarget) && document.activeElement !== anchor)
      hideTooltip()
  })
  document.addEventListener('focusin', (event) => {
    if (event.target.matches('[data-tooltip]')) showTooltip(event.target)
    else hideTooltip()
  })
  document.addEventListener('focusout', hideTooltip)
  document.addEventListener('pointerdown', hideTooltip)
  document.addEventListener('scroll', hideTooltip, true)
  window.addEventListener('resize', hideTooltip)
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-color-choice]')
    if (!button) return
    const input = button.closest('.component-demo').querySelector('[data-picker-kind=color]')
    input.value = getComputedStyle(document.documentElement)
      .getPropertyValue(`--md-color-${button.dataset.colorChoice}`)
      .trim()
    emit(input)
    button.parentElement
      .querySelectorAll('button')
      .forEach((item) => item.setAttribute('aria-pressed', String(item === button)))
  })
  function clearError(input) {
    const error = document.getElementById(input.dataset.controlError)
    if (!error) return
    const descriptions = (input.getAttribute('aria-describedby') || '')
      .split(' ')
      .filter((id) => id !== error.id)
    if (descriptions.length) input.setAttribute('aria-describedby', descriptions.join(' '))
    else input.removeAttribute('aria-describedby')
    error.remove()
  }
  function showError(input) {
    let error = document.getElementById(input.dataset.controlError)
    if (!error) {
      error = document.createElement('span')
      error.id = `control-error-${++sequence}`
      error.className = 'control-error'
      error.setAttribute('role', 'status')
      input.dataset.controlError = error.id
      input.setAttribute(
        'aria-describedby',
        [input.getAttribute('aria-describedby'), error.id].filter(Boolean).join(' '),
      )
      ;(input.closest('.picker-control') || input).after(error)
    }
    error.textContent = input.validity.valueMissing
      ? '请填写此项'
      : input.validity.rangeUnderflow
        ? `请输入不小于 ${input.min} 的数值`
        : input.validity.rangeOverflow
          ? `请输入不大于 ${input.max} 的数值`
          : input.validity.stepMismatch
            ? `请按 ${input.step} 的步进输入数值`
            : input.validationMessage
  }
  document.addEventListener(
    'invalid',
    (event) => {
      event.preventDefault()
      event.target.setAttribute('aria-invalid', 'true')
      showError(event.target)
      if (!event.target.form?.querySelector(':invalid:focus'))
        event.target.form?.querySelector(':invalid')?.focus()
    },
    true,
  )
  document.addEventListener('input', (event) => {
    if (event.target.dataset.controlError && event.target.validity.valid) {
      clearError(event.target)
      event.target.removeAttribute('aria-invalid')
    }
  })
  document.addEventListener('pointerdown', (event) => {
    if (
      active &&
      !active.popup.contains(event.target) &&
      !active.anchor.contains(event.target) &&
      event.target !== active.input
    )
      close()
  })
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') hideTooltip()
      if (!active) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        close(true)
      }
      if (event.key === 'Tab') {
        if (active.popup.contains(document.activeElement)) active.anchor.focus()
        close()
      }
    },
    true,
  )
  document.addEventListener('focusin', (event) => {
    if (
      active &&
      !active.popup.contains(event.target) &&
      event.target !== active.anchor &&
      event.target !== active.input
    )
      close()
  })
  window.addEventListener('resize', position)
  document.addEventListener(
    'scroll',
    (event) => {
      if (active && event.target !== active.popup && !active.popup.contains(event.target))
        position()
    },
    true,
  )
  window.addEventListener('hashchange', () => close())
  window.MDControls = { enhance, close }
})()
