interface Props {
  title: string
  sub?: string
  action?: React.ReactNode
}

export default function PageHeader({ title, sub, action }: Props) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-xl font-bold text-ink">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-ink-subtle">{sub}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  )
}
