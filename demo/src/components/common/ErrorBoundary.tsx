import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertOctagon, RotateCcw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component tree:', error, errorInfo)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          data-testid="error-boundary-fallback"
          className="min-h-[400px] flex items-center justify-center p-6 bg-[#f5f6f7]"
        >
          <div className="bg-white border border-[#e5e6eb] rounded-[24px] p-8 max-w-md w-full shadow-lg text-center flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-[#feecee] text-[#e34d59] flex items-center justify-center mb-4">
              <AlertOctagon className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-[#181818] tracking-tight mb-2">
              工作台遇到未预期的渲染异常
            </h2>
            <p className="text-xs text-[#86909c] leading-relaxed mb-6">
              系统已捕获该异常并保护底层状态不受污染。您可以尝试刷新工作台或重置视图以继续操作。
            </p>
            {this.state.error && (
              <pre className="w-full text-left bg-[#f7f8fa] border border-[#e5e6eb] rounded-[12px] p-3 text-[11px] font-mono text-[#e34d59] mb-6 overflow-x-auto max-h-32">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[14px] bg-[#0052d9] hover:bg-[#003cab] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>重新加载工作台</span>
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
