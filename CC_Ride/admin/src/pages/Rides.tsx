import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, MapPin, Loader2, RefreshCw,
  ChevronDown, Download, XCircle, Building2, Plus,
} from 'lucide-react'
import { get, post } from '../lib/api'
import { fmt, badge } from '../lib/utils'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Ride {
  id: string; passenger: string; driver: string; company_name: string | null
  origin: string; destination: string; status: string
  total_amount: number; created_at: string; is_corporate: boolean
}

interface LiveRide {
  id: string; passenger: string; driver: string
  origin: string; destination: string; started_at: string
  driver_lat: number | null; driver_lng: number | null
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCSV(rows: Ride[]) {
  const headers = ['ID', 'Passenger', 'Driver', 'Company', 'Origin', 'Destination', 'Status', 'Amount (NGN)', 'Type', 'Date']
  const lines   = rows.map((r) =>
    [
      r.id, r.passenger, r.driver, r.company_name ?? '',
      r.origin, r.destination, r.status,
      r.total_amount, r.is_corporate ? 'Corporate' : 'Personal',
      fmt.datetime(r.created_at),
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','),
  )
  const csv  = [headers.join(','), ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `ccride-rides-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Ride detail row (expandable) ────────────────────────────────────────────

function RideDetailRow({
  ride,
  onCancel,
  cancelling,
}: {
  ride: Ride
  onCancel: (id: string) => void
  cancelling: boolean
}) {
  const cancellable = ['confirmed', 'pending', 'in_progress', 'processing'].includes(ride.status)

  return (
    <tr className="bg-brand-50">
      <td colSpan={7} className="px-4 py-3">
        <div className="flex flex-wrap gap-6 text-sm">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Booking ID</p>
            <p className="font-mono text-xs text-gray-700">{ride.id}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Full Origin</p>
            <p className="text-gray-700 max-w-xs">{ride.origin}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Full Destination</p>
            <p className="text-gray-700 max-w-xs">{ride.destination}</p>
          </div>
          {ride.company_name && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Company</p>
              <div className="flex items-center gap-1">
                <Building2 className="w-3 h-3 text-purple-500" />
                <p className="text-gray-700">{ride.company_name}</p>
              </div>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Created</p>
            <p className="text-gray-700">{fmt.datetime(ride.created_at)}</p>
          </div>
          <div className="ml-auto flex items-end">
            {cancellable && (
              <button
                onClick={() => {
                  if (confirm(`Cancel this ride?\n\nPassenger: ${ride.passenger}\nAmount: ${fmt.naira(ride.total_amount)}`)) {
                    onCancel(ride.id)
                  }
                }}
                disabled={cancelling}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-50"
              >
                {cancelling ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                Force Cancel
              </button>
            )}
          </div>
        </div>
      </td>
    </tr>
  )
}

// ─── Create Ride Modal ────────────────────────────────────────────────────────

interface AvailableDriver { id: string; name: string; mobile: string; rating: number }

function CreateRideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    driver_id: '',
    origin_address: '', origin_lat: '', origin_lng: '',
    destination_address: '', destination_lat: '', destination_lng: '',
    scheduled_at: '',
    base_fare: '',
    available_seats: '4',
    trip_notes: '',
  })

  const { data: drivers = [] } = useQuery<AvailableDriver[]>({
    queryKey: ['available-drivers'],
    queryFn:  () => get('/admin/drivers/available'),
    enabled:  open,
  })

  const mutation = useMutation({
    mutationFn: () => post('/admin/rides/create', {
      driver_id:           form.driver_id,
      origin_address:      form.origin_address,
      origin_lat:          parseFloat(form.origin_lat),
      origin_lng:          parseFloat(form.origin_lng),
      destination_address: form.destination_address,
      destination_lat:     parseFloat(form.destination_lat),
      destination_lng:     parseFloat(form.destination_lng),
      scheduled_at:        form.scheduled_at,
      base_fare:           parseFloat(form.base_fare),
      available_seats:     parseInt(form.available_seats),
      trip_notes:          form.trip_notes || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-rides'] })
      onClose()
      setForm({ driver_id: '', origin_address: '', origin_lat: '', origin_lng: '',
        destination_address: '', destination_lat: '', destination_lng: '',
        scheduled_at: '', base_fare: '', available_seats: '4', trip_notes: '' })
    },
  })

  const inp = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400'
  const isValid = form.driver_id && form.origin_address && form.destination_address &&
                  form.scheduled_at && form.base_fare && form.origin_lat && form.destination_lat

  return (
    <Modal open={open} onClose={onClose} title="Create New Ride" size="lg">
      <div className="space-y-4">
        {/* Driver */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Assign Driver *</label>
          {drivers.length === 0 ? (
            <p className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
              No active drivers available. Register and activate a driver first.
            </p>
          ) : (
            <select className={inp} value={form.driver_id}
              onChange={(e) => setForm((f) => ({ ...f, driver_id: e.target.value }))}>
              <option value="">— Select a driver —</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · {d.mobile} · ★ {Number(d.rating).toFixed(1)}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Origin */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Pickup Address *</label>
          <input className={inp} placeholder="e.g. 14 Broad Street, Lagos Island" value={form.origin_address}
            onChange={(e) => setForm((f) => ({ ...f, origin_address: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Pickup Latitude *</label>
            <input className={inp} type="number" step="any" placeholder="6.4550" value={form.origin_lat}
              onChange={(e) => setForm((f) => ({ ...f, origin_lat: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Pickup Longitude *</label>
            <input className={inp} type="number" step="any" placeholder="3.3841" value={form.origin_lng}
              onChange={(e) => setForm((f) => ({ ...f, origin_lng: e.target.value }))} />
          </div>
        </div>

        {/* Destination */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Dropoff Address *</label>
          <input className={inp} placeholder="e.g. 1 Airport Road, Ikeja" value={form.destination_address}
            onChange={(e) => setForm((f) => ({ ...f, destination_address: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Dropoff Latitude *</label>
            <input className={inp} type="number" step="any" placeholder="6.5774" value={form.destination_lat}
              onChange={(e) => setForm((f) => ({ ...f, destination_lat: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Dropoff Longitude *</label>
            <input className={inp} type="number" step="any" placeholder="3.3218" value={form.destination_lng}
              onChange={(e) => setForm((f) => ({ ...f, destination_lng: e.target.value }))} />
          </div>
        </div>

        {/* Schedule + Fare */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Scheduled Date & Time *</label>
            <input className={inp} type="datetime-local" value={form.scheduled_at}
              onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Seats</label>
            <input className={inp} type="number" min="1" max="14" value={form.available_seats}
              onChange={(e) => setForm((f) => ({ ...f, available_seats: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Base Fare (₦) *</label>
          <input className={inp} type="number" step="0.01" placeholder="2500.00" value={form.base_fare}
            onChange={(e) => setForm((f) => ({ ...f, base_fare: e.target.value }))} />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Trip Notes (optional)</label>
          <input className={inp} placeholder="Any special instructions for passengers" value={form.trip_notes}
            onChange={(e) => setForm((f) => ({ ...f, trip_notes: e.target.value }))} />
        </div>

        {mutation.isError && (
          <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">
            {(mutation.error as any)?.message ?? 'Something went wrong'}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !isValid}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            {mutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin inline mr-1" />Creating…</> : 'Create Ride'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Rides() {
  const [search, setSearch]       = useState('')
  const [tab, setTab]             = useState<'history' | 'live'>('history')
  const [status, setStatus]       = useState('all')
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const qc = useQueryClient()

  const { data: rides = [], isLoading, refetch } = useQuery<Ride[]>({
    queryKey: ['admin-rides', status],
    queryFn:  () => get('/admin/rides', { status: status === 'all' ? undefined : status }),
    enabled:  tab === 'history',
  })

  const { data: live = [], isLoading: liveLoading, refetch: refetchLive } = useQuery<LiveRide[]>({
    queryKey: ['admin-live-rides'],
    queryFn:  () => get('/admin/rides/live'),
    enabled:  tab === 'live',
    refetchInterval: 10_000,
  })

  const cancelMutation = useMutation({
    mutationFn: (booking_id: string) =>
      post('/admin/rides/cancel', { booking_id, reason: 'Cancelled by admin' }),
    onMutate:   (id) => setCancelling(id),
    onSettled:  () => setCancelling(null),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['admin-rides'] })
      setExpanded(null)
    },
  })

  const filtered = rides.filter((r) =>
    !search ||
    r.passenger.toLowerCase().includes(search.toLowerCase()) ||
    r.driver.toLowerCase().includes(search.toLowerCase()) ||
    r.origin.toLowerCase().includes(search.toLowerCase()) ||
    (r.company_name ?? '').toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rides"
        sub={`${rides.length} ride${rides.length !== 1 ? 's' : ''} loaded`}
        action={
          <div className="flex gap-2">
            {tab === 'history' && filtered.length > 0 && (
              <button onClick={() => exportCSV(filtered)} className="btn-secondary text-sm">
                <Download className="w-4 h-4" /> Export CSV
              </button>
            )}
            <button onClick={() => tab === 'live' ? refetchLive() : refetch()} className="btn-secondary text-sm">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
            <button onClick={() => setCreateOpen(true)} className="btn-primary text-sm">
              <Plus className="w-4 h-4" /> Create Ride
            </button>
          </div>
        }
      />

      <CreateRideModal open={createOpen} onClose={() => setCreateOpen(false)} />

      {/* History / Live toggle */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {(['history', 'live'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            {t === 'live' ? (
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Live ({live.length})
              </span>
            ) : 'History'}
          </button>
        ))}
      </div>

      {/* ── Live rides ─────────────────────────────────────────────────────── */}
      {tab === 'live' ? (
        liveLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 text-brand-500 animate-spin" /></div>
        ) : live.length === 0 ? (
          <EmptyState icon={MapPin} title="No active rides right now" sub="Live rides appear here as they start — auto-refreshes every 10 s" />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {live.map((r) => (
              <div key={r.id} className="card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="badge bg-green-100 text-green-700 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    Live
                  </span>
                  <span className="text-xs text-gray-400">{fmt.relative(r.started_at)}</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                    <p className="text-xs text-gray-600 leading-snug">{r.origin}</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-gray-600 leading-snug">{r.destination}</p>
                  </div>
                </div>
                <div className="pt-2 border-t border-gray-100 grid grid-cols-2 gap-1 text-xs">
                  <div>
                    <p className="text-gray-400">Passenger</p>
                    <p className="font-medium text-gray-800">{r.passenger}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Driver</p>
                    <p className="font-medium text-gray-800">{r.driver}</p>
                  </div>
                </div>
                {r.driver_lat && r.driver_lng && (
                  <a
                    href={`https://maps.google.com/?q=${r.driver_lat},${r.driver_lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium"
                  >
                    <MapPin className="w-3 h-3" /> View on Maps
                  </a>
                )}
                <button
                  onClick={() => { if (confirm('Force-cancel this live ride?')) cancelMutation.mutate(r.id) }}
                  disabled={cancelling === r.id}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
                >
                  {cancelling === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                  Force Cancel
                </button>
              </div>
            ))}
          </div>
        )

      /* ── History ──────────────────────────────────────────────────────────── */
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                className="input pl-9"
                placeholder="Search passenger, driver, company, origin…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {['all', 'confirmed', 'in_progress', 'completed', 'cancelled', 'pending'].map((s) => (
              <button key={s} onClick={() => setStatus(s)}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${status === s ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                {s === 'all' ? 'All' : s.replace('_', ' ')}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 text-brand-500 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={MapPin} title="No rides found" sub="Try adjusting the search or filter" />
          ) : (
            <div className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between text-sm text-gray-500">
                <span>{filtered.length} ride{filtered.length !== 1 ? 's' : ''}</span>
                <span className="text-xs text-gray-400">Click a row to expand details · Force-cancel from expanded view</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Passenger', 'Driver', 'Route', 'Amount', 'Type', 'Status', 'Date'].map((h) => (
                        <th key={h} className="th">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((r) => (
                      <>
                        <tr
                          key={r.id}
                          className="hover:bg-gray-50 cursor-pointer transition-colors"
                          onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                        >
                          <td className="td font-medium">{r.passenger}</td>
                          <td className="td text-gray-600">{r.driver}</td>
                          <td className="td">
                            <p className="text-xs text-gray-700">{r.origin.split(',')[0]}</p>
                            <p className="text-xs text-gray-400">→ {r.destination.split(',')[0]}</p>
                          </td>
                          <td className="td font-medium">{fmt.naira(r.total_amount)}</td>
                          <td className="td">
                            <span className={`badge text-xs ${r.is_corporate ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
                              {r.is_corporate ? 'Corporate' : 'Personal'}
                            </span>
                          </td>
                          <td className="td"><span className={badge(r.status)}>{r.status.replace('_', ' ')}</span></td>
                          <td className="td">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-400 text-xs">{fmt.date(r.created_at)}</span>
                              <ChevronDown className={`w-3.5 h-3.5 text-gray-300 transition-transform ${expanded === r.id ? 'rotate-180' : ''}`} />
                            </div>
                          </td>
                        </tr>

                        {expanded === r.id && (
                          <RideDetailRow
                            key={`${r.id}-detail`}
                            ride={r}
                            onCancel={(id) => cancelMutation.mutate(id)}
                            cancelling={cancelling === r.id}
                          />
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
