import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TodayOverview } from './components/TodayOverview'
import { PriorityTaskList } from './components/PriorityTaskList'
import { WeatherClockWidget } from './components/WeatherClockWidget'
import { ActivityHeatmap } from './components/ActivityHeatmap'
import { FocusSessionCard } from './components/FocusSessionCard'
// import { CalendarWidget } from './components/CalendarWidget'
import { IdeaCard, type IdeaCardHandle } from './components/IdeaCard'
import { CreateIdeaDialog } from './components/CreateIdeaDialog'
import { ManageIdeasDialog } from './components/ManageIdeasDialog'
import { ProjectManagerDialog } from './components/ProjectManagerDialog'
import { ArticleDetailDialog } from './components/ArticleDetailDialog'
import { AIActionPlannerDialog } from './components/AIActionPlannerDialog'
import { useIpcData } from '@/hooks/useIpc'

interface TaskContext {
  project_id: number | null
}

export default function Dashboard() {
  const [searchParams] = useSearchParams()
  const taskId = Number(searchParams.get('taskId'))
  const hasTaskId = Number.isInteger(taskId) && taskId > 0
  const { data: linkedTask } = useIpcData<TaskContext | null>(
    hasTaskId ? 'tasks:getById' : '',
    taskId,
  )
  const [showCreate, setShowCreate] = useState(false)
  const [showManage, setShowManage] = useState(false)
  const [showProjectManager, setShowProjectManager] = useState(false)
  const [projectDetailId, setProjectDetailId] = useState<number | null>(null)
  const [articleDetailId, setArticleDetailId] = useState<number | null>(null)
  const [showAIPlanner, setShowAIPlanner] = useState(false)
  const [projectRevision, setProjectRevision] = useState(0)
  const [focusRevision, setFocusRevision] = useState(0)
  const ideaCardRef = useRef<IdeaCardHandle>(null)

  useEffect(() => {
    const projectId = Number(searchParams.get('projectId'))
    if (Number.isInteger(projectId) && projectId > 0) {
      setProjectDetailId(projectId)
      setShowProjectManager(true)
    }
  }, [searchParams])

  useEffect(() => {
    if (!hasTaskId || !linkedTask) return
    setProjectDetailId(linkedTask.project_id)
    setShowProjectManager(true)
  }, [hasTaskId, linkedTask])

  return (
    <div className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-lg p-lg">
      {/* Left Stream: Focus + Tasks */}
      <div className="flex-1 flex flex-col gap-lg overflow-y-auto pr-sm">
        <TodayOverview
          refreshKey={projectRevision}
          onOpenManager={() => {
            setProjectDetailId(null)
            setShowProjectManager(true)
          }}
          onOpenAIPlanner={() => setShowAIPlanner(true)}
          onOpenProject={(projectId) => {
            setProjectDetailId(projectId)
            setShowProjectManager(true)
          }}
          onOpenArticle={(articleId) => setArticleDetailId(articleId)}
        />
        {/* <CalendarWidget /> */}
        <PriorityTaskList
          onOpenBoard={() => setShowProjectManager(true)}
          onChanged={() => setProjectRevision((value) => value + 1)}
        />
      </div>

      {/* Right Sidebar: Weather + Activity + Ideas */}
      <aside className="w-full lg:w-[320px] flex flex-col gap-lg shrink-0 overflow-y-auto">
        <WeatherClockWidget />
        <FocusSessionCard onStopped={() => setFocusRevision((value) => value + 1)} />
        <ActivityHeatmap key={focusRevision} />
        <IdeaCard
          ref={ideaCardRef}
          onCreateNew={() => setShowCreate(true)}
          onManage={() => setShowManage(true)}
        />
      </aside>

      <CreateIdeaDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => ideaCardRef.current?.refresh()}
      />
      <ManageIdeasDialog
        open={showManage}
        onClose={() => setShowManage(false)}
        onCreateNew={() => setShowCreate(true)}
        onChanged={() => ideaCardRef.current?.refresh()}
      />
      <ProjectManagerDialog
        open={showProjectManager}
        initialProjectId={projectDetailId}
        onClose={() => {
          setShowProjectManager(false)
          setProjectDetailId(null)
        }}
        onChanged={() => setProjectRevision((value) => value + 1)}
      />
      {articleDetailId !== null && (
        <ArticleDetailDialog articleId={articleDetailId} onClose={() => setArticleDetailId(null)} />
      )}
      <AIActionPlannerDialog
        open={showAIPlanner}
        onClose={() => setShowAIPlanner(false)}
        onApplied={() => setProjectRevision((value) => value + 1)}
      />
    </div>
  )
}
