import { VPN_TOOL_ID, type ToolDescriptor, type ToolboxAction, type ToolboxPreferences, type ToolPreference } from './toolbox'

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9-]{0,79}$/.test(value)
}

export function normalizePreferences(input: unknown, descriptors: ToolDescriptor[]): ToolboxPreferences {
  const tools: ToolPreference[] = []
  if (input !== null && input !== undefined) {
    if (typeof input !== 'object' || !('version' in input) || input.version !== 1 || !('tools' in input) || !Array.isArray(input.tools) || input.tools.length > 200) {
      throw new Error('工具布局格式或版本不受支持')
    }
    for (const item of input.tools) {
      if (!item || !validId(item.id) || typeof item.enabled !== 'boolean' || typeof item.visible !== 'boolean' || typeof item.pinned !== 'boolean' || tools.some(tool => tool.id === item.id)) {
        throw new Error('工具布局数据无效')
      }
      tools.push({ id: item.id, enabled: item.enabled, visible: item.visible, pinned: item.pinned, everEnabled: typeof item.everEnabled === 'boolean' ? item.everEnabled : true })
    }
  }
  for (const descriptor of descriptors) {
    if (!tools.some(tool => tool.id === descriptor.id)) {
      const enabled = input == null && descriptor.id === VPN_TOOL_ID
      tools.push({ id: descriptor.id, enabled, visible: true, pinned: false, everEnabled: enabled })
    }
  }
  return { version: 1, tools }
}

export function applyToolboxAction(preferences: ToolboxPreferences, action: ToolboxAction, registeredIds = preferences.tools.map(tool => tool.id)): ToolboxPreferences {
  if (!action || typeof action !== 'object' || !registeredIds.includes(action.toolId)) throw new Error('工具不存在')
  const tools = preferences.tools.map(tool => ({ ...tool }))
  const tool = tools.find(item => item.id === action.toolId)
  if (!tool) throw new Error('工具不存在')
  if (action.type === 'move') {
    const target = tools.find(item => item.id === action.targetId && registeredIds.includes(item.id))
    if (!target || !target.enabled || !target.visible || !tool.enabled || !tool.visible || tool.pinned !== target.pinned) throw new Error('只能在同组可见工具之间排序')
    const slots = tools.map((item, index) => ({ item, index })).filter(({ item }) => registeredIds.includes(item.id) && item.pinned === tool.pinned && item.enabled && item.visible)
    const ordered = slots.map(({ item }) => item)
    const from = ordered.findIndex(item => item.id === tool.id)
    const to = ordered.findIndex(item => item.id === target.id)
    ordered.splice(to, 0, ordered.splice(from, 1)[0])
    for (const [index, slot] of slots.entries()) tools[slot.index] = ordered[index]
  } else {
    if (typeof action.value !== 'boolean') throw new Error('工具操作无效')
    if (action.type === 'pin') {
      if (tool.pinned !== action.value) {
        tools.splice(tools.indexOf(tool), 1)
        tool.pinned = action.value
        tools.push(tool)
      }
    } else if (action.type === 'visible') {
      if (!tool.enabled) throw new Error('请先启用工具')
      tool.visible = action.value
    } else if (action.type === 'enabled') {
      if (action.value && !tool.everEnabled) {
        tools.splice(tools.indexOf(tool), 1)
        tool.visible = true
        tool.pinned = false
        tool.everEnabled = true
        tools.push(tool)
      }
      tool.enabled = action.value
    } else {
      throw new Error('工具操作无效')
    }
  }
  return { version: 1, tools }
}
