/**
 * Payment webhook controller — CC Ride
 *
 * Paystack:    POST /payment/webhook/paystack
 * Flutterwave: POST /payment/webhook/flutterwave
 *
 * IMPORTANT: Both routes must receive the raw request body (Buffer),
 * not parsed JSON. The router registers them BEFORE express.json() middleware.
 * See payment router for the rawBody setup.
 */
import { Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { paystackVerifyWebhook } from '../../lib/paystack'
import { flwVerifyWebhook } from '../../lib/flutterwave'
import { _confirmBookingPayment } from './payment.controller'

// ─── Paystack Webhook ─────────────────────────────────────────────────────────

export async function paystackWebhook(req: Request, res: Response) {
  // Always respond 200 immediately — Paystack retries on non-200
  res.sendStatus(200)

  try {
    const signature = req.headers['x-paystack-signature'] as string ?? ''
    const rawBody   = (req as any).rawBody as string ?? ''

    if (!paystackVerifyWebhook(rawBody, signature)) {
      console.warn('[Webhook/Paystack] Invalid signature — ignored')
      return
    }

    const event   = JSON.parse(rawBody) as { event: string; data: Record<string, unknown> }
    const { event: eventType, data } = event

    // ── charge.success ────────────────────────────────────────────────────────
    if (eventType === 'charge.success') {
      const reference = data.reference as string
      const status    = (data.status as string)?.toLowerCase()
      if (status !== 'success') return

      const booking = await prisma.booking.findFirst({
        where: { paymentReference: reference },
      })
      if (!booking || booking.paymentStatus === 'successful') return

      const paidAt = data.paid_at ? new Date(data.paid_at as string) : new Date()
      await _confirmBookingPayment(booking.id, 'paystack', paidAt)
      console.log(`[Webhook/Paystack] Booking ${booking.id} confirmed — ref ${reference}`)
    }

    // ── transfer.success ──────────────────────────────────────────────────────
    if (eventType === 'transfer.success') {
      const reference = data.reference as string
      await _markPayoutPaid(reference, 'paystack')
    }

    // ── transfer.failed ───────────────────────────────────────────────────────
    if (eventType === 'transfer.failed' || eventType === 'transfer.reversed') {
      const reference = data.reference as string
      await _markPayoutFailed(reference)
      console.warn(`[Webhook/Paystack] Transfer failed/reversed — ref ${reference}`)
    }

  } catch (err) {
    console.error('[Webhook/Paystack] Error processing event:', err)
  }
}

// ─── Flutterwave Webhook ──────────────────────────────────────────────────────

export async function flutterwaveWebhook(req: Request, res: Response) {
  res.sendStatus(200)

  try {
    const headerHash = req.headers['verif-hash'] as string ?? ''

    if (!flwVerifyWebhook(headerHash)) {
      console.warn('[Webhook/Flutterwave] Invalid verif-hash — ignored')
      return
    }

    const payload = req.body as {
      event:   string
      data: {
        id:           number
        tx_ref:       string
        flw_ref:      string
        status:       string
        amount:       number
        currency:     string
        charged_at:   string
        reference?:   string   // present on transfer events
      }
    }

    const { event: eventType, data } = payload

    // ── charge.completed ──────────────────────────────────────────────────────
    if (eventType === 'charge.completed') {
      if (data.status?.toLowerCase() !== 'successful') return

      const booking = await prisma.booking.findFirst({
        where: { paymentReference: data.tx_ref },
      })
      if (!booking || booking.paymentStatus === 'successful') return

      const paidAt = data.charged_at ? new Date(data.charged_at) : new Date()
      await _confirmBookingPayment(booking.id, 'flutterwave', paidAt)
      console.log(`[Webhook/Flutterwave] Booking ${booking.id} confirmed — ref ${data.tx_ref}`)
    }

    // ── transfer.completed ────────────────────────────────────────────────────
    if (eventType === 'transfer.completed') {
      const reference = data.reference ?? data.tx_ref
      if (data.status?.toLowerCase() === 'successful') {
        await _markPayoutPaid(reference, 'flutterwave')
      } else {
        await _markPayoutFailed(reference)
        console.warn(`[Webhook/Flutterwave] Transfer failed — ref ${reference}`)
      }
    }

  } catch (err) {
    console.error('[Webhook/Flutterwave] Error processing event:', err)
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function _markPayoutPaid(reference: string, gateway: string) {
  // reference format: CCR-PAY-{payoutId}-{timestamp}
  const match = reference.match(/^CCR-PAY-([^-]+)/)
  if (!match) return

  const payoutId = match[1]
  const payout   = await prisma.payoutRequest.findUnique({ where: { id: payoutId } })
  if (!payout || payout.status === 'paid' || payout.status === 'completed') return

  await prisma.$transaction([
    prisma.payoutRequest.update({
      where: { id: payoutId },
      data:  { status: 'paid', processedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: payout.driverId },
      data:  { walletBalance: { decrement: payout.amount } },
    }),
  ])

  console.log(`[Webhook/${gateway}] Payout ${payoutId} marked paid`)
}

async function _markPayoutFailed(reference: string) {
  const match = reference.match(/^CCR-PAY-([^-]+)/)
  if (!match) return
  const payoutId = match[1]
  await prisma.payoutRequest.update({
    where: { id: payoutId },
    data:  { status: 'failed' },
  }).catch(() => {})
}
