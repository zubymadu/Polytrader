import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Download, Loader2, CreditCard } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { get } from '../lib/api'
import { fmt, badge } from '../lib/utils'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'

interface PaymentSummary {
  total_collected: number; platform_revenue: number
  driver_payouts: number; pending_payouts: number
  paystack_volume: number; flutterwave_volume: number
  monthly_breakdown: { month: string; paystack: number; flutterwave: number; revenue: number }[]
}

interface Transaction {
  id: string; reference: string; passenger: string; driver: string
  amount: number; platform_fee: number; gateway: string
  status: string; created_at: string; is_corporate: boolean; company_name: string | null
}

interface Payout {
  id: string; driver: string; amount: number
  status: string; requested_at: string; bank_name: string; account_number: string
}

export default function Payments() {
  const [tab, setTab]         = useState<'transactions' | 'payouts'>('transactions')
  const [gateway, setGateway] = useState('all')
  const [search, setSearch]   = useState('')

  const { data: summary } = useQuery<PaymentSummary>({
    queryKey: ['admin-payment-summary'],
    queryFn: () => get('/admin/payments/summary'),
  })

  const { data: txns = [], isLoading: txnLoading } = useQuery<Transaction[]>({
    queryKey: ['admin-transactions', gateway],
    queryFn: () => get('/admin/payments/transactions', { gateway: gateway === 'all' ? undefined : gateway }),
    enabled: tab === 'transactions',
  })

  const { data: payouts = [], isLoading: payoutLoading } = useQuery<Payout[]>({
    queryKey: ['admin-payouts'],
    queryFn: () => get('/admin/payments/payouts', { status: 'pending' }),
    enabled: tab === 'payouts',
  })

  const filtered = txns.filter((t) =>
    !search || t.passenger.toLowerCase().includes(search.toLowerCase()) || t.reference.includes(search),
  )

  return (
    <div className="space-y-6">
      <PageHeader title="Payments"
        action={<button className="btn-secondary text-sm"><Download className="w-4 h-4" /> Export CSV</button>}
      />

      {summary && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Collected"  value={fmt.naira(summary.total_collected)}  icon={CreditCard} color="green" />
            <StatCard label="Platform Revenue" value={fmt.naira(summary.platform_revenue)} icon={CreditCard} color="blue" />
            <StatCard label="Driver Payouts"   value={fmt.naira(summary.driver_payouts)}   icon={CreditCard} color="purple" />
            <StatCard label="Pending Payouts"  value={fmt.naira(summary.pending_payouts)}  icon={CreditCard} color={summary.pending_payouts > 0 ? 'orange' : 'green'} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Paystack Volume', value: summary.paystack_volume, code: 'PS', color: 'blue' },
              { label: 'Flutterwave Volume', value: summary.flutterwave_volume, code: 'FW', color: 'orange' },
            ].map((g) => (
              <div key={g.code} className="card p-5 flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl bg-${g.color}-50 flex items-center justify-center`}>
                  <span className={`text-${g.color}-600 font-bold text-xs`}>{g.code}</span>
                </div>
                <div>
                  <p className="text-xs text-gray-400">{g.label}</p>
                  <p className="text-xl font-bold text-gray-900">{fmt.naira(g.value)}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="card p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-5">Monthly Volume by Gateway</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={summary.monthly_breakdown} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} width={60} />
                <Tooltip formatter={(v: number) => fmt.naira(v)} />
                <Legend />
                <Bar dataKey="paystack"    fill="#0047FF" radius={[4, 4, 0, 0]} name="Paystack" />
                <Bar dataKey="flutterwave" fill="#F5A623" radius={[4, 4, 0, 0]} name="Flutterwave" />
                <Bar dataKey="revenue"     fill="#00B894" radius={[4, 4, 0, 0]} name="Platform revenue" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {(['transactions', 'payouts'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            {t[0].toUpperCase() + t.slice(1)}
            {t === 'payouts' && payouts.length > 0 && (
              <span className="ml-1.5 bg-orange-100 text-orange-600 text-xs px-1.5 py-0.5 rounded-full">{payouts.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'transactions' ? (
        <>
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input className="input pl-9" placeholder="Search reference or name…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {['all', 'paystack', 'flutterwave', 'company_account'].map((g) => (
              <button key={g} onClick={() => setGateway(g)}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${gateway === g ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                {g === 'all' ? 'All' : g.replace('_', ' ')}
              </button>
            ))}
          </div>
          {txnLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 text-brand-500 animate-spin" /></div>
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>{['Reference', 'Passenger', 'Driver', 'Amount', 'Fee', 'Gateway', 'Status', 'Date'].map((h) => <th key={h} className="th">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((t) => (
                      <tr key={t.id} className="hover:bg-gray-50">
                        <td className="td font-mono text-xs">{t.reference}</td>
                        <td className="td">
                          <p className="font-medium">{t.passenger}</p>
                          {t.is_corporate && <p className="text-xs text-purple-600">{t.company_name}</p>}
                        </td>
                        <td className="td">{t.driver}</td>
                        <td className="td font-semibold">{fmt.naira(t.amount)}</td>
                        <td className="td text-green-700">{fmt.naira(t.platform_fee)}</td>
                        <td className="td">
                          <span className={`badge ${t.gateway === 'paystack' ? 'bg-blue-100 text-blue-700' : t.gateway === 'flutterwave' ? 'bg-orange-100 text-orange-700' : 'bg-purple-100 text-purple-700'}`}>
                            {t.gateway}
                          </span>
                        </td>
                        <td className="td"><span className={badge(t.status)}>{t.status}</span></td>
                        <td className="td text-gray-400">{fmt.datetime(t.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        payoutLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 text-brand-500 animate-spin" /></div>
        ) : payouts.length === 0 ? (
          <div className="card p-12 text-center text-gray-400">No pending payouts</div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>{['Driver', 'Bank', 'Account', 'Amount', 'Requested', 'Status', 'Actions'].map((h) => <th key={h} className="th">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payouts.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="td font-medium">{p.driver}</td>
                      <td className="td">{p.bank_name}</td>
                      <td className="td font-mono text-xs">{p.account_number}</td>
                      <td className="td font-semibold">{fmt.naira(p.amount)}</td>
                      <td className="td text-gray-400">{fmt.relative(p.requested_at)}</td>
                      <td className="td"><span className={badge(p.status)}>{p.status}</span></td>
                      <td className="td">
                        {p.status === 'pending' && <button className="btn-primary text-xs py-1">Mark Paid</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  )
}
