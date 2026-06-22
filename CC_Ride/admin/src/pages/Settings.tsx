import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Loader2, CheckCircle } from 'lucide-react'
import { get, post } from '../lib/api'
import PageHeader from '../components/PageHeader'

interface PlatformSettings {
  app_name: string; support_email: string; support_phone: string
  default_commission_rate: number; booking_fee: number
  driver_payout_threshold: number; max_cancellation_minutes: number
  surge_multiplier_max: number; maintenance_mode: boolean
  paystack_public_key: string; flutterwave_public_key: string
  google_maps_key_masked: string; firebase_project_id: string
  onesignal_app_id_masked: string
}

type Section = 'general' | 'payments' | 'integrations' | 'notifications'

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'general',       label: 'General' },
  { id: 'payments',      label: 'Payments & Fees' },
  { id: 'integrations',  label: 'Integrations' },
  { id: 'notifications', label: 'Notifications' },
]

const NOTIFICATION_EVENTS = [
  'Booking confirmed', 'Driver assigned', 'Driver arriving',
  'Ride started', 'Ride completed', 'Approval required',
  'Approval decision', 'Payout processed',
]

export default function Settings() {
  const [section, setSection] = useState<Section>('general')
  const [saved, setSaved]     = useState(false)
  const [form, setForm]       = useState<Partial<PlatformSettings>>({})
  const qc = useQueryClient()

  const { data, isLoading } = useQuery<PlatformSettings>({
    queryKey: ['admin-settings'],
    queryFn: () => get('/admin/settings'),
  })

  useEffect(() => { if (data) setForm(data) }, [data])

  const save = useMutation({
    mutationFn: (payload: Partial<PlatformSettings>) => post('/admin/settings', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  const set = (key: keyof PlatformSettings, value: unknown) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  if (isLoading) return (
    <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 text-brand-500 animate-spin" /></div>
  )

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" sub="Platform-wide configuration"
        action={
          <button onClick={() => save.mutate(form)} disabled={save.isPending} className="btn-primary">
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? 'Saved!' : 'Save Changes'}
          </button>
        }
      />

      <div className="grid lg:grid-cols-4 gap-6">
        <nav className="space-y-1">
          {SECTIONS.map((s) => (
            <button key={s.id} onClick={() => setSection(s.id)}
              className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${section === s.id ? 'bg-brand-50 text-brand-600' : 'text-gray-600 hover:bg-gray-100'}`}>
              {s.label}
            </button>
          ))}
        </nav>

        <div className="lg:col-span-3 card p-6">
          {section === 'general' && (
            <Fields title="General Settings">
              <Field label="App Name"><input className="input" value={form.app_name ?? ''} onChange={(e) => set('app_name', e.target.value)} /></Field>
              <Field label="Support Email"><input className="input" type="email" value={form.support_email ?? ''} onChange={(e) => set('support_email', e.target.value)} /></Field>
              <Field label="Support Phone"><input className="input" value={form.support_phone ?? ''} onChange={(e) => set('support_phone', e.target.value)} /></Field>
              <Field label="Cancellation Window" hint="Free-cancel minutes after booking">
                <div className="flex items-center gap-2">
                  <input className="input w-28" type="number" value={form.max_cancellation_minutes ?? 5} onChange={(e) => set('max_cancellation_minutes', parseInt(e.target.value))} />
                  <span className="text-sm text-gray-500">min</span>
                </div>
              </Field>
              <Field label="Maintenance Mode" hint="Pauses all new bookings when enabled">
                <label className="flex items-center gap-3 cursor-pointer" onClick={() => set('maintenance_mode', !form.maintenance_mode)}>
                  <div className={`relative w-11 h-6 rounded-full transition-colors ${form.maintenance_mode ? 'bg-brand-500' : 'bg-gray-200'}`}>
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.maintenance_mode ? 'translate-x-5' : ''}`} />
                  </div>
                  <span className="text-sm text-gray-600">{form.maintenance_mode ? 'On — bookings paused' : 'Off — platform live'}</span>
                </label>
              </Field>
            </Fields>
          )}

          {section === 'payments' && (
            <Fields title="Payments & Fees">
              <Field label="Default Commission" hint="% taken from each ride fare">
                <div className="flex items-center gap-2">
                  <input className="input w-28" type="number" step="0.5" min={0} max={40}
                    value={form.default_commission_rate ?? 15} onChange={(e) => set('default_commission_rate', parseFloat(e.target.value))} />
                  <span className="text-sm text-gray-500">%</span>
                </div>
              </Field>
              <Field label="Booking Fee">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">₦</span>
                  <input className="input w-28" type="number" value={form.booking_fee ?? 100}
                    onChange={(e) => set('booking_fee', parseFloat(e.target.value))} />
                </div>
              </Field>
              <Field label="Driver Payout Threshold" hint="Min balance before payout request">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">₦</span>
                  <input className="input w-28" type="number" value={form.driver_payout_threshold ?? 5000}
                    onChange={(e) => set('driver_payout_threshold', parseFloat(e.target.value))} />
                </div>
              </Field>
              <Field label="Max Surge Multiplier">
                <div className="flex items-center gap-2">
                  <input className="input w-28" type="number" step="0.1" min={1} max={5}
                    value={form.surge_multiplier_max ?? 2.5} onChange={(e) => set('surge_multiplier_max', parseFloat(e.target.value))} />
                  <span className="text-sm text-gray-500">×</span>
                </div>
              </Field>
            </Fields>
          )}

          {section === 'integrations' && (
            <Fields title="Third-Party Integrations">
              <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-2.5 rounded-lg mb-2">
                Secret keys are write-only. Leave blank to keep the current value.
              </div>
              <Field label="Paystack Public Key"><input className="input font-mono text-xs" placeholder="pk_live_…" value={form.paystack_public_key ?? ''} onChange={(e) => set('paystack_public_key', e.target.value)} /></Field>
              <Field label="Flutterwave Public Key"><input className="input font-mono text-xs" placeholder="FLWPUBK_TEST-…" value={form.flutterwave_public_key ?? ''} onChange={(e) => set('flutterwave_public_key', e.target.value)} /></Field>
              <Field label="Google Maps Key" hint={form.google_maps_key_masked ?? 'Not set'}><input className="input font-mono text-xs" placeholder="Leave blank to keep current key" onChange={(e) => set('google_maps_key_masked', e.target.value)} /></Field>
              <Field label="Firebase Project ID"><input className="input" value={form.firebase_project_id ?? ''} onChange={(e) => set('firebase_project_id', e.target.value)} /></Field>
              <Field label="OneSignal App ID" hint={form.onesignal_app_id_masked ?? 'Not set'}><input className="input font-mono text-xs" placeholder="Leave blank to keep current ID" onChange={(e) => set('onesignal_app_id_masked', e.target.value)} /></Field>
            </Fields>
          )}

          {section === 'notifications' && (
            <Fields title="Notification Events">
              <p className="text-sm text-gray-500 -mt-1 mb-2">Control which events trigger push notifications to users and drivers.</p>
              {NOTIFICATION_EVENTS.map((event) => (
                <div key={event} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                  <span className="text-sm text-gray-700">{event}</span>
                  <div className="relative w-9 h-5 rounded-full bg-brand-500 cursor-pointer flex-shrink-0">
                    <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-white rounded-full shadow" />
                  </div>
                </div>
              ))}
            </Fields>
          )}
        </div>
      </div>
    </div>
  )
}

function Fields({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <h2 className="font-semibold text-gray-900 text-base border-b border-gray-100 pb-3">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  )
}
