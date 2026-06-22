import { Router } from 'express'
import corporateRouter from './corporate'
import adminRouter from './admin'
import paymentRouter from './payment'
import userRouter from './user'

const router = Router()

// Health check
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() })
})

// Admin panel
router.use('/admin', adminRouter)

// Corporate module
router.use('/corporate', corporateRouter)

// Payment (Paystack + Flutterwave)
router.use('/payment', paymentRouter)

// User self-service (company enrolment, cost-centre management)
router.use('/user', userRouter)

export default router
