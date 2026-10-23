import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from 'electron'
import { join } from 'node:path'
import { getDatabase } from '../database/connection'
import { getVoiceoverService } from '../services/tts-service'
import { VideoWorkflowService, type WorkflowGeneration } from '../services/video-workflow/service'
import type { VideoStage, VideoPlatform } from '../../shared/video-workflow'
import { workflowMediaResponse } from '../services/video-workflow/media'

let service: VideoWorkflowService | undefined
let getWindow: () => BrowserWindow | null = () => null
export function getVideoWorkflow() {
  service ??= new VideoWorkflowService(
    app.getPath('userData'),
    getDatabase(),
    getVoiceoverService,
    (projectId) => {
      const window = getWindow()
      if (window && !window.isDestroyed()) window.webContents.send('workflow:updated', projectId)
    },
  )
  return service
}
export async function stopVideoWorkflow() {
  await service?.dispose()
  service = undefined
}
export function registerVideoWorkflowProtocol() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'video-workflow',
      privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true },
    },
  ])
}
export function registerVideoWorkflowHandlers(mainWindow: () => BrowserWindow | null) {
  getWindow = mainWindow
  protocol.handle('video-workflow', async (request) => {
    try {
      const url = new URL(request.url),
        fileId = url.pathname.slice(1)
      if (!/^[a-f0-9-]{36}$/.test(url.hostname) || !/^[a-f0-9-]{36}$/.test(fileId))
        return new Response('Not found', { status: 404 })
      const workflow = getVideoWorkflow(),
        file = workflow.repository.file(url.hostname, fileId)
      if (!file || !/^(audio|video|image)\//.test(file.mime))
        return new Response('Not found', { status: 404 })
      return workflowMediaResponse(workflow.files, file, request)
    } catch {
      return new Response('Media unavailable', { status: 404 })
    }
  })
  const handle = <Arguments extends unknown[]>(
    channel: string,
    action: (...args: Arguments) => unknown,
  ) => {
    ipcMain.handle(channel, async (event, ...args: unknown[]) => {
      const window = mainWindow()
      if (
        !window ||
        window.isDestroyed() ||
        event.sender !== window.webContents ||
        event.senderFrame !== window.webContents.mainFrame
      )
        return { success: false, error: '工作流仅可在应用主窗口操作' }
      try {
        return { success: true, data: await action(...(args as Arguments)) }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    })
  }
  const selectFolder = async () => {
    const result = await dialog.showOpenDialog(mainWindow()!, {
      title: '选择导出目录',
      properties: ['openDirectory', 'createDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  }
  handle('workflow:list', (archived: boolean) =>
    getVideoWorkflow().repository.list(archived === true),
  )
  handle('workflow:create', (title: string) => getVideoWorkflow().repository.create(title))
  handle('workflow:get', (id: string) => getVideoWorkflow().repository.get(id))
  handle(
    'workflow:save',
    (id: string, stage: VideoStage, payload: unknown, expected: number, request: string) =>
      getVideoWorkflow().save(id, stage, payload, expected, request),
  )
  handle(
    'workflow:approve',
    (
      id: string,
      stage: VideoStage,
      revision: string,
      expected: number,
      request: string,
      note: string,
    ) => getVideoWorkflow().approve(id, stage, revision, expected, request, note),
  )
  handle('workflow:archive', (id: string, archived: boolean, expected: number) =>
    getVideoWorkflow().repository.archive(id, archived === true, expected),
  )
  handle('workflow:generate', (input: WorkflowGeneration) => getVideoWorkflow().generate(input))
  handle('workflow:templates', () =>
    getVideoWorkflow()
      .repository.templates()
      .map(({ storyboard: _storyboard, motion, ...template }) => ({
        ...template,
        motionEnabled: !!motion,
      })),
  )
  handle(
    'workflow:saveTemplate',
    (id: string, expected: number, name: string, description: string) =>
      getVideoWorkflow().saveTemplate(id, expected, name, description),
  )
  handle('workflow:exportComposition', async (id: string, stage: 'roughcut' | 'render') => {
    const directory = await selectFolder()
    if (!directory) return null
    const exported = await getVideoWorkflow().exportComposition(id, stage, directory)
    shell.showItemInFolder(join(exported, 'index.html'))
    return exported
  })
  handle('workflow:cancel', (id: string) => getVideoWorkflow().cancel(id))
  handle('workflow:runtime', () => getVideoWorkflow().runtime.get())
  handle('workflow:configure', (input: unknown) => getVideoWorkflow().runtime.set(input))
  handle('workflow:checkRuntime', () => getVideoWorkflow().runtime.check(app.getPath('userData')))
  handle('workflow:preview', (id: string, storyboard: unknown, sceneId: string) =>
    getVideoWorkflow().preview(id, storyboard, sceneId),
  )
  handle('workflow:importReference', async (id: string) => {
    const result = await dialog.showOpenDialog(mainWindow()!, {
      title: '导入参考 HTML',
      properties: ['openFile'],
      filters: [{ name: 'HTML', extensions: ['html'] }],
    })
    return result.canceled ? null : getVideoWorkflow().files.import(id, result.filePaths[0])
  })
  handle('workflow:import', async (id: string, stage: VideoStage, expected: number) => {
    const result = await dialog.showOpenDialog(mainWindow()!, {
      title: '导入阶段结果',
      properties: ['openFile'],
      filters: [
        {
          name: '阶段结果',
          extensions:
            stage === 'copy'
              ? ['md', 'txt', 'json']
              : stage === 'storyboard'
                ? ['json', 'html']
                : ['json'],
        },
      ],
    })
    return result.canceled
      ? null
      : getVideoWorkflow().importStage(id, stage, expected, result.filePaths[0])
  })
  handle('workflow:importAudio', async (input: WorkflowGeneration) => {
    const result = await dialog.showOpenDialog(mainWindow()!, {
      title: '按分镜顺序选择音频（文件名排序）',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '音频', extensions: ['wav', 'mp3', 'm4a'] }],
    })
    return result.canceled
      ? null
      : getVideoWorkflow().generate(
          { ...input, stage: 'audio', executor: 'template' },
          result.filePaths.sort((first, second) =>
            first.localeCompare(second, undefined, { numeric: true }),
          ),
        )
  })
  handle('workflow:exportTask', async (input: WorkflowGeneration) => {
    const directory = await selectFolder()
    return directory ? getVideoWorkflow().exportTask(input, directory) : null
  })
  handle('workflow:export', async (id: string, platform: VideoPlatform) => {
    const directory = await selectFolder()
    return directory ? getVideoWorkflow().exportPublication(id, platform, directory) : null
  })
  handle('workflow:receipt', (projectId: string, id: string, url: string) =>
    getVideoWorkflow().repository.receipt(projectId, id, url),
  )
  handle('workflow:revealExport', (projectId: string, publicationId: string) => {
    const record = getVideoWorkflow()
      .repository.get(projectId)
      .publications.find((item) => item.id === publicationId)
    if (!record) throw new Error('发布包不存在')
    shell.showItemInFolder(join(record.exportPath, 'video.mp4'))
  })
}
