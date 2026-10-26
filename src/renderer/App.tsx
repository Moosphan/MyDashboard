import { Suspense, useEffect, useMemo } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from './layouts/MainLayout'
import { ToastProvider } from '@/components/ui/toast'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { loadModules, getEnabledModuleIds } from '@/lib/module-loader'
import { moduleRegistry } from '@/lib/module-registry'

// Load modules synchronously at module level (before any component renders)
loadModules()

function Loading() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="animate-pulse text-on-surface-variant font-body-md">Loading...</div>
    </div>
  )
}

export default function App() {
  useEffect(() => {
    const root = document.documentElement
    const handlePointer = () => {
      root.dataset.inputModality = 'pointer'
    }
    const handleKeyboard = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey && !event.altKey) {
        root.dataset.inputModality = 'keyboard'
      }
    }
    document.addEventListener('pointerdown', handlePointer, true)
    document.addEventListener('keydown', handleKeyboard, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointer, true)
      document.removeEventListener('keydown', handleKeyboard, true)
      delete root.dataset.inputModality
    }
  }, [])

  const enabledIds = useMemo(() => getEnabledModuleIds(), [])
  const routes = useMemo(() => moduleRegistry.getRoutes(enabledIds), [enabledIds])

  return (
    <ToastProvider>
      <MainLayout>
        <Suspense fallback={<Loading />}>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              {routes.map((route) => (
                <Route
                  key={route.path}
                  path={route.path}
                  element={<route.component />}
                />
              ))}
            </Routes>
          </ErrorBoundary>
        </Suspense>
      </MainLayout>
    </ToastProvider>
  )
}
