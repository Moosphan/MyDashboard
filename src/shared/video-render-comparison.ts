import type { RenderPayload, VideoProject, WorkflowRevision } from './video-workflow'

function sameComposition(left: RenderPayload, right: RenderPayload) {
  return (
    left.manifestHash === right.manifestHash &&
    left.compositionFiles.length === right.compositionFiles.length &&
    left.compositionFiles.every(
      (file, index) =>
        file.sha256 === right.compositionFiles[index]?.sha256 &&
        left.compositionNames[index] === right.compositionNames[index],
    )
  )
}

export function compareFinalRender(project: VideoProject, revision: WorkflowRevision) {
  const output = revision.payload as RenderPayload
  const roughcuts = project.history.filter((item) => item.stage === 'roughcut')
  const source = output.sourceRoughcut
    ? roughcuts.find((item) => item.id === output.sourceRoughcut)
    : roughcuts
        .filter((item) => {
          const payload = item.payload as RenderPayload
          return (
            item.createdAt <= revision.createdAt &&
            sameComposition(payload, output) &&
            payload.sourceStoryboard === output.sourceStoryboard &&
            payload.sourceAudio === output.sourceAudio &&
            payload.sourceNarration === output.sourceNarration
          )
        })
        .sort((left, right) => right.version - left.version)[0]
  const before = source?.payload as RenderPayload | undefined
  const sameFile = before ? before.file.sha256 === output.file.sha256 : undefined
  const beforeQuality = before?.renderProfile?.quality
  const quality = output.renderProfile?.quality
  return {
    source,
    sourceMatch: source ? (output.sourceRoughcut ? 'recorded' : 'matched') : 'missing',
    sameComposition: before ? sameComposition(before, output) : undefined,
    sameFile,
    qualityChange: sameFile
      ? 'same-file'
      : !beforeQuality || !quality
        ? 'unknown'
        : beforeQuality === 'looks' && quality === 'delivery'
          ? 'delivery'
          : beforeQuality === quality
            ? 'unchanged'
            : 'changed',
    durationDelta: before ? output.duration - before.duration : undefined,
    sizeDelta: before ? output.file.size - before.file.size : undefined,
  }
}
