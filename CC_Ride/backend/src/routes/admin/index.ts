import { Router } from 'express'
import { requireAdmin } from '../../middleware/adminAuth'
import { adminLogin }                               from '../../controllers/admin/auth.controller'
import { getOverview }                              from '../../controllers/admin/overview.controller'
import { listUsers, userAction }                    from '../../controllers/admin/users.controller'
import { listDrivers, approveDriver, updateDriverStatus, listRides, listLiveRides,
         createDriver, createRide, livePositions }  from '../../controllers/admin/drivers.controller'
import { listCompanies, companyAction, updateCommission, listCompanyEmployees, listCompanyRides, cancelRide }
                                                    from '../../controllers/admin/companies.controller'
import { getPaymentSummary, listTransactions, listPayouts }
                                                    from '../../controllers/admin/payments.controller'
import { processPayout }                            from '../../controllers/payment/payment.controller'
import {
  createCompany, createDepartment, listDepartments,
  createCostCentre, listCostCentres, createCompanyRide,
  listAvailableDrivers,
} from '../../controllers/admin/company-manage.controller'
import { listPendingApprovals, decideApproval }      from '../../controllers/admin/companies.controller'
import { getAnalytics, getCompanyAnalytics }         from '../../controllers/admin/analytics.controller'
import { listInvoices, getInvoiceDetail }            from '../../controllers/admin/billing.controller'
import { listTickets, replyToTicket, resolveTicket } from '../../controllers/admin/support.controller'
import { getSettings, updateSettings }              from '../../controllers/admin/settings.controller'

const router = Router()

// ── Public ────────────────────────────────────────────────────────────────────
router.post('/auth/login', adminLogin)

// ── All routes below require super-admin JWT ──────────────────────────────────
router.use(requireAdmin)

// Dashboard
router.get('/overview', getOverview)

// Users
router.get('/users',        listUsers)
router.post('/users/action', userAction)

// Drivers & Rides
router.get('/drivers',          listDrivers)
router.post('/drivers/create',  createDriver)          // NEW — register driver
router.post('/drivers/approve', approveDriver)
router.post('/drivers/status',  updateDriverStatus)
router.get('/rides',                listRides)
router.get('/rides/live',           listLiveRides)
router.get('/rides/live-positions', livePositions)     // NEW — real-time map snapshot
router.post('/rides/create',        createRide)        // NEW — create standalone ride

// Companies
router.get('/companies',                        listCompanies)
router.post('/companies',                       createCompany)          // NEW — create company
router.post('/companies/action',                companyAction)
router.post('/companies/commission',            updateCommission)
router.get('/companies/:id/employees',          listCompanyEmployees)
router.get('/companies/:id/rides',              listCompanyRides)
router.post('/companies/:id/rides',             createCompanyRide)      // NEW — add ride
router.get('/companies/:id/departments',        listDepartments)        // NEW
router.post('/companies/:id/departments',       createDepartment)       // NEW
router.get('/companies/:id/cost-centres',       listCostCentres)        // NEW
router.post('/companies/:id/cost-centres',      createCostCentre)       // NEW

// Rides (cancel)
router.post('/rides/cancel',                    cancelRide)

// Available drivers (for ride creation dropdown)
router.get('/drivers/available',                listAvailableDrivers)

// Payments
router.get('/payments/summary',        getPaymentSummary)
router.get('/payments/transactions',   listTransactions)
router.get('/payments/payouts',        listPayouts)
router.post('/payments/process-payout', processPayout)

// Approval queue
router.get('/bookings/approvals',   listPendingApprovals)
router.post('/bookings/approve',    decideApproval)

// Analytics
router.get('/analytics',                    getAnalytics)
router.get('/analytics/company/:id',        getCompanyAnalytics)

// Billing / Invoices
router.get('/billing/invoices',             listInvoices)
router.get('/billing/invoices/:companyId/:month', getInvoiceDetail)

// Support
router.get('/support/tickets',    listTickets)
router.post('/support/reply',     replyToTicket)
router.post('/support/resolve',   resolveTicket)

// Settings
router.get('/settings',  getSettings)
router.post('/settings', updateSettings)

export default router
