/**
 * Billing — Corporate invoice list and drill-down by company/month
 * Uses /admin/billing/invoices and /admin/billing/invoices/:companyId/:month
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  FileText, ChevronRight, ChevronDown, Download, Loader2,
  Building2, Calendar, CheckCircle, Clock, ExternalLink,
} from 'lucide-react'
import { get } from '../lib/api'
import { fmt, badge } from '../lib/utils'
import PageHeader from '../components/PageHeader'

interface Invoice {
  id:            string
  company_id:    string
  company_name:  string
  contact_email: string
  contact_name:  string
  month:         string
  month_label:   string
  total_rides:   number
  gross_amount:  number
  commission:    number
  net_payable:   number
  status:        'issued' | 'pending'
}

interface InvoiceDetail {
  company:    { id: string; name: string; contact_name: string; contact_email: string }
  month:      string
  month_label:string
  summary:    { total_rides: number; gross_amount: number; commission: number; net_payable: number }
  line_items: {
    booking_id:  string
    date:        string
    passenger:   string
    origin:      string
    destination: string
    department:  string
    cost_centre: string
    amount:      number
    commission:  number
    status:      string
  }[]
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'issued')
    return <span className="badge bg-emerald-100 text-emerald-700"><CheckCircle className="w-3 h-3" /> Issued</span>
  return <span className="badge bg-amber-100 text-amber-700"><Clock className="w-3 h-3" /> Pending</span>
}

function SummaryTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-surface-low rounded-lg px-4 py-3 border border-surface-border">
      <p className="text-xs text-ink-subtle mb-1">{label}</p>
      <p className="text-base font-bold text-ink">{value}</p>
      {sub && <p className="text-xs text-ink-subtle">{sub}</p>}
    </div>
  )
}

export default function Billing() {
  const [expanded, setExpanded] = useState<string | null>(null)   // "companyId__month"
  const [filter, setFilter]     = useState<'all' | 'issued' | 'pending'>('all')

  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ['admin-invoices'],
    queryFn:  () => get('/admin/billing/invoices'),
    staleTime: 2 * 60 * 1000,
  })

  const [detailKey, companyId, month] = expanded
    ? [expanded, ...expanded.split('__')] as [string, string, string]
    : [null, null, null]

  const { data: detail, isLoading: detailLoading } = useQuery<InvoiceDetail>({
    queryKey: ['admin-invoice-detail', companyId, month],
    queryFn:  () => get(`/admin/billing/invoices/${companyId}/${month}`),
    enabled:  !!companyId && !!month,
  })

  const filtered = invoices.filter((i) => filter === 'all' || i.status === filter)

  const totals = filtered.reduce((a, i) => ({
    gross:      a.gross      + i.gross_amount,
    commission: a.commission + i.commission,
    net:        a.net        + i.net_payable,
    rides:      a.rides      + i.total_rides,
  }), { gross: 0, commission: 0, net: 0, rides: 0 })

  function exportCSV() {
    const headers = ['Invoice ID','Company','Period','Rides','Gross (₦)','Commission (₦)','Net Payable (₦)','Status']
    const lines = filtered.map((i) =>
      [i.id, i.company_name, i.month_label, i.total_rides,
       i.gross_amount, i.commission, i.net_payable, i.status].join(',')
    )
    const csv = [headers.join(','), ...lines].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    Object.assign(document.createElement('a'), {
      href: url, download: `invoices-${new Date().toISOString().slice(0,10)}.csv`
    }).click()
    URL.revokeObjectURL(url)
  }

  function exportDetailCSV() {
    if (!detail) return
    const headers = ['Date','Passenger','Origin','Destination','Department','Cost Centre','Amount (₦)','Commission (₦)','Status']
    const lines = detail.line_items.map((l) =>
      [fmt.date(l.date), l.passenger, l.origin, l.destination,
       l.department, l.cost_centre, l.amount, l.commission, l.status].join(',')
    )
    const csv = [headers.join(','), ...lines].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    Object.assign(document.createElement('a'), {
      href: url, download: `invoice-${detail.company.name.replace(/\s+/g, '-')}-${detail.month}.csv`
    }).click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Billing & Invoices"
        sub="Company-level invoices generated from completed rides"
        action={
          <button onClick={exportCSV} className="btn-secondary text-sm">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        }
      />

      {/* Summary bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryTile label="Total Invoices"  value={filtered.length.toString()} />
        <SummaryTile label="Total Rides"     value={totals.rides.toLocaleString()} />
        <SummaryTile label="Total GMV"       value={fmt.naira(totals.gross)} />
        <SummaryTile label="Net Payable"     value={fmt.naira(totals.net)}
          sub={`Comm: ${fmt.naira(totals.commission)}`} />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2">
        {(['all', 'issued', 'pending'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors capitalize ${
              filter === f ? 'bg-brand-500 text-white' : 'bg-white border border-surface-border text-ink-subtle hover:text-ink'
            }`}>
            {f === 'all' ? `All (${invoices.length})` : f === 'issued'
              ? `Issued (${invoices.filter(i => i.status === 'issued').length})`
              : `Pending (${invoices.filter(i => i.status === 'pending').length})`}
          </button>
        ))}
      </div>

      {/* Invoice table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Invoice ID</th>
              <th className="th">Company</th>
              <th className="th">Period</th>
              <th className="th text-right">Rides</th>
              <th className="th text-right">Gross</th>
              <th className="th text-right">Net Payable</th>
              <th className="th">Status</th>
              <th className="th w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="text-center py-16">
                  <Loader2 className="w-6 h-6 text-brand-500 animate-spin mx-auto" />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-16">
                  <FileText className="w-10 h-10 text-ink-ghost mx-auto mb-3" />
                  <p className="text-sm text-ink-subtle">No invoices yet</p>
                </td>
              </tr>
            ) : (
              filtered.map((inv) => {
                const key     = `${inv.company_id}__${inv.month}`
                const isOpen  = expanded === key
                return (
                  <>
                    <tr key={inv.id}
                      className="hover:bg-surface-low transition-colors cursor-pointer"
                      onClick={() => setExpanded(isOpen ? null : key)}>
                      <td className="td">
                        <span className="font-mono text-xs text-brand-600">{inv.id}</span>
                      </td>
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-md bg-brand-50 flex items-center justify-center">
                            <Building2 className="w-3.5 h-3.5 text-brand-600" />
                          </div>
                          <div>
                            <p className="font-medium text-ink text-sm">{inv.company_name}</p>
                            <p className="text-xs text-ink-subtle">{inv.contact_email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="td">
                        <div className="flex items-center gap-1.5 text-sm text-ink">
                          <Calendar className="w-3.5 h-3.5 text-ink-ghost" />
                          {inv.month_label}
                        </div>
                      </td>
                      <td className="td text-right font-semibold">{inv.total_rides}</td>
                      <td className="td text-right font-semibold">{fmt.naira(inv.gross_amount)}</td>
                      <td className="td text-right font-bold text-brand-600">{fmt.naira(inv.net_payable)}</td>
                      <td className="td"><StatusBadge status={inv.status} /></td>
                      <td className="td text-center">
                        {isOpen
                          ? <ChevronDown className="w-4 h-4 text-ink-subtle" />
                          : <ChevronRight className="w-4 h-4 text-ink-subtle" />}
                      </td>
                    </tr>

                    {/* ── Expanded detail row ── */}
                    {isOpen && (
                      <tr key={`${inv.id}-detail`}>
                        <td colSpan={8} className="p-0 bg-surface-low border-b border-surface-border">
                          {detailLoading ? (
                            <div className="flex justify-center py-8">
                              <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
                            </div>
                          ) : detail ? (
                            <div className="px-6 py-5 space-y-4">
                              {/* Detail header */}
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-semibold text-ink">{detail.company.name} — {detail.month_label}</p>
                                  <p className="text-xs text-ink-subtle mt-0.5">{detail.company.contact_name} · {detail.company.contact_email}</p>
                                </div>
                                <button onClick={exportDetailCSV} className="btn-secondary text-xs h-8 px-3">
                                  <Download className="w-3.5 h-3.5" /> Download
                                </button>
                              </div>

                              {/* Summary tiles */}
                              <div className="grid grid-cols-4 gap-3">
                                <SummaryTile label="Rides"        value={detail.summary.total_rides.toString()} />
                                <SummaryTile label="Gross"        value={fmt.naira(detail.summary.gross_amount)} />
                                <SummaryTile label="Commission"   value={fmt.naira(detail.summary.commission)} />
                                <SummaryTile label="Net Payable"  value={fmt.naira(detail.summary.net_payable)} />
                              </div>

                              {/* Line-items table */}
                              <div className="rounded-lg border border-surface-border overflow-hidden">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="bg-surface-mid">
                                      <th className="px-3 py-2 text-left font-semibold text-ink-subtle">Date</th>
                                      <th className="px-3 py-2 text-left font-semibold text-ink-subtle">Passenger</th>
                                      <th className="px-3 py-2 text-left font-semibold text-ink-subtle">Route</th>
                                      <th className="px-3 py-2 text-left font-semibold text-ink-subtle">Department</th>
                                      <th className="px-3 py-2 text-left font-semibold text-ink-subtle">Cost Centre</th>
                                      <th className="px-3 py-2 text-right font-semibold text-ink-subtle">Amount</th>
                                      <th className="px-3 py-2 text-center font-semibold text-ink-subtle">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-surface-border">
                                    {detail.line_items.map((li) => (
                                      <tr key={li.booking_id} className="hover:bg-white transition-colors">
                                        <td className="px-3 py-2 text-ink-subtle">{fmt.date(li.date)}</td>
                                        <td className="px-3 py-2 font-medium text-ink">{li.passenger}</td>
                                        <td className="px-3 py-2 text-ink-subtle max-w-[160px]">
                                          <p className="truncate">{li.origin}</p>
                                          <p className="truncate text-ink-ghost">→ {li.destination}</p>
                                        </td>
                                        <td className="px-3 py-2 text-ink">{li.department}</td>
                                        <td className="px-3 py-2">
                                          {li.cost_centre !== '—'
                                            ? <span className="badge bg-brand-50 text-brand-600">{li.cost_centre}</span>
                                            : <span className="text-ink-ghost">—</span>}
                                        </td>
                                        <td className="px-3 py-2 text-right font-semibold text-ink">{fmt.naira(li.amount)}</td>
                                        <td className="px-3 py-2 text-center">
                                          <span className={badge(li.status)}>{li.status}</span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr className="bg-brand-50 border-t-2 border-brand-100">
                                      <td colSpan={5} className="px-3 py-2.5 font-semibold text-ink text-xs">Total</td>
                                      <td className="px-3 py-2.5 text-right font-bold text-brand-600 text-xs">
                                        {fmt.naira(detail.summary.gross_amount)}
                                      </td>
                                      <td />
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    )}
                  </>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
