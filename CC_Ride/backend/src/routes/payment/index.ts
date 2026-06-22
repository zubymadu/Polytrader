/**
 * Payment routes — CC Ride
 *
 * Webhook routes use raw body parsing (registered before express.json()).
 * All other routes require auth middleware.
 */
import { Router, Request, Response, NextFunction } from 'express'
import express from 'express'
import { requireAuth } from '../../middleware/auth'
import { initiatePayment, verifyPayment, listBanks, resolveAccount, saveBankAccount, requestPayout } from '../../controllers/payment/payment.controller'
import { paystackWebhook, flutterwaveWebhook } from '../../controllers/payment/webhook.controller'

const router = Router()

// ─── Webhook routes (RAW body — MUST come before express.json()) ──────────────
//
// We capture the raw body string so Paystack HMAC validation works.
// Flutterwave just checks the verif-hash header, but we keep raw body consistent.

const rawBodyCapture = (req: Request, _res: Response, next: NextFunction) => {
  let raw = ''
  req.setEncoding('utf8')
  req.on('data', (chunk: string) => { raw += chunk })
  req.on('end', () => {
    ;(req as any).rawBody = raw
    try { req.body = JSON.parse(raw) } catch { req.body = {} }
    next()
  })
}

router.post('/webhook/paystack',    rawBodyCapture, paystackWebhook)
router.post('/webhook/flutterwave', rawBodyCapture, flutterwaveWebhook)

// ─── Authenticated routes ─────────────────────────────────────────────────────

router.use(requireAuth)

// Initiate payment for a booking
router.post('/initiate', initiatePayment)

// Verify after gateway redirect (fallback if webhook missed)
router.post('/verify', verifyPayment)

// Bank utilities (for driver bank account setup)
router.get('/banks',            listBanks)
router.post('/resolve-account', resolveAccount)

// Driver bank account + payout request
router.post('/save-bank-account', saveBankAccount)
router.post('/request-payout',    requestPayout)

export default router
