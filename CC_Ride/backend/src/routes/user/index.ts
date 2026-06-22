import { Router } from 'express'
import { requireAuth } from '../../middleware/auth'
import {
  searchCompanies, getCompanyDepartments,
  joinCompany, updateCompanyProfile,
  getMyCompanyProfile, leaveCompany,
} from '../../controllers/user/company-enrol.controller'

const router = Router()

router.use(requireAuth)

// Company discovery (search before joining)
router.get('/companies/search',           searchCompanies)
router.get('/companies/:id/departments',  getCompanyDepartments)

// Enrolment
router.post('/companies/join',            joinCompany)
router.post('/companies/leave',           leaveCompany)

// Profile management
router.get('/company-profile',            getMyCompanyProfile)
router.put('/company-profile',            updateCompanyProfile)

export default router
