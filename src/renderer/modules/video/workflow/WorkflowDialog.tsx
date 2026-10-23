import type { ReactNode, RefObject } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button } from '@/components/ui/button'

export function WorkflowDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  returnFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  children: ReactNode
  footer?: ReactNode
  returnFocus?: RefObject<HTMLButtonElement>
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" />
        <Dialog.Content
          className="workflow-dialog voiceover-dialog"
          onCloseAutoFocus={
            returnFocus
              ? (event) => {
                  event.preventDefault()
                  returnFocus.current?.focus()
                }
              : undefined
          }
        >
          <div className="workflow-dialog-header">
            <div>
              <Dialog.Title className="workflow-section-title">{title}</Dialog.Title>
              <Dialog.Description className="workflow-muted mt-2">{description}</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button size="icon" variant="ghost" aria-label={`关闭${title}`}>
                <span aria-hidden="true" className="material-symbols-outlined">
                  close
                </span>
              </Button>
            </Dialog.Close>
          </div>
          <div className="workflow-dialog-body">{children}</div>
          {footer && <div className="workflow-dialog-footer">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
