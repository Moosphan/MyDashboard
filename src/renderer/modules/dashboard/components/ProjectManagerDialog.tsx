import { useState, useEffect, useRef } from 'react'
import { DndContext, DragOverlay, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, useDroppable, type DragStartEvent, type DragEndEvent, type DragOverEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useIpcData, useIpcMutation } from '@/hooks/useIpc'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { Progress } from '@/components/ui/progress'

interface Project {
  id: number
  name: string
  description: string | null
  icon: string | null
  color: string | null
  progress: number
  status: string
  is_focus: number
  start_date: string | null
  target_date: string | null
}

interface Task {
  id: number
  title: string
  description: string | null
  priority: 'high' | 'medium' | 'low'
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  due_date: string | null
  project_id: number | null
  tags: string
  sort_order: number
  created_at: string
}

interface ProjectManagerDialogProps {
  open: boolean
  onClose: () => void
  onChanged?: () => void
  initialProjectId?: number | null
}

const STATUS_COLUMNS = [
  { key: 'pending', label: 'To Do', icon: 'radio_button_unchecked', color: 'bg-surface-container', textColor: 'text-on-surface-variant' },
  { key: 'in_progress', label: 'In Progress', icon: 'pending', color: 'bg-primary/10', textColor: 'text-primary' },
  { key: 'completed', label: 'Done', icon: 'check_circle', color: 'bg-green-500/10', textColor: 'text-green-600' },
]

const PRIORITY_CONFIG = {
  high: { label: 'High', color: 'bg-error/10 text-error', icon: 'arrow_upward' },
  medium: { label: 'Medium', color: 'bg-warning/10 text-warning', icon: 'remove' },
  low: { label: 'Low', color: 'bg-surface-container text-on-surface-variant', icon: 'arrow_downward' },
}

const PROJECT_ICONS = ['rocket_launch', 'code', 'palette', 'smart_toy', 'school', 'work', 'science', 'design_services', 'music_note', 'sports_esports']
const PROJECT_COLORS = ['#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899', '#14B8A6', '#F97316']

// Sortable Task Card Component
function SortableTaskCard({ task, onDelete }: { task: Task; onDelete: (id: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const pConfig = PRIORITY_CONFIG[task.priority]

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const formatDate = (date: string | null) => {
    if (!date) return ''
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="group p-sm rounded-lg bg-surface-container-lowest border border-outline-variant/30 hover:border-outline-variant/60 transition-colors cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-xs mb-xs">
        <h4 className="text-[12px] font-bold text-on-surface flex-1">{task.title}</h4>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(task.id) }}
          className="w-5 h-5 rounded flex items-center justify-center text-on-surface-variant hover:text-error opacity-0 group-hover:opacity-100 transition-all shrink-0"
        >
          <span className="material-symbols-outlined text-[14px]">close</span>
        </button>
      </div>

      {task.description && (
        <p className="text-[11px] text-on-surface-variant mb-xs line-clamp-2">{task.description}</p>
      )}

      <div className="flex items-center gap-xs flex-wrap">
        <span className={cn('flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold', pConfig.color)}>
          <span className="material-symbols-outlined text-[10px]">{pConfig.icon}</span>
          {pConfig.label}
        </span>
        {task.due_date && (
          <span className="flex items-center gap-0.5 text-[10px] text-on-surface-variant">
            <span className="material-symbols-outlined text-[12px]">event</span>
            {formatDate(task.due_date)}
          </span>
        )}
      </div>
    </div>
  )
}

