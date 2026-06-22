/**
 * Analytics — Monthly trends, GMV, top companies, ride status breakdown
 * Uses /admin/analytics
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  TrendingUp, DollarSign, Car, Users, Loader2,
  BarChart2, Building2, Download,
} from 'lucide-react'
import { get } from '../lib/api'
import { fmt } from '../lib/utils'
import PageHeader from '../components/PageHeader'

interface AnalyticsData {
  monthly: {
    month:       string   // YYYY-MM
    month_label: string   // e.g. "Jan 2025"
    gmv:         number
    rides:       number
    drivers:     number
  }[]
  top_companies: {
    company_id:   string
    company_name: string
    gmv:          number
    rides:        number
  }[]
  status_breakdown: {
    status: string
    count:  number
  }[]
  summary: {
    total_gmv:        number
    total_rides:      number
    corporate_rides:  number
    personal_rides:   number
    avg_fare:         number
    active_drivers:   number
  }
}

const COLORS = ['#1565C0', '#004D99', '#42A5F5', '#90CAF9', '#E3F2FD', '#FF7043']

const STATUS_COLORS: Record<string, string> = {
  completed:   '#22C55E',
  in_progress: '#3B82F6',
  confirmed:   '#60A5FA',
  pending:     '#F59E0B',
  cancelled:   '#EF4444',
  rejected:    '#F97316',
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-surface-border shadow-modal rounded-lg px-4 py-3 text-xs">
      <p className="font-semibold text-ink mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-1">
          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: p.color }} />
          <span className="text-ink-subtle capitalize">{p.name}:</span>
          <span className="font-semibold text-ink">
            {p.name === 'gmv' ? fmt.naira(p.value) : p.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  )
}

function StatTile({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string; icon: React.ElementType; color: string
}) {
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs text-ink-subtle font-medium">{label}</p>
        <p className="text-xl font-bold text-ink">{value}</p>
        {sub && <p className="text-xs text-ink-subtle">{sub}</p>}
      </div>
    </div>
  )
}

export default function Analytics() {
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null)

  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ['admin-analytics'],
    queryFn:  () => get('/admin/analytics'),
    staleTime: 5 * 60 * 1000,
  })

  const { data: companyDetail } = useQuery<{ departments?: { department: string; gmv: number }[]; recent_bookings?: unknown[] }>({
    queryKey: ['admin-analytics-company', selectedCompany],
    queryFn:  () => get(`/admin/analytics/company/${selectedCompany}`),
    enabled:  !!selectedCompany,
  })

  function exportCSV() {
    if (!data) return
    const headers = ['Month','GMV (₦)','Rides','Drivers']
    const lines = data.monthly.map((r) =>
      [r.month_label, r.gmv, r.rides, r.drivers].join(',')
    )
    const csv = [headers.join(','), ...lines].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    Object.assign(document.createElement('a'), {
      href: url, download: `analytics-${new Date().toISOString().slice(0,10)}.csv`
    }).click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
        <p className="text-sm text-ink-subtle">Crunching platform data…</p>
      </div>
    )
  }

  const s = data?.summary
  const corpPct = s ? (s.corporate_rides / (s.total_rides || 1)) * 100 : 0
  const persPct = 100 - corpPct

  const splitData = [
    { name: 'Corporate', value: s?.corporate_rides ?? 0, color: '#1565C0' },
    { name: 'Personal',  value: s?.personal_rides  ?? 0, color: '#90CAF9' },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Analytics & Reports"
        sub="Platform performance at a glance — last 6 months"
        action={
          <button onClick={exportCSV} className="btn-secondary text-sm">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        }
      />

      {/* Summary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Total GMV"       value={fmt.naira(s?.total_gmv ?? 0)}        icon={DollarSign} color="bg-brand-50 text-brand-600" />
        <StatTile label="Total Rides"     value={(s?.total_rides ?? 0).toLocaleString()} icon={Car}       color="bg-emerald-50 text-emerald-600" />
        <StatTile label="Avg Fare"        value={fmt.naira(s?.avg_fare ?? 0)}          icon={TrendingUp} color="bg-amber-50 text-amber-600" />
        <StatTile label="Active Drivers"  value={(s?.active_drivers ?? 0).toLocaleString()} icon={Users} color="bg-violet-50 text-violet-600" />
      </div>

      {/* Monthly GMV trend */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-sm font-semibold text-ink">Monthly Revenue & Rides</p>
            <p className="text-xs text-ink-subtle mt-0.5">Gross Merchandise Volume over the past 6 months</p>
          </div>
          <BarChart2 className="w-4 h-4 text-ink-ghost" />
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data?.monthly ?? []} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="gmvGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#1565C0" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#1565C0" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#DFE3E8" />
            <XAxis dataKey="month_label" tick={{ fontSize: 11, fill: '#727783' }} tickLine={false} />
            <YAxis
              yAxisId="gmv" orientation="left"
              tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 11, fill: '#727783' }} tickLine={false} axisLine={false}
            />
            <YAxis
              yAxisId="rides" orientation="right"
              tick={{ fontSize: 11, fill: '#727783' }} tickLine={false} axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              yAxisId="gmv" type="monotone" dataKey="gmv" name="gmv"
              stroke="#1565C0" strokeWidth={2} fill="url(#gmvGrad)"
            />
            <Bar
              yAxisId="rides" dataKey="rides" name="rides"
              fill="#90CAF9" radius={[3,3,0,0]} barSize={20}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Top Companies + Split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Top companies by GMV */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-ink">Top Companies by GMV</p>
              <p className="text-xs text-ink-subtle mt-0.5">This month's biggest corporate accounts</p>
            </div>
            <Building2 className="w-4 h-4 text-ink-ghost" />
          </div>
          {data?.top_companies?.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.top_companies} layout="vertical" margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#DFE3E8" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `₦${(v/1000).toFixed(0)}k`}
                  tick={{ fontSize: 11, fill: '#727783' }} tickLine={false} />
                <YAxis type="category" dataKey="company_name" width={100}
                  tick={{ fontSize: 11, fill: '#424752' }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="gmv" name="gmv" fill="#1565C0" radius={[0,3,3,0]} barSize={16}>
                  {data.top_companies.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-40 text-ink-subtle text-sm">No company data yet</div>
          )}

          {/* Table below chart */}
          <div className="mt-4 border-t border-surface-border pt-3 space-y-1">
            {(data?.top_companies ?? []).slice(0, 5).map((co, i) => (
              <button
                key={co.company_id}
                onClick={() => setSelectedCompany(co.company_id === selectedCompany ? null : co.company_id)}
                className={`w-full flex items-center justify-between py-1.5 px-2 rounded-md text-sm transition-colors hover:bg-surface-low ${selectedCompany === co.company_id ? 'bg-brand-50' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                    style={{ background: COLORS[i % COLORS.length] }}>{i + 1}</span>
                  <span className="font-medium text-ink truncate max-w-[120px]">{co.company_name}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-ink-subtle">
                  <span>{co.rides} rides</span>
                  <span className="font-semibold text-ink">{fmt.naira(co.gmv)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Corporate vs Personal split + Status breakdown */}
        <div className="flex flex-col gap-5">

          {/* Ride type split */}
          <div className="card p-5">
            <p className="text-sm font-semibold text-ink mb-1">Corporate vs Personal</p>
            <p className="text-xs text-ink-subtle mb-4">Breakdown of ride categories</p>
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={120} height={120}>
                <PieChart>
                  <Pie
                    data={splitData} innerRadius={32} outerRadius={52}
                    dataKey="value" startAngle={90} endAngle={-270} strokeWidth={0}
                  >
                    {splitData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-3">
                {splitData.map((d) => (
                  <div key={d.name}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
                        <span className="text-ink-subtle">{d.name}</span>
                      </div>
                      <span className="font-semibold text-ink">{d.value.toLocaleString()}</span>
                    </div>
                    <div className="h-1.5 bg-surface-mid rounded-full overflow-hidden">
                      <div className="h-full rounded-full"
                        style={{ width: `${(d.value / (s?.total_rides || 1)) * 100}%`, background: d.color }} />
                    </div>
                  </div>
                ))}
                <div className="pt-2 border-t border-surface-border">
                  <p className="text-xs text-ink-subtle">Corporate share</p>
                  <p className="text-lg font-bold text-brand-600">{corpPct.toFixed(1)}%</p>
                </div>
              </div>
            </div>
          </div>

          {/* Status breakdown */}
          <div className="card p-5 flex-1">
            <p className="text-sm font-semibold text-ink mb-4">Rides by Status</p>
            <div className="space-y-2">
              {(data?.status_breakdown ?? []).map((s) => {
                const total = data?.summary.total_rides || 1
                const pct   = (s.count / total) * 100
                const color = STATUS_COLORS[s.status] ?? '#9CA3AF'
                return (
                  <div key={s.status}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                        <span className="capitalize text-ink-subtle">{s.status.replace('_', ' ')}</span>
                      </div>
                      <span className="font-semibold text-ink">{s.count.toLocaleString()} ({pct.toFixed(1)}%)</span>
                    </div>
                    <div className="h-1.5 bg-surface-mid rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Company drill-down panel */}
      {selectedCompany && companyDetail && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-ink">Company Drill-down</p>
              <p className="text-xs text-ink-subtle mt-0.5">Department-level GMV for selected account</p>
            </div>
            <button onClick={() => setSelectedCompany(null)} className="text-xs text-ink-subtle hover:text-ink">✕ Close</button>
          </div>
          {companyDetail?.departments?.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={companyDetail?.departments} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#DFE3E8" />
                <XAxis dataKey="department" tick={{ fontSize: 11, fill: '#727783' }} tickLine={false} />
                <YAxis tickFormatter={(v) => `₦${(v/1000).toFixed(0)}k`}
                  tick={{ fontSize: 11, fill: '#727783' }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="gmv" name="gmv" fill="#1565C0" radius={[3,3,0,0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-ink-subtle text-center py-10">No department data for this company</p>
          )}
        </div>
      )}
    </div>
  )
}
