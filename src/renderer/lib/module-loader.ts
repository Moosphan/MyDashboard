import type { ModuleManifest } from '@shared/types/module'
import { moduleRegistry } from './module-registry'
import { extensionRegistry } from './extension-registry'
import { featureConfig } from '@root/feature.config'

// Module manifests - each module exports its manifest as default
import dashboardManifest from '@/modules/dashboard/manifest'
import writingManifest from '@/modules/writing/manifest'
import videoManifest from '@/modules/video/manifest'
import insightsManifest from '@/modules/insights/manifest'
import aiLabManifest from '@/modules/ai-lab/manifest'
import settingsManifest from '@/modules/settings/manifest'
import toolboxManifest from '@/modules/toolbox/manifest'

const builtinManifests: ModuleManifest[] = [
  dashboardManifest,
  writingManifest,
  videoManifest,
  insightsManifest,
  aiLabManifest,
  toolboxManifest,
  settingsManifest,
]

/**
 * Load all enabled modules into the registry.
 * Called once at app startup.
 */
export function loadModules(): void {
  const enabledIds: string[] = []

  // Register all built-in modules
  for (const manifest of builtinManifests) {
    const config = featureConfig.modules[manifest.id]
    if (config?.enabled !== false) {
      moduleRegistry.register(manifest)
      enabledIds.push(manifest.id)

      // Register module's nav items as sidebar extension points
      for (const nav of manifest.navItems) {
        extensionRegistry.register({
          id: `nav:${manifest.id}:${nav.path}`,
          type: 'sidebar.nav',
          target: `sidebar.${nav.position}`,
          label: nav.label,
          icon: nav.icon,
          path: nav.path,
          order: nav.order,
          source: 'builtin',
        })
      }

      // Register module's widgets as extension points
      if (manifest.widgets) {
        for (const widget of manifest.widgets) {
          extensionRegistry.register({
            id: `widget:${manifest.id}:${widget.id}`,
            type: 'widget',
            target: widget.zone,
            component: widget.component,
            label: widget.title,
            icon: widget.icon,
            order: widget.order,
            source: 'builtin',
          })
        }
      }
    }
  }
}

/**
 * Get all enabled module IDs
 */
export function getEnabledModuleIds(): string[] {
  return Object.entries(featureConfig.modules)
    .filter(([_, cfg]) => cfg.enabled !== false)
    .sort((a, b) => (a[1].order ?? 999) - (b[1].order ?? 999))
    .map(([id]) => id)
}
