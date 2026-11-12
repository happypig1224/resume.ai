import React, { useState } from 'react'
import { Header, NavTab } from './components/layout/Header'
import { JobsPage } from './features/jobs/JobsPage'
import { CriteriaPage } from './features/criteria/CriteriaPage'
import { ImportPage } from './features/import/ImportPage'
import { BatchWorkbenchPage } from './features/screening/BatchWorkbenchPage'
import { CandidateReviewModal } from './features/review/CandidateReviewModal'
import { useAppStore } from './store/useAppStore'
import { ToastProvider } from './components/common/Toast'
import { ErrorBoundary } from './components/common/ErrorBoundary'

export function App() {
  const [currentTab, setCurrentTab] = useState<NavTab>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const tab = params.get('tab') as NavTab
      if (tab && ['jobs', 'criteria', 'import', 'workbench'].includes(tab)) {
        return tab
      }
    }
    return 'workbench'
  })
  const { activeItemId, setActiveItem, setJob } = useAppStore()

  const handleTabChange = (tab: NavTab) => {
    setCurrentTab(tab)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('tab', tab)
      window.history.replaceState({}, '', url.toString())
    }
  }

  const handleSelectJobForCriteria = (jobId: string) => {
    setJob(jobId)
    handleTabChange('criteria')
  }

  const handleSelectJobForImport = (jobId: string) => {
    setJob(jobId)
    handleTabChange('import')
  }

  return (
    <ErrorBoundary>
      <ToastProvider>
        <div className="min-h-screen bg-[#f5f6f7] text-[#181818] flex flex-col font-sans">
          {/* 顶部全局导航栏 */}
          <Header currentTab={currentTab} onTabChange={handleTabChange} />

          {/* 主流程页面切换 */}
          <main className="flex-1 pb-16">
            {currentTab === 'jobs' && (
              <JobsPage
                onSelectJobForCriteria={handleSelectJobForCriteria}
                onSelectJobForImport={handleSelectJobForImport}
              />
            )}

            {currentTab === 'workbench' && (
              <BatchWorkbenchPage onOpenReview={(itemId) => setActiveItem(itemId)} />
            )}

            {currentTab === 'criteria' && (
              <CriteriaPage onGoToImport={() => setCurrentTab('import')} />
            )}

            {currentTab === 'import' && (
              <ImportPage onGoToWorkbench={() => setCurrentTab('workbench')} />
            )}
          </main>

          {/* 候选人复核与原件证据对照模态弹窗 */}
          {activeItemId && (
            <CandidateReviewModal
              itemId={activeItemId}
              onClose={() => setActiveItem(null)}
            />
          )}
        </div>
      </ToastProvider>
    </ErrorBoundary>
  )
}

export default App
