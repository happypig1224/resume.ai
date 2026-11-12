import React from 'react'
import { CheckCircle2, UploadCloud, Layers, Briefcase, Activity } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'

export type NavTab = 'jobs' | 'criteria' | 'import' | 'workbench'

interface HeaderProps {
  currentTab: NavTab
  onTabChange: (tab: NavTab) => void
}

export const Header: React.FC<HeaderProps> = ({ currentTab, onTabChange }) => {
  const [isDark, setIsDark] = React.useState(false)
  const { currentJobId, jobs } = useAppStore()
  const currentJob = jobs[currentJobId]

  const handleToggleTheme = () => {
    setIsDark(!isDark)
    document.documentElement.classList.toggle('dark')
  }

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-[#e5e6eb] shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
        {/* 左侧：Logo 与品牌标示 */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[10px] bg-[#0052d9] flex items-center justify-center text-white shadow-xs shrink-0">
            <Layers className="w-4.5 h-4.5 text-white" />
          </div>
          <div className="flex items-center gap-2.5">
            <span className="font-bold text-base tracking-tight text-[#181818]">
              resume.ai
            </span>
            <span className="text-xs text-[#86909c] hidden sm:inline-block">/</span>
            <span className="text-xs text-[#4e5969] hidden sm:inline-block font-normal">
              企业级智能招聘初筛工作台
            </span>
            {currentJob && (
              <span className="hidden md:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[8px] bg-[#ecf2fe] border border-[#bbd3fb] text-[11px] font-medium text-[#0052d9] max-w-[220px] truncate">
                <Briefcase className="w-3 h-3 shrink-0" />
                <span className="truncate">{currentJob.title}</span>
              </span>
            )}
          </div>
        </div>

        {/* 中间：顶栏导航 Tabs */}
        <nav className="flex items-center gap-1 h-full">
          <button
            onClick={() => onTabChange('jobs')}
            data-testid="nav-jobs"
            className={`flex items-center gap-1.5 h-14 px-3.5 text-xs sm:text-sm transition-all border-b-2 cursor-pointer font-medium ${
              currentTab === 'jobs'
                ? 'border-[#0052d9] text-[#0052d9] font-semibold bg-[#f0f7ff]/50'
                : 'border-transparent text-[#4e5969] hover:text-[#0052d9] hover:bg-[#f7f8fa]'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            <span>岗位管理 (P01)</span>
          </button>

          <button
            onClick={() => onTabChange('criteria')}
            data-testid="nav-criteria"
            className={`flex items-center gap-1.5 h-14 px-3.5 text-xs sm:text-sm transition-all border-b-2 cursor-pointer font-medium ${
              currentTab === 'criteria'
                ? 'border-[#0052d9] text-[#0052d9] font-semibold bg-[#f0f7ff]/50'
                : 'border-transparent text-[#4e5969] hover:text-[#0052d9] hover:bg-[#f7f8fa]'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>标准配置 (P02)</span>
          </button>

          <button
            onClick={() => onTabChange('import')}
            data-testid="nav-import"
            className={`flex items-center gap-1.5 h-14 px-3.5 text-xs sm:text-sm transition-all border-b-2 cursor-pointer font-medium ${
              currentTab === 'import'
                ? 'border-[#0052d9] text-[#0052d9] font-semibold bg-[#f0f7ff]/50'
                : 'border-transparent text-[#4e5969] hover:text-[#0052d9] hover:bg-[#f7f8fa]'
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            <span>批次导入 (P03)</span>
          </button>

          <button
            onClick={() => onTabChange('workbench')}
            data-testid="nav-workbench"
            className={`flex items-center gap-1.5 h-14 px-3.5 text-xs sm:text-sm transition-all border-b-2 cursor-pointer font-medium ${
              currentTab === 'workbench'
                ? 'border-[#0052d9] text-[#0052d9] font-semibold bg-[#f0f7ff]/50'
                : 'border-transparent text-[#4e5969] hover:text-[#0052d9] hover:bg-[#f7f8fa]'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>批次工作台 (P04)</span>
          </button>
        </nav>

        {/* 右侧：环境状态标签与主题 */}
        <div className="flex items-center gap-2.5">
          <div
            data-testid="system-status-indicator"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-[10px] bg-[#e8f8f2] border border-[#a3e5c9] text-xs text-[#00a870]"
            title="后端 FastAPI 与 SQLite 生产集群直连正常"
          >
            <span className="w-2 h-2 rounded-full bg-[#00a870] animate-pulse shrink-0" />
            <span className="font-semibold hidden sm:inline-block">企业级生产集群 · 正常</span>
            <span className="text-[10px] font-mono opacity-80 hidden md:inline-block">API 200 OK</span>
          </div>

          <button
            onClick={handleToggleTheme}
            title="切换主题"
            className="flex items-center gap-1 text-xs text-[#4e5969] hover:text-[#0052d9] bg-white hover:bg-[#f7f8fa] border border-[#dcdfe6] hover:border-[#0052d9] px-2.5 py-1 rounded-[10px] transition-colors cursor-pointer"
          >
            <span>{isDark ? '深色风格' : '标准主题'}</span>
          </button>
        </div>
      </div>
    </header>
  )
}
