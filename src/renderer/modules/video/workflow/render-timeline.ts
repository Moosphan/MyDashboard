type SceneTiming = { id: string; start: number; end: number; seek: number }

export function renderSceneTimeline(
  scenes: { id: string }[],
  tracks: { sceneId: string; duration: number }[],
): SceneTiming[] {
  let start = 0
  return scenes.map((scene) => {
    const duration = tracks
      .filter((track) => track.sceneId === scene.id)
      .reduce((total, track) => total + track.duration, 0)
    const boundary = Math.round(start * 1e6) / 1e6
    const entry = {
      id: scene.id,
      start: boundary,
      end: Math.round((start + duration) * 1e6) / 1e6,
      seek: Math.ceil(boundary * 30 - 1e-7) / 30,
    }
    start += duration
    return entry
  })
}

export function renderSceneAtTime(timeline: SceneTiming[], time: number): number {
  for (let index = timeline.length - 1; index >= 0; index--) {
    if (time + 1e-6 >= timeline[index].start) return index
  }
  return 0
}
