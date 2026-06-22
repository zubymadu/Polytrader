import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Users from './pages/Users'
import Drivers from './pages/Drivers'
import Companies from './pages/Companies'
import Rides from './pages/Rides'
import LiveTracking from './pages/LiveTracking'
import Approvals from './pages/Approvals'
import Analytics from './pages/Analytics'
import Billing from './pages/Billing'
import Payments from './pages/Payments'
import Support from './pages/Support'
import Settings from './pages/Settings'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"  element={<Dashboard />} />
          <Route path="users"      element={<Users />} />
          <Route path="drivers"    element={<Drivers />} />
          <Route path="companies"  element={<Companies />} />
          <Route path="rides"      element={<Rides />} />
          <Route path="tracking"   element={<LiveTracking />} />
          <Route path="approvals"  element={<Approvals />} />
          <Route path="analytics"  element={<Analytics />} />
          <Route path="billing"    element={<Billing />} />
          <Route path="payments"   element={<Payments />} />
          <Route path="support"    element={<Support />} />
          <Route path="settings"   element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
