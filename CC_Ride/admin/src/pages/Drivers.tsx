import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, CheckCircle, XCircle, Car, Loader2, UserPlus } from 'lucide-react'
import { get, post } from '../lib/api'
import { fmt, badge } from '../lib/utils'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'

interface Driver {
  user_id: string; name: string; email: string; mobile: string
  status: string; average_rating: number; total_trips: number
  total_earnings: number; license_expiry: string; created_at: string
  pending_documents: number
}

// ─── Add Driver Modal ─────────────────────────────────────────────────────────

function AddDriverModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: '', mobile: '', email: '', password: '',
    license_number: '', license_expiry: '',
    nin: '', bvn: '', auto_activate: false,
  })
  const [result, setResult] = useState<{ generated_password?: string } | null>(null)

  const mutation = useMutation({
    mutationFn: () => post('/admin/drivers/create', {
      name:           form.name,
      mobile:         form.mobile,
      email:          form.email || undefined,
      password:       form.password || undefined,
      license_number: form.license_number,
      license_expiry: form.license_expiry,
      nin:            form.nin || undefined,
      bvn:            form.bvn || undefined,
      auto_activate:  form.auto_activate,
    }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['admin-drivers'] })
      setResult(data)
    },
  })

  const inp = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400'

  function handleClose() {
    setForm({ name: '', mobile: '', email: '', password: '', license_number: '', license_expiry: '', nin: '', bvn: '', auto_activate: false })
    setResult(null)
    onClose()
  }

  if (result) {
    return (
      <Modal open={open} onClose={handleClose} title="Driver Registered" size="sm">
        <div className="space-y-4 text-center">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <CheckCircle className="w-7 h-7 text-green-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-lg">{form.name}</p>
            <p className="text-gray-500 text-sm">{form.mobile}</p>
          </div>
          {result.generated_password && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left">
              <p className="text-xs text-amber-700 font-semibold uppercase tracking-wide mb-1">Generated Password</p>
              <p className="font-mono text-amber-900 text-base select-all">{result.generated_password}</p>
              <p className="text-xs text-amber-600 mt-1">Share this with the driver to log in to the app</p>
            </div>
          )}
          <button onClick={handleClose} className="btn-primary w-full">Done</button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open={open} onClose={handleClose} title="Register New Driver" size="md">
      <div className="space-y-4">
        {/* Personal info */}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
            <input className={inp} placeholder="e.g. Emeka Okafor" value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Phone Number *</label>
            <input className={inp} placeholder="+2348012345678" value={form.mobile}
              onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email (optional)</label>
            <input className={inp} type="email" placeholder="driver@email.com" value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
        </div>

        {/* Password */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Password <span className="text-gray-400">(leave blank to auto-generate)</span>
          </label>
          <input className={inp} type="password" placeholder="Min 6 characters" value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
        </div>

        {/* Licence */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Licence Number *</label>
            <input className={inp} placeholder="e.g. LK-234567YA" value={form.license_number}
              onChange={(e) => setForm((f) => ({ ...f, license_number: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Licence Expiry *</label>
            <input className={inp} type="date" value={form.license_expiry}
              onChange={(e) => setForm((f) => ({ ...f, license_expiry: e.target.value }))} />
          </div>
        </div>

        {/* NIN / BVN */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">NIN (optional)</label>
            <input className={inp} placeholder="11-digit NIN" value={form.nin}
              onChange={(e) => setForm((f) => ({ ...f, nin: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">BVN (optional)</label>
            <input className={inp} placeholder="11-digit BVN" value={form.bvn}
              onChange={(e) => setForm((f) => ({ ...f, bvn: e.target.value }))} />
          </div>
        </div>

        {/* Auto-activate */}
        <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-gray-200 hover:bg-gray-50">
          <input type="checkbox" className="w-4 h-4 rounded accent-brand-500"
            checked={form.auto_activate}
            onChange={(e) => setForm((f) => ({ ...f, auto_activate: e.target.checked }))} />
          <div>
            <p className="text-sm font-medium text-gray-800">Activate immediately</p>
            <p className="text-xs text-gray-400">Driver can accept rides right away — skip document review</p>
          </div>
        </label>

        {mutation.isError && (
          <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">
            {(mutation.error as any)?.message ?? 'Something went wrong'}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <button onClick={handleClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.name || !form.mobile || !form.license_number || !form.license_expiry}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            {mutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin inline mr-1" />Registering…</> : 'Register Driver'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Drivers() {
  const [search, setSearch]   = useState('')
  const [tab, setTab]         = useState<'all' | 'pending' | 'active' | 'suspended'>('all')
  const [addOpen, setAddOpen] = useState(false)
  const qc = useQueryClient()

  const { data = [], isLoading } = useQuery<Driver[]>({
    queryKey: ['admin-drivers', tab],
    queryFn: () => get('/admin/drivers', { status: tab === 'all' ? undefined : tab }),
  })

  const approveDoc = useMutation({
    mutationFn: ({ driverId, action }: { driverId: string; action: 'approve' | 'reject' }) =>
      post('/admin/drivers/approve', { driver_id: driverId, action }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-drivers'] }),
  })

  const updateStatus = useMutation({
    mutationFn: ({ driverId, status }: { driverId: string; status: string }) =>
      post('/admin/drivers/status', { driver_id: driverId, status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-drivers'] }),
  })

  const filtered = data.filter((d) =>
    !search || d.name.toLowerCase().includes(search.toLowerCase()) || d.mobile.includes(search),
  )

  const tabs = ['all', 'pending', 'active', 'suspended'] as const

  return (
    <div className="space-y-6">
      <PageHeader
        title="Drivers"
        sub={`${data.length.toLocaleString()} registered drivers`}
        action={
          <button onClick={() => setAddOpen(true)} className="btn-primary text-sm">
            <UserPlus className="w-4 h-4" /> Add Driver
          </button>
        }
      />

      <AddDriverModal open={addOpen} onClose={() => setAddOpen(false)} />

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input pl-9" placeholder="Search drivers…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${tab === t ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 text-brand-500 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Car} title="No drivers found"
          sub={tab === 'all' ? 'Add your first driver using the button above' : `No ${tab} drivers`} />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {['Driver', 'Rating', 'Trips', 'Earnings', 'Licence Expiry', 'Status', 'Docs', 'Actions'].map((h) => (
                    <th key={h} className="th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((d) => (
                  <tr key={d.user_id} className="hover:bg-gray-50">
                    <td className="td">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {d.name[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{d.name}</p>
                          <p className="text-gray-400 text-xs">{d.mobile}</p>
                        </div>
                      </div>
                    </td>
                    <td className="td">
                      <div className="flex items-center gap-1">
                        <span className="text-yellow-500">★</span>
                        <span className="font-medium">{Number(d.average_rating).toFixed(1)}</span>
                      </div>
                    </td>
                    <td className="td text-center">{d.total_trips.toLocaleString()}</td>
                    <td className="td font-medium">{fmt.naira(d.total_earnings)}</td>
                    <td className="td">
                      <span className={new Date(d.license_expiry) < new Date() ? 'text-red-500' : 'text-gray-700'}>
                        {fmt.date(d.license_expiry)}
                      </span>
                    </td>
                    <td className="td"><span className={badge(d.status)}>{d.status}</span></td>
                    <td className="td">
                      {d.pending_documents > 0 ? (
                        <span className="badge bg-amber-100 text-amber-700">{d.pending_documents} pending</span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="td">
                      <div className="flex items-center gap-1">
                        {d.status === 'pending' && (
                          <>
                            <button
                              onClick={() => approveDoc.mutate({ driverId: d.user_id, action: 'approve' })}
                              className="p-1.5 rounded-lg text-green-600 hover:bg-green-50"
                              title="Approve"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => approveDoc.mutate({ driverId: d.user_id, action: 'reject' })}
                              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"
                              title="Reject"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {d.status === 'active' && (
                          <button
                            onClick={() => updateStatus.mutate({ driverId: d.user_id, status: 'suspended' })}
                            className="text-xs px-2 py-1 rounded bg-orange-50 text-orange-600 hover:bg-orange-100"
                          >
                            Suspend
                          </button>
                        )}
                        {d.status === 'suspended' && (
                          <button
                            onClick={() => updateStatus.mutate({ driverId: d.user_id, status: 'active' })}
                            className="text-xs px-2 py-1 rounded bg-green-50 text-green-600 hover:bg-green-100"
                          >
                            Reinstate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
