import { LucideIcon } from 'lucide-react'

interface Props { icon: LucideIcon; title: string; sub?: string }

export default function EmptyState({ icon: Icon, title, sub }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-gray-400" />
      </div>
      <p className="font-semibold text-gray-600">{title}</p>
      {sub && <p className="mt-1 text-sm text-gray-400 max-w-xs">{sub}</p>}
    </div>
  )
}
