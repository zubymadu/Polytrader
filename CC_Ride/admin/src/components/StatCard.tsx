import { LucideIcon } from 'lucide-react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '../lib/utils'

interface Props {
  label: string
  value: string | number
  sub?: string
  icon: LucideIcon
  color?: 'blue' | 'green' | 'orange' | 'purple' | 'red'
  trend?: { value: number; label: string }
}

// Design-token aligned color map
const colors = {
  blue:   { icon: 'bg-brand-50 text-brand-600' },
  green:  { icon: 'bg-emerald-50 text-emerald-600' },
  orange: { icon: 'bg-amber-50 text-amber-600' },
  purple: { icon: 'bg-violet-50 text-violet-600' },
  red:    { icon: 'bg-red-50 text-red-600' },
}

export default function StatCard({ label, value, sub, icon: Icon, color = 'blue', trend }: Props) {
  const c = colors[color]
  const isUp = (trend?.value ?? 0) >= 0

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div className={cn('w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0', c.icon)}>
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <span className={cn(
            'inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full',
            isUp ? 'trend-up' : 'trend-down',
          )}>
            {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {isUp ? '+' : ''}{trend.value}% {trend.label}
          </span>
        )}
      </div>
      <p className="mt-4 text-2xl font-bold text-ink">{value}</p>
      <p className="mt-0.5 text-sm text-ink-subtle">{label}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-ghost">{sub}</p>}
    </div>
  )
}
