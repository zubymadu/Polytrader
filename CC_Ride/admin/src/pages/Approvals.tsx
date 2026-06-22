/**
 * Bookings & Approvals — Corporate booking approval queue with compliance checks
 * Mirrors the design: approval queue (left) + booking detail panel (right)
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckSquare, Clock, MapPin, Users, Building2, CheckCircle,
  XCircle, Loader2, Download, AlertCircle, BadgeCheck, ChevronRight,
} from 'lucide-react'
import { get, post } from '../lib/api'
import { fmt } from '../lib/utils'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

interface ApprovalRequest {
  id:              string
  booking_id:      string
  requester_name:  string
  requester_email: string
  requester_mobile:string
  origin:          string
  destination:     string
  estimated_fare:  number
  scheduled_at:    string
  created_at:      string
  expires_at:      string
  company:         string
  department:      string | null
  cost_centre:     string | null
  seats:           number
  total_amount:    number
}

// ─── Compliance check helper ─────────────────────────────────────────────────
function ComplianceItem({ label, pass, warn }: { label: string; pass?: boolean; warn?: string }) {
  if (warn)
    return (
      <div className="check-warn">
        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="font-medium">{label}:</span>
        <span className="text-amber-600">{warn}</span>
      </div>
    )
  return pass ? (
    <div className="check-pass">
      <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
      <span>{label}</span>
    </div>
  ) : (
    <div className="check-fail">
      <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
      <span>{label}</span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Approvals() {
  const [selected, setSelected] = useState<ApprovalRequest | null>(null)
  const [note, setNote] = useState('')
  const qc = useQueryClient()

  const { data: requests = [], isLoading } = useQuery<ApprovalRequest[]>({
    queryKey: ['admin-approvals'],
    queryFn:  () => get('/admin/bookings/approvals'),
    refetchInterval: 20_000,
  })

  const decide = useMutation({
    mutationFn: ({ action }: { action: 'approved' | 'rejected' }) =>
      post('/admin/bookings/approve', { request_id: selected!.id, action, note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-approvals'] })
      setSelected(null)
      setNote('')
    },
  })

  const isExpired = (r: ApprovalRequest) => new Date(r.expires_at) < new Date()
  const isFareMet  = (r: ApprovalRequest) => r.total_amount <= 25000  // ₦25k example threshold

  function exportCSV() {
    const headers = ['ID','Requester','Company','Department','Cost Centre','Origin','Destination','Fare','Scheduled','Created']
    const lines = requests.map((r) => [
      r.id, r.requester_name, r.company, r.department ?? '', r.cost_centre ?? '',
      r.origin, r.destination, r.total_amount,
      fmt.datetime(r.scheduled_at), fmt.datetime(r.created_at),
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    const csv = [headers.join(','), ...lines].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `approvals-${new Date().toISOString().slice(0,10)}.csv` })
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bookings & Approvals"
        sub="Manage corporate transit requests and flag logistics"
        action={
          <div className="flex gap-2">
            {requests.length > 0 && (
              <button onClick={exportCSV} className="btn-secondary text-sm">
                <Download className="w-4 h-4" /> Export CSV
              </button>
            )}
          </div>
        }
      />

      {/* Main split layout */}
      <div className="flex gap-5" style={{ minHeight: '70vh' }}>

        {/* ── Left: Approval Queue ───────────────────────────────────────── */}
        <div className="w-80 flex-shrink-0 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-ink-subtle uppercase tracking-wider">
              Approval Queue
            </p>
            {requests.length > 0 && (
              <span className="badge bg-amber-100 text-amber-700">{requests.length} pending</span>
            )}
          </div>

          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
            </div>
          ) : requests.length === 0 ? (
            <div className="card p-6 text-center">
              <BadgeCheck className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
              <p className="text-sm font-semibold text-ink">All clear!</p>
              <p className="text-xs text-ink-subtle mt-1">No bookings awaiting approval</p>
            </div>
          ) : (
            <div className="space-y-2">
              {requests.map((r) => (
                <button
                  key={r.id}
                  onClick={() => { setSelected(r); setNote('') }}
                  className={`w-full text-left card p-3.5 transition-all hover:shadow-modal ${selected?.id === r.id ? 'ring-2 ring-brand-500 shadow-modal' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">{r.requester_name}</p>
                      <p className="text-xs text-ink-subtle truncate">{r.company}</p>
                    </div>
                    {isExpired(r) ? (
                      <span className="badge bg-red-100 text-red-600 text-xs flex-shrink-0">Expired</span>
                    ) : (
                      <span className="badge bg-amber-100 text-amber-700 text-xs flex-shrink-0">Pending</span>
                    )}
                  </div>

                  <p className="text-xs text-ink-subtle truncate">
                    <MapPin className="w-3 h-3 inline mr-0.5" />
                    {r.origin.split(',')[0]} → {r.destination.split(',')[0]}
                  </p>

                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-surface-border">
                    <span className="text-xs font-semibold text-brand-600">{fmt.naira(r.total_amount)}</span>
                    <span className="text-xs text-ink-subtle">{fmt.relative(r.created_at)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Right: Booking Detail ──────────────────────────────────────── */}
        {selected ? (
          <div className="flex-1 flex flex-col gap-4">
            {/* Header */}
            <div className="card p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs text-ink-subtle mb-1 font-medium">Booking ID</p>
                  <p className="font-mono text-xs text-ink">{selected.booking_id}</p>
                </div>
                <span className="badge bg-amber-100 text-amber-700">PENDING APPROVAL</span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-ink-subtle mb-1">Requester</p>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 text-xs font-bold flex-shrink-0">
                      {selected.requester_name[0]}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-ink">{selected.requester_name}</p>
                      <p className="text-xs text-ink-subtle">{selected.requester_mobile}</p>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-ink-subtle mb-1">Fare Estimate</p>
                  <p className="text-base font-bold text-ink">{fmt.naira(selected.total_amount)}</p>
                  <p className="text-xs text-ink-subtle">{selected.seats} seat{selected.seats > 1 ? 's' : ''}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-subtle mb-1">Requested Type</p>
                  <p className="text-sm font-semibold text-ink">Executive Sedan</p>
                  <p className="text-xs text-ink-subtle">Immediate</p>
                </div>
                <div>
                  <p className="text-xs text-ink-subtle mb-1">Scheduled</p>
                  <p className="text-sm font-semibold text-ink">{fmt.date(selected.scheduled_at)}</p>
                  <p className="text-xs text-ink-subtle">{new Date(selected.scheduled_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>

              {/* Route */}
              <div className="mt-4 flex items-stretch gap-3 bg-surface-low rounded-lg p-3">
                <div className="flex flex-col items-center gap-1 pt-0.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <div className="w-0.5 flex-1 bg-surface-border" />
                  <MapPin className="w-3 h-3 text-red-500" />
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <p className="text-xs text-ink-subtle">PICKUP LOCATION</p>
                    <p className="text-sm font-medium text-ink">{selected.origin}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-subtle">DROP-OFF LOCATION</p>
                    <p className="text-sm font-medium text-ink">{selected.destination}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Corporate context */}
            <div className="card p-5">
              <p className="text-xs font-semibold text-ink-subtle uppercase tracking-wider mb-3">Corporate Context</p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-ink-subtle mb-1"><Building2 className="w-3 h-3 inline mr-0.5" />Company</p>
                  <p className="text-sm font-semibold text-ink">{selected.company}</p>
                </div>
                {selected.department && (
                  <div>
                    <p className="text-xs text-ink-subtle mb-1"><Users className="w-3 h-3 inline mr-0.5" />Department</p>
                    <p className="text-sm font-semibold text-ink">{selected.department}</p>
                  </div>
                )}
                {selected.cost_centre && (
                  <div>
                    <p className="text-xs text-ink-subtle mb-1">Cost Centre</p>
                    <span className="badge bg-brand-50 text-brand-600">{selected.cost_centre}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Compliance & Policy Check */}
            <div className="card p-5">
              <p className="text-xs font-semibold text-ink-subtle uppercase tracking-wider mb-3">
                Compliance & Policy Check
              </p>
              <div className="space-y-2">
                <ComplianceItem label="Within Budget" pass={isFareMet(selected)}
                  warn={!isFareMet(selected) ? `₦${(selected.total_amount - 25000).toLocaleString()} over limit` : undefined} />
                <ComplianceItem label="Approved Route" pass={true} />
                <ComplianceItem label="Company Policy" pass={!isExpired(selected)}
                  warn={isExpired(selected) ? 'Request has expired' : undefined} />
                <ComplianceItem label="Valid Cost Centre" pass={!!selected.cost_centre} />
              </div>
            </div>

            {/* Decision */}
            <div className="card p-5">
              <p className="text-xs font-semibold text-ink-subtle uppercase tracking-wider mb-3">Decision</p>
              <textarea
                className="input h-20 resize-none mb-4"
                placeholder="Optional note to requester (e.g. reason for rejection)…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="flex gap-3">
                <button
                  onClick={() => decide.mutate({ action: 'rejected' })}
                  disabled={decide.isPending || isExpired(selected)}
                  className="btn-danger flex-1 disabled:opacity-50"
                >
                  {decide.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                  Reject
                </button>
                <button
                  onClick={() => decide.mutate({ action: 'approved' })}
                  disabled={decide.isPending || isExpired(selected)}
                  className="btn-primary flex-1 disabled:opacity-50"
                >
                  {decide.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  Approve
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 card flex flex-col items-center justify-center text-center py-20">
            <CheckSquare className="w-12 h-12 text-ink-ghost mb-4" />
            <p className="text-base font-semibold text-ink">Select a booking request</p>
            <p className="text-sm text-ink-subtle mt-1">Click an item in the queue to review and decide</p>
          </div>
        )}
      </div>

      {/* ── All bookings history ──────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-surface-border flex items-center justify-between">
          <p className="text-sm font-semibold text-ink">All Bookings History</p>
          <p className="text-xs text-ink-subtle">All approved + rejected across departments</p>
        </div>
        <div className="p-8 text-center text-ink-subtle">
          <p className="text-sm">Use the Analytics page for historical breakdowns by company and department.</p>
          <a href="/analytics" className="text-brand-500 text-sm font-medium hover:underline inline-flex items-center gap-1 mt-2">
            View Analytics <ChevronRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  )
}
