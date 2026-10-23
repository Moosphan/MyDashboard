import { runCommand } from './process'

export async function referenceWaveform(ffmpeg: string, path: string, duration: number): Promise<number[]> {
  const samplesPerPeak = Math.max(1, Math.ceil(duration * 8000 / 1200))
  const filter = `aresample=8000,aformat=channel_layouts=mono,asetnsamples=n=${samplesPerPeak}:p=0,astats=metadata=1:reset=1,ametadata=mode=print:key=lavfi.astats.Overall.Peak_level:file=-`
  const metadata = await runCommand(ffmpeg, ['-nostdin', '-v', 'error', '-i', path, '-vn', '-af', filter, '-f', 'null', '-'], undefined, 120000)
  const peaks = [...metadata.matchAll(/lavfi\.astats\.Overall\.Peak_level=([^\r\n]+)/g)].map(match => {
    const decibels = Number(match[1])
    return Number.isFinite(decibels) ? Math.min(1, 10 ** (decibels / 20)) : 0
  })
  if (!peaks.length) throw new Error('REFERENCE_INVALID: 无法读取参考录音波形，请重新导入')
  return peaks.slice(0, 1200)
}
