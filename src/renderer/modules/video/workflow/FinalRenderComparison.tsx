import { useRef, useState } from 'react'
import { ArrowsRightLeftIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/ui/button'
import type { RenderPayload, VideoProject, WorkflowRevision } from '@shared/video-workflow'
import { compareFinalRender } from '@shared/video-render-comparison'
import { WorkflowDialog } from './WorkflowDialog'

function sizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function qualityLabel(render?: RenderPayload) {
  return render?.renderProfile?.quality === 'delivery'
    ? '交付质量（delivery）'
    : render?.renderProfile?.quality === 'looks'
      ? '预览质量（looks）'
      : '未记录编码参数'
}

function checkLabel(render?: RenderPayload) {
  try {
    const check = JSON.parse(render?.checks ?? '')
    if (check.ok === true && Number.isInteger(check.samples) && check.samples > 0)
      return `通过 · ${check.samples} 个浏览器布局样本`
  } catch {
    return '未记录可核验的检查结果'
  }
  return '未记录可核验的检查结果'
}

export function FinalRenderComparison({
  project,
  revision,
}: {
  project: VideoProject
  revision: WorkflowRevision
}) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const output = revision.payload as RenderPayload
  const comparison = compareFinalRender(project, revision)
  const before = comparison.source?.payload as RenderPayload | undefined
  const unchanged = comparison.sameComposition
  const summary =
    comparison.qualityChange === 'same-file'
      ? '输出文件与来源粗剪完全相同，本版没有新增编码或内容改进。'
      : comparison.qualityChange === 'delivery'
        ? '本版将预览编码切换为交付编码，主要优化压缩保真；视觉差异可能较小。'
        : comparison.qualityChange === 'unknown'
          ? '历史版本未记录编码参数或缺少来源粗剪，无法核实质量参数的变化。'
          : comparison.qualityChange === 'unchanged'
            ? '本版与来源粗剪使用相同编码质量预设，没有编码档位提升。'
            : '本版编码预设发生变化，具体参数见对比；不据此推断画质提升。'
  const dimensions = (render?: RenderPayload) =>
    render
      ? `${render.width} × ${render.height} · ${render.renderProfile?.fps ? `${render.renderProfile.fps} fps` : '帧率未记录'}`
      : '来源缺失'
  const rows = [
    ['编码质量', before ? qualityLabel(before) : '来源缺失', qualityLabel(output)],
    ['输出规格', dimensions(before), dimensions(output)],
    [
      '实测时长',
      before ? `${before.duration.toFixed(2)} 秒` : '来源缺失',
      `${output.duration.toFixed(2)} 秒`,
    ],
    ['文件大小', before ? sizeLabel(before.file.size) : '来源缺失', sizeLabel(output.file.size)],
    ['渲染检查', checkLabel(before), checkLabel(output)],
  ]
  return (
    <>
      <Button
        ref={trigger}
        type="button"
        size="icon"
        variant="ghost"
        aria-label="查看相较粗剪的变化"
        title="相较粗剪的变化"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <ArrowsRightLeftIcon aria-hidden="true" className="size-5" />
      </Button>
      <WorkflowDialog
        open={open}
        onOpenChange={setOpen}
        title="相较粗剪的变化"
        description={`正式成片 v${revision.version} 与来源粗剪的实际输出对比。`}
        returnFocus={trigger}
      >
        <section className="workflow-section" data-final-render-comparison>
          <p className="workflow-muted">
            正式成片 v{revision.version} · {new Date(revision.createdAt).toLocaleString('zh-CN')}
            {comparison.source
              ? `；${comparison.sourceMatch === 'recorded' ? '来源' : '按冻结工程匹配'}粗剪 v${comparison.source.version} · ${new Date(comparison.source.createdAt).toLocaleString('zh-CN')}`
              : '；未找到对应的来源粗剪，无法完整比较。'}
          </p>
          <p className="text-body-sm" data-render-quality-summary>
            {summary}
          </p>
          <p className="text-body-sm">
            {unchanged
              ? '冻结工程一致，画面、动画、配音和字幕保持一致；本次未重新创作内容。'
              : unchanged === false
                ? '冻结工程与来源粗剪不一致，请核对画面与声音；本页不推断具体内容改动。'
                : '来源记录不足，无法核实画面、动画、配音和字幕是否保持一致。'}
          </p>
          <div className="overflow-x-auto">
            <table className="relative w-full text-body-sm text-left">
              <caption className="sr-only">正式成片与来源粗剪输出对比</caption>
              <thead>
                <tr>
                  <th scope="col" className="pb-2 pr-3">
                    对比项
                  </th>
                  <th scope="col" className="pb-2 pr-3">
                    粗剪{comparison.source ? ` v${comparison.source.version}` : ''}
                  </th>
                  <th scope="col" className="pb-2">
                    正式成片 v{revision.version}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, previous, current]) => (
                  <tr key={label}>
                    <th scope="row" className="pb-2 pr-3 font-medium align-top">
                      {label}
                    </th>
                    <td className="pb-2 pr-3 align-top">{previous}</td>
                    <td className="pb-2 align-top">{current}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="workflow-muted">
            {comparison.sizeDelta !== undefined && before && before.file.size > 0
              ? `文件体积${comparison.sizeDelta === 0 ? '相同' : `${comparison.sizeDelta > 0 ? '增加' : '减少'} ${sizeLabel(Math.abs(comparison.sizeDelta))}（${Math.abs((comparison.sizeDelta / before.file.size) * 100).toFixed(1)}%）`}；`
              : ''}
            文件更大不代表观感一定更好。渲染检查为抽样检查，仍需完整观看后审核。
          </p>
        </section>
      </WorkflowDialog>
    </>
  )
}
