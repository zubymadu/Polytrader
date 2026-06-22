import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, CheckCircle, XCircle, Building2, Loader2,
  ChevronDown, Users, Car, Percent, AlertTriangle,
  Plus, Layers, MapPin,
} from 'lucide-react'
import { get, post } from '../lib/api'
import { fmt, badge } from '../lib/utils'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Company {
  id: string; name: string; registration_number: string
  contact_name: string; contact_email: string; contact_phone: string
  status: string; total_employees: number; rides_this_month: number
  gmv_this_month: number; commission_rate: number; created_at: string
}
interface Employee { id: string; name: string; email: string; mobile: string; role: string; is_active: boolean; joined_at: string; status: string }
interface CompanyRide { id: string; passenger: string; driver: string; origin: string; destination: string; status: string; total_amount: number; payment_status: string; created_at: string }
interface Department { id: string; name: string; code: string; employee_count: number }
interface CostCentre { id: string; name: string; code: string; description: string; department: string | null; employee_count: number; total_bookings: number }
interface AvailableDriver { id: string; name: string; mobile: string; rating: number }

type DetailTab = 'info' | 'employees' | 'rides' | 'departments' | 'cost-centres'

// ─── Field component ─────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

// ─── Create Company Modal ─────────────────────────────────────────────────────

function CreateCompanyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: '', contact_name: '', contact_email: '', contact_phone: '',
    registration_number: '', industry: '', address: '', city: '', state: 'Lagos',
    commission_rate: '15', notes: '', auto_approve: false,
  })
  const [err, setErr] = useState('')

  const create = useMutation({
    mutationFn: () => post('/admin/companies', {
      ...form,
      commission_rate: form.commission_rate ? parseFloat(form.commission_rate) : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-companies'] })
      onClose()
      setForm({ name: '', contact_name: '', contact_email: '', contact_phone: '', registration_number: '', industry: '', address: '', city: '', state: 'Lagos', commission_rate: '15', notes: '', auto_approve: false })
      setErr('')
    },
    onError: (e: any) => setErr(e?.message ?? 'Failed to create company'),
  })

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }))

  return (
    <Modal open={open} onClose={onClose} title="Create New Company" size="lg">
      <div className="space-y-4">
        {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{err}</div>}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Company Name *">
            <input className="input" placeholder="Acme Nigeria Ltd" value={form.name} onChange={f('name')} />
          </Field>
          <Field label="Industry">
            <input className="input" placeholder="e.g. Oil & Gas, Banking" value={form.industry} onChange={f('industry')} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Contact Person *">
            <input className="input" placeholder="Full name" value={form.contact_name} onChange={f('contact_name')} />
          </Field>
          <Field label="Contact Email *">
            <input className="input" type="email" placeholder="hr@company.com" value={form.contact_email} onChange={f('contact_email')} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Contact Phone">
            <input className="input" placeholder="+234 800 000 0000" value={form.contact_phone} onChange={f('contact_phone')} />
          </Field>
          <Field label="Reg. Number (CAC)">
            <input className="input" placeholder="RC-123456" value={form.registration_number} onChange={f('registration_number')} />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Field label="Address">
            <input className="input" placeholder="Street address" value={form.address} onChange={f('address')} />
          </Field>
          <Field label="City">
            <input className="input" placeholder="Lagos" value={form.city} onChange={f('city')} />
          </Field>
          <Field label="State">
            <select className="input" value={form.state} onChange={f('state')}>
              {['Lagos','Abuja','Rivers','Kano','Oyo','Delta','Ogun','Anambra','Enugu','Kaduna'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Commission Rate (%)">
            <input className="input" type="number" min={0} max={50} step={0.5} value={form.commission_rate} onChange={f('commission_rate')} />
          </Field>
          <Field label="Notes (internal)">
            <input className="input" placeholder="Optional internal note" value={form.notes} onChange={f('notes')} />
          </Field>
        </div>

        <label className="flex items-center gap-3 p-3 bg-brand-50 rounded-xl cursor-pointer">
          <input type="checkbox" checked={form.auto_approve} onChange={(e) => setForm((p) => ({ ...p, auto_approve: e.target.checked }))}
            className="w-4 h-4 accent-brand-500" />
          <div>
            <p className="text-sm font-medium text-gray-800">Activate immediately</p>
            <p className="text-xs text-gray-500">Skip pending review — company can book rides right away</p>
          </div>
        </label>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={() => create.mutate()} disabled={create.isPending || !form.name || !form.contact_email || !form.contact_name}
            className="btn-primary flex-1">
            {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create Company
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Add Ride Modal ───────────────────────────────────────────────────────────

function AddRideModal({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    driver_id: '', origin_address: '', origin_lat: '', origin_lng: '',
    destination_address: '', destination_lat: '', destination_lng: '',
    scheduled_at: '', base_fare: '', available_seats: '4', trip_notes: '',
  })
  const [err, setErr] = useState('')

  const { data: drivers = [] } = useQuery<AvailableDriver[]>({
    queryKey: ['available-drivers'],
    queryFn:  () => get('/admin/drivers/available'),
  })

  const create = useMutation({
    mutationFn: () => post(`/admin/companies/${companyId}/rides`, {
      driver_id:           form.driver_id,
      origin_address:      form.origin_address,
      origin_lat:          parseFloat(form.origin_lat) || 6.5244,
      origin_lng:          parseFloat(form.origin_lng) || 3.3792,
      destination_address: form.destination_address,
      destination_lat:     parseFloat(form.destination_lat) || 6.6018,
      destination_lng:     parseFloat(form.destination_lng) || 3.3515,
      scheduled_at:        form.scheduled_at,
      base_fare:           parseFloat(form.base_fare),
      available_seats:     parseInt(form.available_seats),
      trip_notes:          form.trip_notes || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company-rides', companyId] })
      onClose()
    },
    onError: (e: any) => setErr(e?.message ?? 'Failed to create ride'),
  })

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }))

  const canSubmit = form.driver_id && form.origin_address && form.destination_address && form.scheduled_at && form.base_fare

  return (
    <Modal open={true} onClose={onClose} title="Add Company Ride" size="lg">
      <div className="space-y-4">
        {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{err}</div>}

        <Field label="Assign Driver *">
          <select className="input" value={form.driver_id} onChange={f('driver_id')}>
            <option value="">— Select driver —</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>{d.name} · {d.mobile} · ⭐ {d.rating.toFixed(1)}</option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Pick-up Address *">
            <input className="input" placeholder="e.g. Victoria Island, Lagos" value={form.origin_address} onChange={f('origin_address')} />
          </Field>
          <Field label="Drop-off Address *">
            <input className="input" placeholder="e.g. Lekki Phase 1, Lagos" value={form.destination_address} onChange={f('destination_address')} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Origin Lat, Lng (optional)">
            <div className="flex gap-2">
              <input className="input" placeholder="6.4281" value={form.origin_lat} onChange={f('origin_lat')} />
              <input className="input" placeholder="3.4219" value={form.origin_lng} onChange={f('origin_lng')} />
            </div>
          </Field>
          <Field label="Destination Lat, Lng (optional)">
            <div className="flex gap-2">
              <input className="input" placeholder="6.4547" value={form.destination_lat} onChange={f('destination_lat')} />
              <input className="input" placeholder="3.5320" value={form.destination_lng} onChange={f('destination_lng')} />
            </div>
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Field label="Scheduled Date & Time *">
            <input className="input" type="datetime-local" value={form.scheduled_at} onChange={f('scheduled_at')} />
          </Field>
          <Field label="Base Fare (₦) *">
            <input className="input" type="number" placeholder="2500" value={form.base_fare} onChange={f('base_fare')} />
          </Field>
          <Field label="Available Seats">
            <select className="input" value={form.available_seats} onChange={f('available_seats')}>
              {[1,2,3,4,5,6,7,8].map((n) => <option key={n}>{n}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Trip Notes (optional)">
          <input className="input" placeholder="e.g. Airport pickup — check flight status" value={form.trip_notes} onChange={f('trip_notes')} />
        </Field>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={() => create.mutate()} disabled={create.isPending || !canSubmit} className="btn-primary flex-1">
            {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
            Create Ride
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Departments & Cost Centres tab ──────────────────────────────────────────

function DepartmentsTab({ companyId }: { companyId: string }) {
  const qc = useQueryClient()
  const [newDept, setNewDept] = useState({ name: '', code: '' })
  const [err, setErr] = useState('')

  const { data: depts = [], isLoading } = useQuery<Department[]>({
    queryKey: ['company-depts', companyId],
    queryFn:  () => get(`/admin/companies/${companyId}/departments`),
  })

  const create = useMutation({
    mutationFn: () => post(`/admin/companies/${companyId}/departments`, newDept),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['company-depts', companyId] }); setNewDept({ name: '', code: '' }); setErr('') },
    onError:    (e: any) => setErr(e?.message ?? 'Failed'),
  })

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>

  return (
    <div className="space-y-4">
      {err && <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">{err}</div>}

      {/* Add department */}
      <div className="flex gap-2 items-end bg-white border border-brand-100 rounded-xl p-3">
        <div className="flex-1">
          <label className="text-xs text-gray-500 mb-1 block">Department name</label>
          <input className="input" placeholder="e.g. Engineering" value={newDept.name}
            onChange={(e) => setNewDept((p) => ({ ...p, name: e.target.value }))} />
        </div>
        <div className="w-28">
          <label className="text-xs text-gray-500 mb-1 block">Code (optional)</label>
          <input className="input" placeholder="ENG" value={newDept.code}
            onChange={(e) => setNewDept((p) => ({ ...p, code: e.target.value }))} />
        </div>
        <button onClick={() => create.mutate()} disabled={create.isPending || !newDept.name} className="btn-primary text-sm h-10">
          {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add
        </button>
      </div>

      {/* List */}
      {depts.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">No departments yet — add one above</p>
      ) : (
        <div className="space-y-2">
          {depts.map((d) => (
            <div key={d.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                {d.code ? d.code.slice(0, 3) : d.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{d.name}</p>
                {d.code && <p className="text-xs text-gray-400">Code: {d.code}</p>}
              </div>
              <span className="text-xs text-gray-400">{d.employee_count} employee{d.employee_count !== 1 ? 's' : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CostCentresTab({ companyId }: { companyId: string }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: '', code: '', description: '', department_id: '' })
  const [err, setErr] = useState('')

  const { data: ccs = [], isLoading } = useQuery<CostCentre[]>({
    queryKey: ['company-ccs', companyId],
    queryFn:  () => get(`/admin/companies/${companyId}/cost-centres`),
  })
  const { data: depts = [] } = useQuery<Department[]>({
    queryKey: ['company-depts', companyId],
    queryFn:  () => get(`/admin/companies/${companyId}/departments`),
  })

  const create = useMutation({
    mutationFn: () => post(`/admin/companies/${companyId}/cost-centres`, {
      name: form.name, code: form.code, description: form.description || undefined,
      department_id: form.department_id || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['company-ccs', companyId] }); setForm({ name: '', code: '', description: '', department_id: '' }); setErr('') },
    onError:   (e: any) => setErr(e?.message ?? 'Failed'),
  })

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>

  return (
    <div className="space-y-4">
      {err && <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">{err}</div>}

      {/* Add cost centre */}
      <div className="grid grid-cols-2 gap-3 bg-white border border-brand-100 rounded-xl p-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Cost centre name *</label>
          <input className="input" placeholder="e.g. Engineering Travel" value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Code * (unique per company)</label>
          <input className="input" placeholder="ENG-TRV" value={form.code}
            onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))} />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Link to department</label>
          <select className="input" value={form.department_id} onChange={(e) => setForm((p) => ({ ...p, department_id: e.target.value }))}>
            <option value="">— None —</option>
            {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Description</label>
          <input className="input" placeholder="Optional description" value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
        </div>
        <div className="col-span-2 flex justify-end">
          <button onClick={() => create.mutate()} disabled={create.isPending || !form.name || !form.code} className="btn-primary text-sm">
            {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add Cost Centre
          </button>
        </div>
      </div>

      {/* List */}
      {ccs.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">No cost centres yet — add one above</p>
      ) : (
        <div className="space-y-2">
          {ccs.map((c) => (
            <div key={c.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3">
              <div className="w-8 h-8 rounded-lg bg-green-50 text-green-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0 tracking-tight">
                {c.code.slice(0, 4)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{c.name}</p>
                <p className="text-xs text-gray-400">
                  {c.code}
                  {c.department && ` · ${c.department}`}
                  {c.description && ` · ${c.description}`}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-gray-500">{c.employee_count} staff</p>
                <p className="text-xs text-gray-400">{c.total_bookings} rides</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Sub-panel: Employees ────────────────────────────────────────────────────

function EmployeeList({ companyId }: { companyId: string }) {
  const { data = [], isLoading } = useQuery<Employee[]>({
    queryKey: ['company-employees', companyId],
    queryFn:  () => get(`/admin/companies/${companyId}/employees`),
  })
  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>
  if (!data.length) return <p className="text-sm text-gray-400 py-4 text-center">No employees yet</p>

  const roleColor: Record<string, string> = {
    company_admin: 'bg-purple-100 text-purple-700', manager: 'bg-blue-100 text-blue-700',
    company_finance: 'bg-green-100 text-green-700', company_hr: 'bg-pink-100 text-pink-700',
    employee: 'bg-gray-100 text-gray-600',
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left border-b border-gray-100">
          {['Name','Email','Role','Joined','Status'].map((h) => <th key={h} className="pb-2 font-medium text-gray-500 text-xs">{h}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-gray-50">
          {data.map((e) => (
            <tr key={e.id}>
              <td className="py-2 font-medium text-gray-900">{e.name}</td>
              <td className="py-2 text-gray-500 text-xs">{e.email}</td>
              <td className="py-2"><span className={`badge text-xs ${roleColor[e.role] ?? 'bg-gray-100 text-gray-600'}`}>{e.role.replace('_', ' ')}</span></td>
              <td className="py-2 text-gray-400 text-xs">{fmt.date(e.joined_at)}</td>
              <td className="py-2"><span className={badge(e.is_active ? 'active' : 'inactive')}>{e.is_active ? 'Active' : 'Inactive'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Sub-panel: Company rides ────────────────────────────────────────────────

function CompanyRides({ companyId }: { companyId: string }) {
  const [status, setStatus] = useState('all')
  const [addRide, setAddRide] = useState(false)
  const qc = useQueryClient()

  const { data = [], isLoading } = useQuery<CompanyRide[]>({
    queryKey: ['company-rides', companyId, status],
    queryFn:  () => get(`/admin/companies/${companyId}/rides`, { status: status === 'all' ? undefined : status }),
  })
  const cancel = useMutation({
    mutationFn: (id: string) => post('/admin/rides/cancel', { booking_id: id, reason: 'Cancelled by admin' }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['company-rides', companyId] }),
  })

  return (
    <div className="space-y-3">
      {addRide && <AddRideModal companyId={companyId} onClose={() => setAddRide(false)} />}

      <div className="flex flex-wrap gap-2 justify-between">
        <div className="flex gap-2 flex-wrap">
          {['all','confirmed','completed','cancelled','in_progress'].map((s) => (
            <button key={s} onClick={() => setStatus(s)}
              className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${status === s ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
              {s === 'all' ? 'All' : s.replace('_', ' ')}
            </button>
          ))}
        </div>
        <button onClick={() => setAddRide(true)} className="btn-primary text-xs">
          <Plus className="w-3 h-3" /> Add Ride
        </button>
      </div>

      {isLoading ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div> :
        !data.length ? <p className="text-sm text-gray-400 py-4 text-center">No rides found</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left border-b border-gray-100">
                {['Passenger','Driver','Route','Amount','Status','Date',''].map((h) => <th key={h} className="pb-2 font-medium text-gray-500 text-xs">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {data.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 font-medium text-gray-900">{r.passenger}</td>
                    <td className="py-2 text-gray-500 text-xs">{r.driver}</td>
                    <td className="py-2 text-gray-500 text-xs">
                      {r.origin.split(',')[0]} <span className="text-gray-300">→</span> {r.destination.split(',')[0]}
                    </td>
                    <td className="py-2 font-medium">{fmt.naira(r.total_amount)}</td>
                    <td className="py-2"><span className={badge(r.status)}>{r.status}</span></td>
                    <td className="py-2 text-gray-400 text-xs">{fmt.date(r.created_at)}</td>
                    <td className="py-2">
                      {['confirmed','pending','in_progress'].includes(r.status) && (
                        <button onClick={() => { if (confirm('Cancel this ride?')) cancel.mutate(r.id) }}
                          className="text-xs text-red-500 hover:text-red-700 font-medium">Cancel</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Companies() {
  const [search, setSearch]         = useState('')
  const [tab, setTab]               = useState<'all'|'pending_approval'|'active'|'suspended'|'rejected'>('all')
  const [expanded, setExpanded]     = useState<string | null>(null)
  const [detailTab, setDetailTab]   = useState<DetailTab>('info')
  const [commission, setCommission] = useState<Record<string, string>>({})
  const [showCreate, setShowCreate] = useState(false)
  const qc = useQueryClient()

  const { data = [], isLoading } = useQuery<Company[]>({
    queryKey: ['admin-companies', tab],
    queryFn:  () => get('/admin/companies', { status: tab === 'all' ? undefined : tab }),
  })

  const action = useMutation({
    mutationFn: ({ id, act }: { id: string; act: string }) =>
      post('/admin/companies/action', { company_id: id, action: act }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-companies'] }),
  })

  const saveCommission = useMutation({
    mutationFn: ({ id, rate }: { id: string; rate: number }) =>
      post('/admin/companies/commission', { company_id: id, commission_rate: rate }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-companies'] }),
  })

  const filtered = data.filter((c) =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.contact_email.toLowerCase().includes(search.toLowerCase()) ||
    c.contact_name.toLowerCase().includes(search.toLowerCase()),
  )

  const pending = data.filter((c) => c.status === 'pending_approval').length

  const DETAIL_TABS: { id: DetailTab; icon: any; label: (c: Company) => string }[] = [
    { id: 'info',         icon: Building2, label: () => 'Info & Actions' },
    { id: 'employees',    icon: Users,     label: (c) => `Employees (${c.total_employees})` },
    { id: 'rides',        icon: Car,       label: (c) => `Rides (${c.rides_this_month}/mo)` },
    { id: 'departments',  icon: Layers,    label: () => 'Departments' },
    { id: 'cost-centres', icon: Percent,   label: () => 'Cost Centres' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Companies"
        sub={`${data.length} corporate clients${pending > 0 ? ` · ${pending} awaiting approval` : ''}`}
        action={
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">
            <Plus className="w-4 h-4" /> New Company
          </button>
        }
      />

      <CreateCompanyModal open={showCreate} onClose={() => setShowCreate(false)} />

      {pending > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span><strong>{pending}</strong> compan{pending > 1 ? 'ies' : 'y'} pending onboarding review</span>
          <button onClick={() => setTab('pending_approval')} className="ml-auto text-amber-700 underline font-medium">Review now</button>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input pl-9" placeholder="Search by name, email or contact…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {(['all','pending_approval','active','suspended','rejected'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${tab === t ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {t === 'pending_approval' ? 'Pending' : t[0].toUpperCase() + t.slice(1)}
            {t === 'pending_approval' && pending > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] font-bold">{pending}</span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 text-brand-500 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Building2} title="No companies found" sub="Create your first company using the button above" />
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => {
            const isOpen   = expanded === c.id
            const commVal  = commission[c.id] ?? String(c.commission_rate)

            return (
              <div key={c.id} className="card overflow-hidden">
                <div className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors select-none"
                  onClick={() => { setExpanded(isOpen ? null : c.id); setDetailTab('info') }}>
                  <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold text-lg flex-shrink-0">
                    {c.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{c.name}</p>
                    <p className="text-xs text-gray-400">{c.contact_email}</p>
                  </div>
                  <div className="hidden sm:flex items-center gap-6 text-center mr-2">
                    <div><p className="font-semibold text-sm text-gray-900">{c.total_employees}</p><p className="text-xs text-gray-400">Staff</p></div>
                    <div><p className="font-semibold text-sm text-gray-900">{c.rides_this_month}</p><p className="text-xs text-gray-400">Rides/mo</p></div>
                    <div><p className="font-semibold text-sm text-gray-900">{fmt.naira(c.gmv_this_month)}</p><p className="text-xs text-gray-400">GMV/mo</p></div>
                  </div>
                  <span className={badge(c.status)}>{c.status.replace('_', ' ')}</span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
                </div>

                {isOpen && (
                  <div className="border-t border-gray-100">
                    <div className="flex gap-0 px-5 pt-3 border-b border-gray-100 overflow-x-auto">
                      {DETAIL_TABS.map(({ id, icon: Icon, label }) => (
                        <button key={id} onClick={() => setDetailTab(id)}
                          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${detailTab === id ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                          <Icon className="w-3.5 h-3.5" /> {label(c)}
                        </button>
                      ))}
                    </div>

                    <div className="px-5 py-4 bg-gray-50">
                      {detailTab === 'info' && (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div><p className="text-gray-400 text-xs mb-0.5">Reg. Number</p><p className="font-medium">{c.registration_number || '—'}</p></div>
                            <div><p className="text-gray-400 text-xs mb-0.5">Contact Person</p><p className="font-medium">{c.contact_name}</p></div>
                            <div><p className="text-gray-400 text-xs mb-0.5">Phone</p><p className="font-medium">{c.contact_phone || '—'}</p></div>
                            <div><p className="text-gray-400 text-xs mb-0.5">Onboarded</p><p className="font-medium">{fmt.date(c.created_at)}</p></div>
                          </div>
                          <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-3">
                            <Percent className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <label className="text-sm text-gray-600 font-medium">Commission rate</label>
                            <input type="number" value={commVal} min={0} max={40} step={0.5}
                              className="input w-20 text-center ml-auto"
                              onChange={(e) => setCommission((p) => ({ ...p, [c.id]: e.target.value }))}
                              onBlur={() => { const v = parseFloat(commVal); if (!isNaN(v) && v !== c.commission_rate) saveCommission.mutate({ id: c.id, rate: v }) }}
                            />
                            <span className="text-sm text-gray-400">% per ride</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {c.status === 'pending_approval' && (
                              <>
                                <button onClick={() => action.mutate({ id: c.id, act: 'approve' })} disabled={action.isPending} className="btn-primary text-sm"><CheckCircle className="w-4 h-4" /> Approve</button>
                                <button onClick={() => { if (confirm(`Reject ${c.name}?`)) action.mutate({ id: c.id, act: 'reject' }) }} disabled={action.isPending} className="btn-danger text-sm"><XCircle className="w-4 h-4" /> Reject</button>
                              </>
                            )}
                            {c.status === 'active' && (
                              <button onClick={() => { if (confirm(`Suspend ${c.name}?`)) action.mutate({ id: c.id, act: 'suspend' }) }} disabled={action.isPending}
                                className="btn text-sm bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100">Suspend</button>
                            )}
                            {(c.status === 'suspended' || c.status === 'rejected') && (
                              <button onClick={() => action.mutate({ id: c.id, act: 'activate' })} disabled={action.isPending} className="btn-primary text-sm"><CheckCircle className="w-4 h-4" /> Reinstate</button>
                            )}
                          </div>
                        </div>
                      )}
                      {detailTab === 'employees'    && <EmployeeList companyId={c.id} />}
                      {detailTab === 'rides'        && <CompanyRides companyId={c.id} />}
                      {detailTab === 'departments'  && <DepartmentsTab companyId={c.id} />}
                      {detailTab === 'cost-centres' && <CostCentresTab companyId={c.id} />}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
