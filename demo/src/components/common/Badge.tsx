import React from 'react'

export type BadgeVariant = 'primary' | 'success' | 'warning' | 'danger' | 'neutral'
export type BadgeSize = 'sm' | 'md'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  size?: BadgeSize
  children: React.ReactNode
  icon?: React.ReactNode
  className?: string
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  size = 'md',
  children,
  icon,
  className = '',
  ...rest
}) => {
  // 基于 Apple HIG 与 Linear 现代视觉标准：微光果冻药丸胶囊
  const variantStyles: Record<BadgeVariant, string> = {
    primary: 'bg-[#0052d9]/8 text-[#0052d9] border-[#0052d9]/25 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]',
    success: 'bg-[#00a870]/9 text-[#00885a] border-[#00a870]/25 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]',
    warning: 'bg-[#ed7b2f]/9 text-[#c85f19] border-[#ed7b2f]/25 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]',
    danger: 'bg-[#e34d59]/9 text-[#c73440] border-[#e34d59]/25 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]',
    neutral: 'bg-slate-100/80 text-slate-600 border-slate-200/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]',
  }

  const sizeStyles: Record<BadgeSize, string> = {
    sm: 'text-[11px] px-2.5 py-0.5 gap-1 font-medium',
    md: 'text-xs px-3 py-0.5 gap-1.5 font-medium',
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...rest}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="leading-normal tracking-tight">{children}</span>
    </span>
  )
}
