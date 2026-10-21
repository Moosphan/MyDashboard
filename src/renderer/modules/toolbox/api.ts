import type { ToolboxAPI } from '@shared/toolbox'

declare global {
  interface Window {
    toolboxAPI: ToolboxAPI
  }
}

export const toolboxAPI = window.toolboxAPI
