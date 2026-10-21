import { lazy } from 'react'
import type { ModuleManifest } from '@shared/types/module'

const manifest: ModuleManifest = {
  id: 'toolbox',
  name: 'Toolbox',
  version: '0.1.0',
  icon: 'construction',
  description: '个人工具与只读套餐用量',
  routes: [{ path: '/toolbox', component: lazy(() => import('./index')) }],
  navItems: [{ label: 'Toolbox', icon: 'construction', path: '/toolbox', position: 'top', order: 6 }],
}

export default manifest
