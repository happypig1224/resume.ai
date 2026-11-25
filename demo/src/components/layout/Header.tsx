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
    <header className="sticky top-0 z-40 w-full liquid-glass-nav shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
        {/* 左侧：Logo 与品牌标示 */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[11px] bg-[#0052d9] flex items-center justify-center text-white shadow-xs shrink-0 transition-transform active:scale-95">
            <Layers className="w-4.5 h-4.5 text-white" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-[15px] tracking-tight text-[#1c1c1e]">
              resume.ai
            </span>
            <span className="text-xs text-[#8e8e93] hidden sm:inline-block">/</span>
            <span className="text-xs text-[#6e6e73] hidden sm:inline-block font-normal">
              智能简历初筛工作台
            </span>
            {currentJob && (
              <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#f0f5ff] border border-[#d0dffa] text-[11px] font-medium text-[#0052d9] max-w-[200px] truncate">
                <Briefcase className="w-3 h-3 shrink-0 text-[#0052d9]" />
                <span className="truncate">{currentJob.title}</span>
              </span>
            )}
          </div>
        </div>

        {/* 中间：顶栏导航 Tabs (消灭开发编号P01-P04，采用优雅大厂标签) */}
        <nav className="flex items-center gap-1 h-full">
          <button
            onClick={() => onTabChange('jobs')}
            data-testid="nav-jobs"
            className={`flex items-center gap-1.5 h-9 px-3.5 text-xs sm:text-[13px] rounded-[10px] transition-all cursor-pointer font-medium btn-tactile ${
              currentTab === 'jobs'
                ? 'bg-[#f0f5ff] text-[#0052d9] font-semibold shadow-2xs'
                : 'text-[#6e6e73] hover:text-[#1c1c1e] hover:bg-[#f2f3f5]/80'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5 shrink-0" />
            <span>岗位中心</span>
          </button>

          <button
            onClick={() => onTabChange('criteria')}
            data-testid="nav-criteria"
            className={`flex items-center gap-1.5 h-9 px-3.5 text-xs sm:text-[13px] rounded-[10px] transition-all cursor-pointer font-medium btn-tactile ${
              currentTab === 'criteria'
                ? 'bg-[#f0f5ff] text-[#0052d9] font-semibold shadow-2xs'
                : 'text-[#6e6e73] hover:text-[#1c1c1e] hover:bg-[#f2f3f5]/80'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>评估标准</span>
          </button>

          <button
            onClick={() => onTabChange('import')}
            data-testid="nav-import"
            className={`flex items-center gap-1.5 h-9 px-3.5 text-xs sm:text-[13px] rounded-[10px] transition-all cursor-pointer font-medium btn-tactile ${
              currentTab === 'import'
                ? 'bg-[#f0f5ff] text-[#0052d9] font-semibold shadow-2xs'
                : 'text-[#6e6e73] hover:text-[#1c1c1e] hover:bg-[#f2f3f5]/80'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5 shrink-0" />
            <span>批次导入</span>
          </button>

          <button
            onClick={() => onTabChange('workbench')}
            data-testid="nav-workbench"
            className={`flex items-center gap-1.5 h-9 px-3.5 text-xs sm:text-[13px] rounded-[10px] transition-all cursor-pointer font-medium btn-tactile ${
              currentTab === 'workbench'
                ? 'bg-[#f0f5ff] text-[#0052d9] font-semibold shadow-2xs'
                : 'text-[#6e6e73] hover:text-[#1c1c1e] hover:bg-[#f2f3f5]/80'
            }`}
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span>初筛工作台</span>
          </button>
        </nav>

        {/* 右侧：环境状态标签与主题 */}
        <div className="flex items-center gap-2">
          <div
            data-testid="system-status-indicator"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50/80 border border-emerald-200/70 text-[11px] text-emerald-700 shadow-2xs"
            title="后端服务直连正常，数据落盘就绪"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="font-medium hidden sm:inline-block">服务运行中</span>
          </div>

          <button
            onClick={handleToggleTheme}
            title="切换外观"
            className="flex items-center gap-1 text-[11px] text-[#6e6e73] hover:text-[#1c1c1e] bg-white/80 hover:bg-[#f4f5f7] border border-[#dcdfe4] px-2.5 py-1 rounded-full transition-all cursor-pointer active:scale-95 shadow-2xs"
          >
            <span>{isDark ? '深色' : '浅色'}</span>
          </button>
        </div>
      </div>
    </header>
  )
}
