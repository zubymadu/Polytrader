import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, UserX, ShieldAlert, Loader2, Users as UsersIcon } from 'lucide-react'
import { get, post } from '../lib/api'
import { fmt, badge } from '../lib/utils'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

interface User {
  id: string; name: string; email: string; mobile: string
  wallet_balance: number; is_driver: boolean; status: string
  created_at: string; total_bookings: number
}

type Action = 'suspend' | 'ban' | 'activate'

export default function Users() {
  const [search, setSearch]         = useState('')
  const [statusFilter, setStatus]   = useState('all')
  const qc = useQueryClient()

  const { data = [], isLoading } = useQuery<User[]>({
    queryKey: ['admin-users', search, statusFilter],
    queryFn: () => get('/admin/users', { search, status: statusFilter === 'all' ? undefined : statusFilter }),
  })

  const mutate = useMutation({
    mutationFn: ({ userId, action }: { userId: string; action: Action }) =>
      post('/admin/users/action', { user_id: userId, action }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  const filtered = data.filter((u) =>
    !search || u.name.toLowerCase().includes(search.toLowerCase()) ||
    (u.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
    u.mobile.includes(search),
  )

  return (
    <div className="space-y-6">
      <PageHeader title="Users" sub={`${data.length.toLocaleString()} registered users`} />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Search name, email or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {['all', 'active', 'suspended', 'banned', 'pending_verification'].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
              statusFilter === s
                ? 'bg-brand-500 text-white border-brand-500'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {s === 'all' ? 'All' : s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 text-brand-500 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={UsersIcon} title="No users found" sub="Try adjusting the search or filter" />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {['User', 'Contact', 'Wallet', 'Bookings', 'Role', 'Status', 'Joined', 'Actions'].map((h) => (
                    <th key={h} className="th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="td">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {u.name[0]?.toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-900">{u.name}</span>
                      </div>
                    </td>
                    <td className="td">
                      <p className="text-gray-700">{u.email}</p>
                      <p className="text-gray-400 text-xs">{u.mobile}</p>
                    </td>
                    <td className="td font-medium">{fmt.naira(u.wallet_balance)}</td>
                    <td className="td text-center">{u.total_bookings}</td>
                    <td className="td">
                      <span className={badge(u.is_driver ? 'active' : 'inactive')}>
                        {u.is_driver ? 'Driver' : 'Passenger'}
                      </span>
                    </td>
                    <td className="td"><span className={badge(u.status)}>{u.status}</span></td>
                    <td className="td text-gray-400">{fmt.date(u.created_at)}</td>
                    <td className="td">
                      <div className="flex items-center gap-1">
                        {u.status !== 'suspended' && u.status !== 'banned' && (
                          <button
                            onClick={() => mutate.mutate({ userId: u.id, action: 'suspend' })}
                            className="p-1.5 rounded-lg text-orange-500 hover:bg-orange-50 transition-colors"
                            title="Suspend"
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        )}
                        {u.status !== 'banned' && (
                          <button
                            onClick={() => mutate.mutate({ userId: u.id, action: 'ban' })}
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                            title="Ban"
                          >
                            <ShieldAlert className="w-4 h-4" />
                          </button>
                        )}
                        {(u.status === 'suspended' || u.status === 'banned') && (
                          <button
                            onClick={() => mutate.mutate({ userId: u.id, action: 'activate' })}
                            className="text-xs px-2 py-1 rounded bg-green-50 text-green-600 hover:bg-green-100"
                          >
                            Activate
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
