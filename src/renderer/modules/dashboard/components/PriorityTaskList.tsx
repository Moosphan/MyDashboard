import { useState, useRef, useEffect } from 'react'
import { useIpcData, useIpcMutation } from '@/hooks/useIpc'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface Task {
  id: number
  title: string
  description: string | null
  priority: 'high' | 'medium' | 'low'
  status: string
  due_date: string | null
  created_at: string
  project_id: number | null
  project_name: string | null
  project_color: string | null
  project_icon: string | null
}

const priorityConfig = {
  high: { label: 'High', variant: 'high' as const },
  medium: { label: 'Medium', variant: 'medium' as const },
  low: { label: 'Low', variant: 'low' as const },
}

const allPriorities: Task['priority'][] = ['high', 'medium', 'low']

function TaskActionMenu({
  task,
  onAction,
}: {
  task: Task
  onAction: (action: string, id: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
    setOpen(!open)
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="w-7 h-7 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors opacity-0 group-hover:opacity-100 shrink-0"
      >
        <span className="material-symbols-outlined text-[16px]">more_vert</span>
      </button>

      {open && (
        <div
          ref={menuRef}
          className="fixed bg-surface-container-lowest border border-outline-variant/30 rounded-xl shadow-lg p-1 min-w-[160px] z-[200]"
          style={{ top: pos.top, right: pos.right }}
        >
          <div className="px-md py-sm">
            <p className="font-label-sm text-on-surface-variant text-[10px] uppercase tracking-wider mb-xs">
              Priority
            </p>
            <div className="flex gap-1">
              {allPriorities.map((p) => {
                const cfg = priorityConfig[p]
                return (
                  <button
                    key={p}
                    onClick={(e) => {
                      e.stopPropagation()
                      onAction(`priority:${p}`, task.id)
                      setOpen(false)
                    }}
                    className={cn(
                      'px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors',
                      task.priority === p
                        ? 'ring-1 ring-primary ' + (p === 'high' ? 'bg-secondary-container text-on-secondary-container' : p === 'medium' ? 'bg-primary-fixed text-on-primary-fixed-variant' : 'bg-surface-variant text-on-surface-variant')
                        : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container',
                    )}
                  >
                    {cfg.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="border-t border-outline-variant/20 my-1" />
          <button
            onClick={(e) => {
              e.stopPropagation()
              onAction('delete', task.id)
              setOpen(false)
            }}
            className="w-full flex items-center gap-sm px-md py-sm rounded-lg text-error hover:bg-error/10 transition-colors font-label-md"
          >
            <span className="material-symbols-outlined text-[18px]">delete</span>
            Delete
          </button>
        </div>
      )}
    </>
  )
}

interface PriorityTaskListProps {
  onOpenBoard?: () => void
  onChanged?: () => void
}

export function PriorityTaskList({ onOpenBoard, onChanged }: PriorityTaskListProps) {
  const { data: tasks, loading, refetch } = useIpcData<Task[]>('tasks:getPending', 20)
  const { mutate: updateStatus } = useIpcMutation<boolean>('tasks:updateStatus')
  const { mutate: createTask } = useIpcMutation<number>('tasks:create')
  const { mutate: deleteTask } = useIpcMutation<boolean>('tasks:delete')
  const { mutate: updateTask } = useIpcMutation<boolean>('tasks:update')

  const [showInput, setShowInput] = useState(false)
  const [newTitle, setNewTitle] = useState('')

  const handleToggle = async (task: Task) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed'
    const result = await updateStatus(task.id, newStatus)
    refetch()
    if (result) onChanged?.()
  }

  const handleCreate = async () => {
    if (!newTitle.trim()) return
    const result = await createTask({ title: newTitle.trim() })
    setNewTitle('')
    setShowInput(false)
    refetch()
    if (result !== null) onChanged?.()
  }

  const handleAction = async (action: string, id: number) => {
    let changed = false
    if (action === 'delete') {
      changed = Boolean(await deleteTask(id))
    } else if (action.startsWith('priority:')) {
      const priority = action.replace('priority:', '')
      changed = Boolean(await updateTask(id, { priority }))
    }
    refetch()
    if (changed) onChanged?.()
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-md">
        <h3 className="font-headline-md text-headline-md text-on-surface">Tasks</h3>
        <div className="flex items-center gap-xs">
          {onOpenBoard && (
            <button
              onClick={onOpenBoard}
              className="flex items-center gap-xs px-2 py-1 rounded-full text-[11px] font-bold text-on-surface-variant hover:bg-surface-container transition-colors"
              title="Open board view"
            >
              <span className="material-symbols-outlined text-[16px]">dashboard</span>
              Board
            </button>
          )}
          <button
            onClick={() => setShowInput(!showInput)}
            className="w-8 h-8 rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-on-primary transition-all flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
          </button>
        </div>
      </div>

      {showInput && (
        <div className="bg-surface-container-lowest rounded-lg p-sm border border-primary/30 flex items-center gap-sm mb-sm">
          <input
            autoFocus
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') { setShowInput(false); setNewTitle('') }
            }}
            placeholder="Task title..."
            className="flex-1 bg-transparent outline-none text-body-sm text-on-surface placeholder-on-surface-variant/50"
          />
          <button
            onClick={handleCreate}
            disabled={!newTitle.trim()}
            className="px-3 py-1 bg-primary text-on-primary rounded-full text-label-sm disabled:opacity-40 transition-opacity"
          >
            Add
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-sm">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-surface-container-lowest rounded-lg p-sm border border-outline-variant/30 animate-pulse h-12" />
          ))}
        </div>
      ) : !tasks || tasks.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-lg p-md border border-outline-variant/30 text-center">
          <p className="text-body-sm text-on-surface-variant">No tasks yet</p>
          <button
            onClick={() => setShowInput(true)}
            className="mt-sm text-body-sm text-primary hover:underline"
          >
            Create your first task
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-sm">
          {tasks.map((task) => {
            const config = priorityConfig[task.priority]
            const isCompleted = task.status === 'completed'
            return (
              <div
                key={task.id}
                className="bg-surface-container-lowest rounded-lg p-sm border border-outline-variant/30 flex items-center gap-md group hover:border-primary-container/50 transition-colors shadow-ambient h-12"
              >
                <button
                  onClick={() => handleToggle(task)}
                  className={cn(
                    'w-5 h-5 rounded-sm border-2 flex items-center justify-center shrink-0 transition-colors cursor-pointer',
                    isCompleted
                      ? 'border-primary bg-primary'
                      : 'border-outline-variant group-hover:border-primary',
                  )}
                >
                  {isCompleted && (
                    <span className="material-symbols-outlined text-white text-[14px]">check</span>
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <h4
                    className={cn(
                      'font-label-md text-on-surface truncate',
                      isCompleted && 'line-through text-on-surface-variant',
                    )}
                  >
                    {task.title}
                  </h4>
                </div>
                {task.project_name && (
                  <span
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold shrink-0"
                    title={task.project_name}
                    style={{
                      color: task.project_color || 'var(--color-primary)',
                      backgroundColor: task.project_color ? `${task.project_color}20` : 'var(--color-primary-container)',
                    }}
                  >
                    <span className="material-symbols-outlined text-[10px]">
                      {task.project_icon || 'folder'}
                    </span>
                    <span className="truncate max-w-[96px]">{task.project_name}</span>
                  </span>
                )}
                <Badge variant={config.variant}>{config.label}</Badge>
                <TaskActionMenu task={task} onAction={handleAction} />
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
