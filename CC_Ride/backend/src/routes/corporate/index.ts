import { Router } from 'express'
import { requireAuth } from '../../middleware/auth'
import { requireCompanyMember, requireAdminRole, requireApproverRole } from '../../middleware/corporate'

import { getDashboard }                         from '../../controllers/corporate/dashboard.controller'
import { getEmployeeProfile, listEmployees, listDepartments, inviteEmployee, deactivateEmployee }
                                                from '../../controllers/corporate/employees.controller'
import { listBudgets, createBudget }            from '../../controllers/corporate/budgets.controller'
import { listApprovals, decideApproval }        from '../../controllers/corporate/approvals.controller'
import { listPolicies, createPolicy, togglePolicy }
                                                from '../../controllers/corporate/policies.controller'
import { checkPolicy, createCorporateBooking, cancelApproval }
                                                from '../../controllers/corporate/bookings.controller'

const router = Router()

// All corporate routes require a valid JWT
router.use(requireAuth)

// ─── Employee profile (no admin role required — any employee) ─────────────────
router.get('/employee/profile', requireCompanyMember, getEmployeeProfile)

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get('/dashboard', requireCompanyMember, requireAdminRole, getDashboard)

// ─── Employees ────────────────────────────────────────────────────────────────
router.get('/employees',              requireCompanyMember, requireAdminRole, listEmployees)
router.get('/departments',            requireCompanyMember, listDepartments)
router.post('/employees/invite',      requireCompanyMember, requireAdminRole, inviteEmployee)
router.post('/employees/deactivate',  requireCompanyMember, requireAdminRole, deactivateEmployee)

// ─── Budgets ──────────────────────────────────────────────────────────────────
router.get('/budgets',        requireCompanyMember, requireAdminRole, listBudgets)
router.post('/budgets/create', requireCompanyMember, requireAdminRole, createBudget)

// ─── Approvals ────────────────────────────────────────────────────────────────
router.get('/approvals',          requireCompanyMember, requireApproverRole, listApprovals)
router.post('/approvals/decide',  requireCompanyMember, requireApproverRole, decideApproval)

// ─── Ride Policies ────────────────────────────────────────────────────────────
router.get('/policies',          requireCompanyMember, requireAdminRole, listPolicies)
router.post('/policies/create',  requireCompanyMember, requireAdminRole, createPolicy)
router.post('/policies/toggle',  requireCompanyMember, requireAdminRole, togglePolicy)

// ─── Booking flow (any employee) ──────────────────────────────────────────────
router.post('/bookings/check-policy',    requireCompanyMember, checkPolicy)
router.post('/bookings/book',            requireCompanyMember, createCorporateBooking)
router.post('/bookings/cancel-approval', requireCompanyMember, cancelApproval)

export default router
