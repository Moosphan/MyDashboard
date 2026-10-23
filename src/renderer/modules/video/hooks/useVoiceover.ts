import { useCallback, useEffect, useState } from 'react'
import type { IPCResponse } from '@shared/types/ipc'
import type { VoiceJob, VoiceProfile, VoiceRuntime } from '@shared/voiceover'
import { mergeVoiceJobs } from '@shared/voiceover'

export interface VoiceAsset {
  id: number; title: string; file_path: string; duration_seconds: number | null; metadata: string; file_format: string | null
}

export async function voiceCall<T>(channel: string, ...args: unknown[]): Promise<T> {
  const response: IPCResponse<T> = await window.electronAPI.invoke(channel, ...args)
  if (!response.success) throw new Error(response.error || '操作失败')
  return response.data as T
}

export function useVoiceover(open: boolean) {
  const [jobs, setJobs] = useState<VoiceJob[]>([])
  const [profiles, setProfiles] = useState<VoiceProfile[]>([])
  const [runtime, setRuntime] = useState<VoiceRuntime | null>(null)
  const [assets, setAssets] = useState<VoiceAsset[]>([])
  const [trash, setTrash] = useState<VoiceAsset[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const refreshAssets = useCallback(async () => {
    const [generated, trashed] = await Promise.all([voiceCall<VoiceAsset[]>('tts:listAssets'), voiceCall<VoiceAsset[]>('tts:listAssets', true)])
    setAssets(generated); setTrash(trashed)
  }, [])
  const refreshProfiles = useCallback(async () => setProfiles(await voiceCall<VoiceProfile[]>('tts:listProfiles')), [])
  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [snapshot, environment] = await Promise.all([voiceCall<VoiceJob[]>('tts:listJobs'), voiceCall<VoiceRuntime>('tts:getRuntime'), refreshProfiles(), refreshAssets()])
      setJobs(current => mergeVoiceJobs(current, snapshot))
      setRuntime(environment)
      setError(null)
    } catch (failure) { setError((failure as Error).message) }
    finally { setLoading(false) }
  }, [refreshAssets, refreshProfiles])
  useEffect(() => {
    const unsubscribeJobs = window.electronAPI.onVoiceoverJobUpdated(job => setJobs(current => mergeVoiceJobs(current, [job])))
    const unsubscribeAssets = window.electronAPI.onVideoAssetsChanged(() => { if (open) void refreshAssets().catch(failure => setError(failure.message)) })
    if (open) void refresh()
    return () => { unsubscribeJobs(); unsubscribeAssets() }
  }, [open, refresh, refreshAssets])
  return { jobs, profiles, runtime, setRuntime, assets, trash, error, setError, loading, refresh, refreshAssets, refreshProfiles }
}
