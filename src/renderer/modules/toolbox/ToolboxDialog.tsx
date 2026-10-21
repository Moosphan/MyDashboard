import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button } from '@/components/ui/button'

interface ToolboxDialogProps {
  open: boolean
  onClose: () => void
  title: string
  description: string
  children: ReactNode
  footerNote?: string
}

export function ToolboxDialog({ open, onClose, title, description, children, footerNote }: ToolboxDialogProps) {
  return <Dialog.Root open={open} onOpenChange={value => { if (!value) onClose() }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[calc(100%-32px)] max-w-[600px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-xl outline-none">
        <header className="flex items-start justify-between gap-4 border-b border-outline-variant/30 p-md">
          <div className="space-y-2">
            <Dialog.Title className="text-headline-sm text-on-surface">{title}</Dialog.Title>
            <Dialog.Description className="text-body-sm text-on-surface-variant">{description}</Dialog.Description>
          </div>
          <Dialog.Close asChild><Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full hover:bg-surface-container-low" aria-label="关闭弹窗"><span className="material-symbols-outlined text-[18px]" aria-hidden="true">close</span></Button></Dialog.Close>
        </header>
        <div className="min-h-0 overflow-y-auto p-md">{children}</div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/30 bg-surface-container-low/40 px-md py-4">
          <span className="text-[12px] text-on-surface-variant">{footerNote}</span>
          <Button size="sm" className="h-9 px-5" onClick={onClose}>完成</Button>
        </footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
