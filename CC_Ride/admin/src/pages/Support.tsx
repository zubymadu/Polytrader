import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, MessageSquare, CheckCircle, Loader2 } from 'lucide-react'
import { get, post } from '../lib/api'
import { fmt, badge } from '../lib/utils'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

interface Ticket {
  id: string; subject: string; category: string
  user_name: string; user_email: string
  status: string; priority: string
  created_at: string; updated_at: string; last_message: string
}

const PRIORITY_COLOR: Record<string, string> = {
  high:   'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low:    'bg-gray-100 text-gray-500',
}

export default function Support() {
  const [search, setSearch]     = useState('')
  const [status, setStatus]     = useState('open')
  const [selected, setSelected] = useState<Ticket | null>(null)
  const [reply, setReply]       = useState('')
  const qc = useQueryClient()

  const { data: tickets = [], isLoading } = useQuery<Ticket[]>({
    queryKey: ['admin-support', status],
    queryFn: () => get('/admin/support/tickets', { status: status === 'all' ? undefined : status }),
  })

  const resolve = useMutation({
    mutationFn: (id: string) => post('/admin/support/resolve', { ticket_id: id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-support'] }); setSelected(null) },
  })

  const sendReply = useMutation({
    mutationFn: ({ id, message }: { id: string; message: string }) =>
      post('/admin/support/reply', { ticket_id: id, message }),
    onSuccess: () => { setReply(''); qc.invalidateQueries({ queryKey: ['admin-support'] }) },
  })

  const filtered = tickets.filter((t) =>
    !search || t.subject.toLowerCase().includes(search.toLowerCase()) ||
    t.user_name.toLowerCase().includes(search.toLowerCase()),
  )

  const openCount = tickets.filter((t) => t.status === 'open').length

  return (
    <div className="space-y-6">
      <PageHeader title="Support" sub={openCount > 0 ? `${openCount} open ticket${openCount > 1 ? 's' : ''}` : 'All tickets resolved'} />

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input pl-9" placeholder="Search tickets…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {['open', 'in_progress', 'resolved', 'all'].map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${status === s ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {s === 'all' ? 'All' : s.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        {/* Ticket list */}
        <div className="lg:col-span-2 space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-brand-500 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={MessageSquare} title="No tickets" sub="All quiet here" />
          ) : filtered.map((t) => (
            <div key={t.id} onClick={() => setSelected(t)}
              className={`card p-4 cursor-pointer transition-all hover:shadow-md ${selected?.id === t.id ? 'ring-2 ring-brand-500' : ''}`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="font-medium text-gray-900 text-sm line-clamp-1">{t.subject}</p>
                <span className={`badge flex-shrink-0 ${PRIORITY_COLOR[t.priority] ?? 'bg-gray-100 text-gray-500'}`}>{t.priority}</span>
              </div>
              <p className="text-xs text-gray-500 mb-2 line-clamp-2">{t.last_message}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">{t.user_name}</span>
                <div className="flex items-center gap-2">
                  <span className={badge(t.status)}>{t.status}</span>
                  <span className="text-xs text-gray-400">{fmt.relative(t.updated_at)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Ticket detail */}
        <div className="lg:col-span-3">
          {!selected ? (
            <div className="card h-full flex items-center justify-center py-24">
              <div className="text-center">
                <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400">Select a ticket to view</p>
              </div>
            </div>
          ) : (
            <div className="card overflow-hidden flex flex-col">
              <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{selected.subject}</h3>
                  <p className="text-sm text-gray-400 mt-0.5">{selected.user_name} · {selected.user_email}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`badge ${PRIORITY_COLOR[selected.priority]}`}>{selected.priority}</span>
                  <span className={badge(selected.status)}>{selected.status}</span>
                </div>
              </div>

              <div className="flex-1 p-5">
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs text-gray-400 mb-2">{selected.user_name} · {fmt.datetime(selected.created_at)}</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{selected.last_message}</p>
                </div>
              </div>

              {selected.status !== 'resolved' && selected.status !== 'closed' && (
                <div className="px-5 pb-5 space-y-3">
                  <textarea rows={3} className="input resize-none" placeholder="Write a reply…"
                    value={reply} onChange={(e) => setReply(e.target.value)} />
                  <div className="flex gap-2">
                    <button disabled={!reply.trim() || sendReply.isPending}
                      onClick={() => sendReply.mutate({ id: selected.id, message: reply })}
                      className="btn-primary text-sm flex-1">
                      {sendReply.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Reply'}
                    </button>
                    <button onClick={() => resolve.mutate(selected.id)}
                      className="btn-secondary text-sm text-green-700 border-green-200">
                      <CheckCircle className="w-4 h-4" /> Resolve
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
