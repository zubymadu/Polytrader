import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Car, Building2, MapPin, Radio,
  CreditCard, LifeBuoy, Settings, LogOut, Menu, X,
  Bell, CheckSquare, BarChart2, FileText,
} from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '../store/auth'
import { cn } from '../lib/utils'

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/users',     icon: Users,           label: 'Users' },
  { to: '/drivers',   icon: Car,             label: 'Drivers' },
  { to: '/companies', icon: Building2,       label: 'Companies' },
  { to: '/rides',     icon: MapPin,          label: 'Rides' },
  { to: '/tracking',  icon: Radio,           label: 'Live Tracking' },
  { to: '/approvals', icon: CheckSquare,     label: 'Approvals' },
  { to: '/analytics', icon: BarChart2,       label: 'Analytics' },
  { to: '/billing',   icon: FileText,        label: 'Billing' },
  { to: '/payments',  icon: CreditCard,      label: 'Payments' },
  { to: '/support',   icon: LifeBuoy,        label: 'Support' },
  { to: '/settings',  icon: Settings,        label: 'Settings' },
]

export default function Layout() {
  const [open, setOpen] = useState(false)
  const { admin, logout } = useAuthStore()
  const navigate = useNavigate()

  function handleLogout() { logout(); navigate('/login') }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#F6F9FE' }}>

      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 flex flex-col w-64 transition-transform duration-200 lg:static lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full',
      )} style={{ background: '#0A1628' }}>

        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10">
          <div className="w-9 h-9 rounded-lg bg-brand-500 flex items-center justify-center shadow-card">
            <Car className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-none tracking-tight">CC Ride</p>
            <p className="text-white/40 text-xs mt-0.5 font-medium">Admin Portal</p>
          </div>
          <button onClick={() => setOpen(false)} className="ml-auto lg:hidden text-white/40 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} onClick={() => setOpen(false)}
              className={({ isActive }) => cn(
                'flex items-center gap-3 px-3.5 py-2.5 rounded-md text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-brand-500 text-white shadow-card'
                  : 'text-white/50 hover:bg-white/8 hover:text-white',
              )}>
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Admin profile */}
        <div className="px-4 py-4 border-t border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {admin?.username?.[0]?.toUpperCase() ?? 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold truncate">{admin?.username}</p>
              <p className="text-white/40 text-xs truncate">{admin?.email}</p>
            </div>
            <button onClick={handleLogout}
              className="text-white/40 hover:text-red-400 transition-colors p-1 rounded" title="Logout">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* ── Main area ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <header className="flex items-center gap-4 px-6 py-3.5 bg-white border-b border-surface-border shadow-sm">
          <button onClick={() => setOpen(true)} className="lg:hidden text-ink-subtle hover:text-ink">
            <Menu className="w-5 h-5" />
          </button>

          {/* Search */}
          <div className="hidden md:flex flex-1 max-w-xs">
            <input
              className="input h-9 text-xs"
              placeholder="Search platform data, rides or users…"
            />
          </div>

          <div className="flex-1" />

          <button className="relative p-2 rounded-md text-ink-subtle hover:bg-surface-low transition-colors">
            <Bell className="w-4.5 h-4.5" style={{ width: '18px', height: '18px' }} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
          </button>

          <div className="flex items-center gap-2 pl-2 border-l border-surface-border">
            <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-bold">
              {admin?.username?.[0]?.toUpperCase() ?? 'A'}
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-ink leading-none">{admin?.username}</p>
              <p className="text-xs text-ink-subtle mt-0.5">Global Admin</p>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
