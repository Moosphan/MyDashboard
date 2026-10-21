export interface ModuleConfig {
  enabled: boolean
  order?: number
  replace?: string
}

export interface PluginConfig {
  enabled: boolean
  autoLoad: boolean
  sandboxed: boolean
}

export interface FeatureConfig {
  modules: Record<string, ModuleConfig>
  plugins: PluginConfig
}

export const featureConfig: FeatureConfig = {
  modules: {
    dashboard: { enabled: true, order: 1 },
    writing: { enabled: true, order: 2 },
    video: { enabled: true, order: 3 },
    insights: { enabled: true, order: 4 },
    'ai-lab': { enabled: true, order: 5 },
    toolbox: { enabled: true, order: 6 },
    settings: { enabled: true, order: 99 }, // always last, always enabled
  },
  plugins: {
    enabled: true,
    autoLoad: true,
    sandboxed: false,
  },
}
