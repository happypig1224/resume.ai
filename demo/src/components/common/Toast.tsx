import React, { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: string
  message: string
  type: ToastType
  duration?: number
}

interface ToastContextType {
  toast: (message: string, type?: ToastType, duration?: number) => void
  success: (message: string) => void
  error: (message: string) => void
  warning: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export const useToast = () => {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (message: string, type: ToastType = 'info', duration = 3000) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
      setToasts((prev) => [...prev, { id, message, type, duration }])

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id)
        }, duration)
      }
    },
    [removeToast]
  )

  const success = useCallback((msg: string) => toast(msg, 'success'), [toast])
  const error = useCallback((msg: string) => toast(msg, 'error', 4500), [toast])
  const warning = useCallback((msg: string) => toast(msg, 'warning', 3500), [toast])
  const info = useCallback((msg: string) => toast(msg, 'info'), [toast])

  return (
    <ToastContext.Provider value={{ toast, success, error, warning, info }}>
      {children}
      {/* 生产级浮动通知容器 (Apple & Linear 风格，带微透模糊与柔和阴影) */}
      <div
        data-testid="toast-container"
        className="fixed top-5 right-5 z-[9999] flex flex-col gap-2.5 pointer-events-none max-w-sm w-full"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            data-testid={`toast-${t.type}`}
            className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-[14px] text-xs font-medium shadow-lg backdrop-blur-md transition-all animate-in fade-in slide-in-from-top-3 ${
              t.type === 'success'
                ? 'bg-white/95 text-[#00a870] border border-[#a3e5c9] shadow-[#00a870]/10'
                : t.type === 'error'
                ? 'bg-white/95 text-[#e34d59] border border-[#fca5a5] shadow-[#e34d59]/10'
                : t.type === 'warning'
                ? 'bg-white/95 text-[#ed7b2f] border border-[#fcd39c] shadow-[#ed7b2f]/10'
                : 'bg-white/95 text-[#0052d9] border border-[#bbd3fb] shadow-[#0052d9]/10'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {t.type === 'success' && <CheckCircle2 className="w-4 h-4 text-[#00a870] shrink-0" />}
              {t.type === 'error' && <AlertCircle className="w-4 h-4 text-[#e34d59] shrink-0" />}
              {t.type === 'warning' && <AlertTriangle className="w-4 h-4 text-[#ed7b2f] shrink-0" />}
              {t.type === 'info' && <Info className="w-4 h-4 text-[#0052d9] shrink-0" />}
              <span className="text-[#181818] font-normal leading-snug">{t.message}</span>
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="text-[#86909c] hover:text-[#181818] p-1 rounded hover:bg-black/5 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
