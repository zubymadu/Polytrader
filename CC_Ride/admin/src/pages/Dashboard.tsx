import { useQuery } from '@tanstack/react-query'
import { Users, Car, Building2, TrendingUp, CreditCard, AlertCircle, Loader2, ArrowRight } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Bar, BarChart,
} from 'recharts'
import { get } from '../lib/api'
import { fmt, badge } from '../lib/utils'
import StatCard from '../components/StatCard'
import PageHeader from '../components/PageHeader'

interface Overview {
  total_users:               number
  total_drivers:             number
  total_companies:           number
  active_rides:              number
  gmv_this_month:            number
  gmv_last_month:            number
  rides_today:               number
  rides_this_month:          number
  pending_driver_approvals:  number
  pending_company_approvals: number
  open_support_tickets:      number
  revenue_chart:             { month: string; gmv: number; rides: number }[]
  recent_rides: {
    id: string; passenger: string; driver: string
    origin: string; destination: string; amount: number; status: string; created_at: string
  }[]
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-surface-border shadow-modal rounded-lg px-4 py-3 text-xs">
      <p className="font-semibold text-ink mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-1">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} />
          <span className="text-ink-subtle capitalize">{p.name}:</span>
          <span className="font-semibold text-ink">
            {p.dataKey === 'gmv' ? fmt.naira(p.value) : p.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { data, isLoading } = useQuery<Overview>({
    queryKey: ['admin-overview'],
    queryFn:  () => get<Overview>('/admin/overview'),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    )
  }

  if (!data) return null

  const gmvGrowth = data.gmv_last_month > 0
    ? Math.round(((data.gmv_this_month - data.gmv_last_month) / data.gmv_last_month) * 100)
    : 0

  return (
    <div className="space-y-5">
      <PageHeader title="Dashboard" sub="Platform overview — CC Ride" />

      {/* Alert banners */}
      {(data.pending_driver_approvals > 0 || data.pending_company_approvals > 0) && (
        <div className="flex flex-wrap gap-3">
          {data.pending_driver_approvals > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-2.5 rounded-lg">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{data.pending_driver_approvals} driver{data.pending_driver_approvals > 1 ? 's' : ''} awaiting verification</span>
              <a href="/drivers" className="ml-1 underline font-semibold hover:text-amber-800">Review</a>
            </div>
          )}
          {data.pending_company_approvals > 0 && (
            <div className="flex items-center gap-2 bg-brand-50 border border-brand-200 text-brand-700 text-sm px-4 py-2.5 rounded-lg">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{data.pending_company_approvals} compan{data.pending_company_approvals > 1 ? 'ies' : 'y'} awaiting onboarding</span>
              <a href="/companies" className="ml-1 underline font-semibold hover:text-brand-800">Review</a>
            </div>
          )}
        </div>
      )}

      {/* Primary KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Users"       value={data.total_users.toLocaleString()}     icon={Users}      color="blue"   trend={{ value: 0, label: 'MoM' }} />
        <StatCard label="Active Drivers"    value={data.total_drivers.toLocaleString()}   icon={Car}        color="green"  />
        <StatCard label="Corporate Clients" value={data.total_companies.toLocaleString()} icon={Building2}  color="purple" />
        <StatCard label="Rides Today"       value={data.rides_today.toLocaleString()}     icon={TrendingUp} color="orange" />
      </div>

      {/* Revenue KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="GMV This Month"
          value={fmt.naira(data.gmv_this_month)}
          sub={`${gmvGrowth >= 0 ? '▲' : '▼'} ${Math.abs(gmvGrowth)}% vs last month`}
          icon={CreditCard}
          color="green"
          trend={{ value: gmvGrowth, label: 'MoM' }}
        />
        <StatCard label="Rides This Month" value={data.rides_this_month.toLocaleString()} icon={Car}         color="blue"   />
        <StatCard label="Open Tickets"     value={data.open_support_tickets}              icon={AlertCircle} color={data.open_support_tickets > 5 ? 'red' : 'orange'} />
      </div>

      {/* Revenue chart */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-sm font-semibold text-ink">Revenue & Rides — Last 6 Months</p>
            <p className="text-xs text-ink-subtle mt-0.5">Monthly Gross Merchandise Volume</p>
          </div>
          <a href="/analytics" className="text-xs text-brand-500 font-semibold hover:underline flex items-center gap-1">
            Full report <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data.revenue_chart} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="dashGmvGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#1565C0" stopOpacity={0.12} />
                <stop offset="95%" stopColor="#1565C0" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#DFE3E8" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#727783' }} tickLine={false} />
            <YAxis
              yAxisId="gmv" orientation="left"
              tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 11, fill: '#727783' }} tickLine={false} axisLine={false} width={55}
            />
            <YAxis
              yAxisId="rides" orientation="right"
              tick={{ fontSize: 11, fill: '#727783' }} tickLine={false} axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area yAxisId="gmv" type="monotone" dataKey="gmv" name="gmv"
              stroke="#1565C0" strokeWidth={2} fill="url(#dashGmvGrad)" />
            <Bar yAxisId="rides" dataKey="rides" name="rides"
              fill="#90CAF9" radius={[3,3,0,0]} barSize={18} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Recent rides */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-surface-border flex items-center justify-between">
          <p className="text-sm font-semibold text-ink">Recent Rides</p>
          <a href="/rides" className="text-xs text-brand-500 font-semibold hover:underline flex items-center gap-1">
            View all <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {['Passenger', 'Driver', 'Route', 'Amount', 'Status', 'Time'].map((h) => (
                  <th key={h} className="th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {data.recent_rides.map((r) => (
                <tr key={r.id} className="hover:bg-surface-low transition-colors">
                  <td className="td font-medium text-ink">{r.passenger}</td>
                  <td className="td text-ink-subtle">{r.driver}</td>
                  <td className="td">
                    <span className="text-xs text-ink-subtle">{r.origin.split(',')[0]}</span>
                    <span className="text-ink-ghost mx-1">→</span>
                    <span className="text-xs text-ink-subtle">{r.destination.split(',')[0]}</span>
                  </td>
                  <td className="td font-semibold text-ink">{fmt.naira(r.amount)}</td>
                  <td className="td"><span className={badge(r.status)}>{r.status}</span></td>
                  <td className="td text-ink-subtle">{fmt.relative(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