// Droppable Column Component
function DroppableColumn({ column, tasks, onDelete }: { column: typeof STATUS_COLUMNS[0]; tasks: Task[]; onDelete: (id: number) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key })

  return (
    <div className={cn('flex flex-col min-h-0 rounded-xl p-sm transition-colors', isOver ? 'bg-primary/10' : 'bg-surface-container/50')}>
      {/* Column Header */}
      <div className="flex items-center gap-xs mb-sm shrink-0 px-xs">
        <span className={cn('material-symbols-outlined text-[16px]', column.textColor)}>{column.icon}</span>
        <span className="text-[12px] font-bold text-on-surface">{column.label}</span>
        <span className="ml-auto text-[11px] text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded-full">
          {tasks.length}
        </span>
      </div>

      {/* Cards */}
      <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex-1 overflow-y-auto space-y-xs min-h-[100px]">
          {tasks.map(task => (
            <SortableTaskCard key={task.id} task={task} onDelete={onDelete} />
          ))}

          {tasks.length === 0 && (
            <div className="text-center py-md text-[11px] text-on-surface-variant/50">
              Drop tasks here
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  )
}

export function ProjectManagerDialog({ open, onClose, onChanged, initialProjectId = null }: ProjectManagerDialogProps) {
  const { toast } = useToast()
  const { data: projects, refetch: refetchProjects } = useIpcData<Project[]>('projects:getActive')
  const { mutate: createProject } = useIpcMutation<number>('projects:create')
  const { mutate: deleteProject } = useIpcMutation<boolean>('projects:delete')
  const { mutate: setFocus } = useIpcMutation<unknown>('projects:setFocus')
  const { mutate: createTask } = useIpcMutation<number>('tasks:create')
  const { mutate: updateTaskStatus } = useIpcMutation<boolean>('tasks:updateStatus')
  const { mutate: deleteTask } = useIpcMutation<boolean>('tasks:delete')

  const [view, setView] = useState<'dashboard' | 'board'>('dashboard')
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const dragOriginalStatusRef = useRef<Task['status'] | null>(null)

  // Project form
  const [showProjectForm, setShowProjectForm] = useState(false)
  const [projectForm, setProjectForm] = useState({
    name: '', description: '', icon: 'rocket_launch', color: PROJECT_COLORS[0], start_date: '', target_date: '',
  })

  // Task form
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [taskForm, setTaskForm] = useState({
    title: '', description: '', priority: 'medium' as Task['priority'], due_date: '',
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  )

  useEffect(() => {
    if (!open) return
    if (initialProjectId === null) {
      setView('dashboard')
      setSelectedProject(null)
      return
    }
    const project = projects?.find((item) => item.id === initialProjectId)
    if (project) {
      setSelectedProject(project)
      setView('board')
    }
  }, [open, initialProjectId, projects])

  useEffect(() => {
    if (selectedProject) fetchTasks()
  }, [selectedProject])

  const fetchTasks = async () => {
    if (!selectedProject) return
    try {
      const res = await window.electronAPI.invoke('tasks:getByProject', selectedProject.id)
      if (res?.success) setTasks(res.data || [])
    } catch { /* ignore */ }
  }

  const handleCreateProject = async () => {
    if (!projectForm.name.trim()) { toast({ title: 'Project name is required', variant: 'error' }); return }
    try {
      const projectId = await createProject({ name: projectForm.name.trim(), description: projectForm.description.trim() || undefined, icon: projectForm.icon, color: projectForm.color, start_date: projectForm.start_date || undefined, target_date: projectForm.target_date || undefined })
      if (projectId === null) throw new Error('Failed to create project')
      toast({ title: 'Project created', variant: 'success' })
      setShowProjectForm(false)
      setProjectForm({ name: '', description: '', icon: 'rocket_launch', color: PROJECT_COLORS[0], start_date: '', target_date: '' })
      await refetchProjects()
      onChanged?.()
    } catch { toast({ title: 'Failed to create project', variant: 'error' }) }
  }

  const handleDeleteProject = async (id: number) => {
    try {
      const deleted = await deleteProject(id)
      if (deleted === null) throw new Error('Failed to delete project')
      toast({ title: 'Project deleted', variant: 'success' })
      await refetchProjects()
      onChanged?.()
      if (selectedProject?.id === id) { setSelectedProject(null); setView('dashboard') }
    } catch { toast({ title: 'Failed to delete project', variant: 'error' }) }
  }

  const handleSetFocus = async (id: number) => {
    const result = await setFocus(id)
    if (result === null) {
      toast({ title: 'Only active projects can be the main focus', variant: 'error' })
      return
    }
    await refetchProjects()
    onChanged?.()
    toast({ title: 'Main project updated', variant: 'success' })
  }

  const handleCreateTask = async () => {
    if (!taskForm.title.trim() || !selectedProject) return
    try {
      const result = await createTask({ title: taskForm.title.trim(), description: taskForm.description.trim() || undefined, priority: taskForm.priority, due_date: taskForm.due_date || undefined, project_id: selectedProject.id })
      if (result === null) throw new Error('Failed to create task')
      toast({ title: 'Task created', variant: 'success' })
      setShowTaskForm(false)
      setTaskForm({ title: '', description: '', priority: 'medium', due_date: '' })
      fetchTasks()
      onChanged?.()
    } catch { toast({ title: 'Failed to create task', variant: 'error' }) }
  }

  const handleDeleteTask = async (taskId: number) => {
    try {
      const result = await deleteTask(taskId)
      if (!result) throw new Error('Failed to delete task')
      setTasks(prev => prev.filter(t => t.id !== taskId))
      onChanged?.()
    } catch { /* ignore */ }
  }

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find(t => t.id === event.active.id)
    if (task) {
      setActiveTask(task)
      dragOriginalStatusRef.current = task.status
    }
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const activeId = active.id as number
    const overId = over.id as number

    const activeTask = tasks.find(t => t.id === activeId)
    if (!activeTask) return

    // Check if dropping over a column
    const overColumn = (over.data.current as any)?.column
    if (overColumn && activeTask.status !== overColumn) {
      setTasks(prev => prev.map(t => t.id === activeId ? { ...t, status: overColumn as Task['status'] } : t))
      return
    }

    // Check if dropping over another task
    const overTask = tasks.find(t => t.id === overId)
    if (overTask && activeTask.status !== overTask.status) {
      setTasks(prev => prev.map(t => t.id === activeId ? { ...t, status: overTask.status } : t))
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTask(null)

    if (!over) return

    const activeId = active.id as number
    const originalStatus = dragOriginalStatusRef.current
    const task = tasks.find(t => t.id === activeId)
    if (!task || !originalStatus) return

    // Determine the new status from the drop target
    let newStatus = task.status

    // Check if dropped on a column directly
    const overId = over.id as string
    if (STATUS_COLUMNS.some(col => col.key === overId)) {
      newStatus = overId as Task['status']
    } else {
      // Dropped on another task - get that task's status
      const overTask = tasks.find(t => t.id === over.id)
      if (overTask) {
        newStatus = overTask.status
      }
    }

    // Only persist if status actually changed from before the drag started
    if (newStatus !== originalStatus) {
      setTasks(prev => prev.map(t => t.id === activeId ? { ...t, status: newStatus } : t))
      try {
        const result = await updateTaskStatus(activeId, newStatus)
        if (!result) {
          setTasks(prev => prev.map(t => t.id === activeId ? { ...t, status: originalStatus } : t))
        } else {
          onChanged?.()
        }
      } catch {
        // Revert to the original status on failure
        setTasks(prev => prev.map(t => t.id === activeId ? { ...t, status: originalStatus } : t))
      }
    }
    dragOriginalStatusRef.current = null
  }

  const getTasksByStatus = (status: string) => tasks.filter(t => t.status === status)

  const formatDate = (date: string | null) => {
    if (!date) return ''
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface-container-lowest w-full max-w-5xl h-[80vh] rounded-2xl shadow-2xl border border-outline-variant/30 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-md py-3 border-b border-outline-variant/30 flex items-center justify-between shrink-0 bg-surface">
          <div className="flex items-center gap-sm">
            <span className="material-symbols-outlined text-primary">folder_open</span>
            <h3 className="font-headline-sm text-headline-sm text-on-surface">
              {view === 'dashboard' ? 'Projects' : selectedProject?.name}
            </h3>
            {view === 'board' && (
              <button onClick={() => setView('dashboard')} className="flex items-center gap-xs px-2 py-0.5 rounded-full text-[11px] text-on-surface-variant hover:bg-surface-container transition-colors">
                <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-xs">
            {view === 'dashboard' && (
              <button onClick={() => setShowProjectForm(true)} className="flex items-center gap-xs px-3 py-1.5 bg-primary text-on-primary rounded-full font-label-md hover:brightness-110 active:scale-95 transition-all text-body-sm">
                <span className="material-symbols-outlined text-[16px]">add</span>
                New Project
              </button>
            )}
            {view === 'board' && (
              <button onClick={() => setShowTaskForm(true)} className="flex items-center gap-xs px-3 py-1.5 bg-primary text-on-primary rounded-full font-label-md hover:brightness-110 active:scale-95 transition-all text-body-sm">
                <span className="material-symbols-outlined text-[16px]">add</span>
                New Task
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors">
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {view === 'dashboard' ? (
            <div className="h-full overflow-y-auto p-md">
              {!projects || projects.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <span className="material-symbols-outlined text-[64px] text-on-surface-variant/20 mb-md">folder_open</span>
                  <h4 className="font-headline-md text-headline-md text-on-surface mb-xs">No projects yet</h4>
                  <p className="text-body-sm text-on-surface-variant mb-lg">Create your first project to get started</p>
                  <button onClick={() => setShowProjectForm(true)} className="flex items-center gap-xs px-md py-2 bg-primary text-on-primary rounded-full font-label-md hover:brightness-110 transition-all">
                    <span className="material-symbols-outlined text-[18px]">add</span>
                    Create Project
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                  {projects.map(project => (
                    <div key={project.id} onClick={() => { setSelectedProject(project); setView('board') }} className="group p-md rounded-xl bg-surface border border-outline-variant/30 hover:border-primary/30 hover:shadow-ambient transition-all cursor-pointer">
                      <div className="flex items-start justify-between mb-sm">
                        <div className="flex items-center gap-sm">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: project.color ? `${project.color}20` : 'var(--color-primary-container)' }}>
                            <span className="material-symbols-outlined text-[20px]" style={{ color: project.color || 'var(--color-primary)' }}>{project.icon || 'rocket_launch'}</span>
                          </div>
                          <div>
                            <h4 className="font-label-md font-bold text-on-surface">{project.name}</h4>
                            {project.description && <p className="text-[11px] text-on-surface-variant truncate max-w-[200px]">{project.description}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-xs">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleSetFocus(project.id) }}
                            className={cn(
                              'h-6 rounded-full px-2 flex items-center gap-0.5 text-[10px] font-bold transition-colors',
                              project.is_focus
                                ? 'bg-primary/10 text-primary'
                                : 'text-on-surface-variant hover:bg-primary/10 hover:text-primary',
                            )}
                            aria-label={project.is_focus ? 'Current main project' : `Set ${project.name} as main project`}
                          >
                            <span className="material-symbols-outlined text-[14px]">{project.is_focus ? 'star' : 'star_outline'}</span>
                            {project.is_focus ? 'Main focus' : 'Set focus'}
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteProject(project.id) }} className="w-6 h-6 rounded-full flex items-center justify-center text-on-surface-variant hover:text-error opacity-0 group-hover:opacity-100 transition-all">
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-sm mb-xs">
                        <Progress value={project.progress} className="flex-1" />
                        <span className="text-[11px] font-bold text-primary">{project.progress}%</span>
                      </div>
                      <div className="flex items-center gap-xs text-[10px] text-on-surface-variant">
                        {project.start_date && <span>{formatDate(project.start_date)}</span>}
                        {project.start_date && project.target_date && <span>→</span>}
                        {project.target_date && <span>{formatDate(project.target_date)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
              <div className="h-full grid grid-cols-3 gap-md p-md overflow-hidden">
                {STATUS_COLUMNS.map(col => (
                  <DroppableColumn key={col.key} column={col} tasks={getTasksByStatus(col.key)} onDelete={handleDeleteTask} />
                ))}
              </div>

              <DragOverlay>
                {activeTask ? (
                  <div className="p-sm rounded-lg bg-surface-container-lowest border border-primary shadow-lg opacity-90">
                    <h4 className="text-[12px] font-bold text-on-surface">{activeTask.title}</h4>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>

        {/* Create Project Dialog */}
        {showProjectForm && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10 rounded-2xl" onClick={() => setShowProjectForm(false)}>
            <div className="bg-surface-container-lowest w-full max-w-md rounded-xl shadow-2xl border border-outline-variant/30" onClick={(e) => e.stopPropagation()}>
              <div className="px-md py-sm border-b border-outline-variant/30 flex items-center justify-between">
                <h3 className="font-label-md text-on-surface">New Project</h3>
                <button onClick={() => setShowProjectForm(false)} className="w-6 h-6 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors">
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
              <div className="p-md space-y-sm">
                <div>
                  <label className="text-[11px] text-on-surface-variant font-bold">Project Name *</label>
                  <input type="text" value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} placeholder="e.g., Website Redesign" className="w-full bg-surface-container-low border-2 border-transparent focus:border-primary rounded-lg px-sm py-1.5 text-body-sm outline-none mt-0.5" autoFocus />
                </div>
                <div>
                  <label className="text-[11px] text-on-surface-variant font-bold">Description</label>
                  <input type="text" value={projectForm.description} onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })} placeholder="Brief description" className="w-full bg-surface-container-low border-2 border-transparent focus:border-primary rounded-lg px-sm py-1.5 text-body-sm outline-none mt-0.5" />
                </div>
                <div>
                  <label className="text-[11px] text-on-surface-variant font-bold">Icon</label>
                  <div className="flex flex-wrap gap-xs mt-0.5">
                    {PROJECT_ICONS.map(icon => (
                      <button key={icon} onClick={() => setProjectForm({ ...projectForm, icon })} className={cn('w-8 h-8 rounded-lg flex items-center justify-center transition-colors', projectForm.icon === icon ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container')}>
                        <span className="material-symbols-outlined text-[18px]">{icon}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-on-surface-variant font-bold">Color</label>
                  <div className="flex gap-xs mt-0.5">
                    {PROJECT_COLORS.map(color => (
                      <button key={color} onClick={() => setProjectForm({ ...projectForm, color })} className={cn('w-6 h-6 rounded-full transition-transform', projectForm.color === color ? 'scale-125 ring-2 ring-primary ring-offset-2' : 'hover:scale-110')} style={{ backgroundColor: color }} />
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-sm">
                  <div>
                    <label className="text-[11px] text-on-surface-variant font-bold">Start Date</label>
                    <input type="date" value={projectForm.start_date} onChange={(e) => setProjectForm({ ...projectForm, start_date: e.target.value })} className="w-full bg-surface-container-low border-2 border-transparent focus:border-primary rounded-lg px-sm py-1.5 text-body-sm outline-none mt-0.5" />
                  </div>
                  <div>
                    <label className="text-[11px] text-on-surface-variant font-bold">Target Date</label>
                    <input type="date" value={projectForm.target_date} onChange={(e) => setProjectForm({ ...projectForm, target_date: e.target.value })} className="w-full bg-surface-container-low border-2 border-transparent focus:border-primary rounded-lg px-sm py-1.5 text-body-sm outline-none mt-0.5" />
                  </div>
                </div>
              </div>
              <div className="px-md py-sm border-t border-outline-variant/30 flex justify-end gap-xs">
                <button onClick={() => setShowProjectForm(false)} className="px-sm py-1 rounded-full text-[11px] text-on-surface-variant hover:bg-surface-container transition-colors">Cancel</button>
                <button onClick={handleCreateProject} className="px-sm py-1 rounded-full text-[11px] bg-primary text-on-primary hover:brightness-110 transition-all">Create Project</button>
              </div>
            </div>
          </div>
        )}

        {/* Create Task Dialog */}
        {showTaskForm && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10 rounded-2xl" onClick={() => setShowTaskForm(false)}>
            <div className="bg-surface-container-lowest w-full max-w-md rounded-xl shadow-2xl border border-outline-variant/30" onClick={(e) => e.stopPropagation()}>
              <div className="px-md py-sm border-b border-outline-variant/30 flex items-center justify-between">
                <h3 className="font-label-md text-on-surface">New Task</h3>
                <button onClick={() => setShowTaskForm(false)} className="w-6 h-6 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors">
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
              <div className="p-md space-y-sm">
                <div>
                  <label className="text-[11px] text-on-surface-variant font-bold">Task Title *</label>
                  <input type="text" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="e.g., Design homepage" className="w-full bg-surface-container-low border-2 border-transparent focus:border-primary rounded-lg px-sm py-1.5 text-body-sm outline-none mt-0.5" autoFocus />
                </div>
                <div>
                  <label className="text-[11px] text-on-surface-variant font-bold">Description</label>
                  <input type="text" value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} placeholder="Task details" className="w-full bg-surface-container-low border-2 border-transparent focus:border-primary rounded-lg px-sm py-1.5 text-body-sm outline-none mt-0.5" />
                </div>
                <div>
                  <label className="text-[11px] text-on-surface-variant font-bold">Priority</label>
                  <div className="flex gap-xs mt-0.5">
                    {Object.entries(PRIORITY_CONFIG).map(([key, config]) => (
                      <button key={key} onClick={() => setTaskForm({ ...taskForm, priority: key as Task['priority'] })} className={cn('flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors', taskForm.priority === key ? config.color + ' ring-1 ring-current' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container')}>
                        <span className="material-symbols-outlined text-[12px]">{config.icon}</span>
                        {config.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-on-surface-variant font-bold">Due Date</label>
                  <input type="date" value={taskForm.due_date} onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })} className="w-full bg-surface-container-low border-2 border-transparent focus:border-primary rounded-lg px-sm py-1.5 text-body-sm outline-none mt-0.5" />
                </div>
              </div>
              <div className="px-md py-sm border-t border-outline-variant/30 flex justify-end gap-xs">
                <button onClick={() => setShowTaskForm(false)} className="px-sm py-1 rounded-full text-[11px] text-on-surface-variant hover:bg-surface-container transition-colors">Cancel</button>
                <button onClick={handleCreateTask} className="px-sm py-1 rounded-full text-[11px] bg-primary text-on-primary hover:brightness-110 transition-all">Create Task</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
