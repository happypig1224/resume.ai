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
  // 遵循腾讯云及企业级中后台 Tag 规范
  const variantStyles: Record<BadgeVariant, string> = {
    primary: 'bg-[#ecf2fe] text-[#0052d9] border-[#bbd3fb]',
    success: 'bg-[#e8f8f2] text-[#00a870] border-[#9de8c8]',
    warning: 'bg-[#fef3e6] text-[#ed7b2f] border-[#fcd39c]',
    danger: 'bg-[#feecee] text-[#e34d59] border-[#fca5a5]',
    neutral: 'bg-[#f2f3f5] text-[#4e5969] border-[#e5e6eb]',
  }

  const sizeStyles: Record<BadgeSize, string> = {
    sm: 'text-[11px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-0.5 gap-1.5',
  }

  return (
    <span
      className={`inline-flex items-center font-medium rounded border ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...rest}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="leading-tight">{children}</span>
    </span>
  )
}
