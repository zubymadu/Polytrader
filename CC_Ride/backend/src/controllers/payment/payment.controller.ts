/**
 * Payment controller — CC Ride
 * Handles: initiate, verify, bank lookup, account resolve, driver payout trigger
 */
import { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ok, fail, serverError } from '../../lib/response'
import { dec } from '../../lib/naira'
import { paystackInitialize, paystackVerify, paystackListBanks, paystackResolveAccount, paystackCreateRecipient, paystackTransfer } from '../../lib/paystack'
import { flwInitialize, flwVerifyByRef, flwListBanks, flwResolveAccount, flwTransfer, flwTxRef } from '../../lib/flutterwave'

// ─── POST /payment/initiate ───────────────────────────────────────────────────
//
// Initiates a Paystack or Flutterwave payment for a booking.
// Called by the Flutter app after booking is created (status=pending, paymentStatus=pending).

const InitiateSchema = z.object({
  booking_id: z.string().uuid(),
  gateway:    z.enum(['paystack', 'flutterwave']).default('flutterwave'),
})

export async function initiatePayment(req: Request, res: Response) {
  try {
    const { booking_id, gateway } = InitiateSchema.parse(req.body)
    const userId = req.user.id

    const booking = await prisma.booking.findFirst({
      where: { id: booking_id, passengerId: userId },
      include: { passenger: { select: { name: true, email: true, mobile: true } } },
    })
    if (!booking) { fail(res, 'Booking not found'); return }
    if (booking.paymentStatus === 'successful') {
      fail(res, 'Booking already paid'); return
    }

    const amountNGN  = dec(booking.totalAmount)
    const email      = booking.passenger.email ?? `${userId}@ccride.ng`
    const name       = booking.passenger.name
    const phone      = booking.passenger.mobile
    const description = `CC Ride booking ${booking.id.slice(0, 8).toUpperCase()}`

    let paymentUrl: string
    let reference: string

    if (gateway === 'paystack') {
      const amountKobo = Math.round(amountNGN * 100)
      reference        = `CCR-PS-${Date.now()}-${booking_id.slice(0, 8).toUpperCase()}`

      const result = await paystackInitialize({
        email,
        amountKobo,
        reference,
        callbackUrl: `${process.env.FRONTEND_URL}/payment/verify?gateway=paystack&ref=${reference}`,
        metadata: { booking_id, user_id: userId },
      })
      paymentUrl = result.authorization_url

    } else {
      // Flutterwave
      reference = flwTxRef('CCR-FLW')
      const result = await flwInitialize({
        email,
        name,
        phone,
        amountNGN,
        txRef:       reference,
        redirectUrl: `${process.env.FRONTEND_URL}/payment/verify?gateway=flutterwave&ref=${reference}`,
        description,
        meta: { booking_id, user_id: userId },
      })
      paymentUrl = result.payment_link
    }

    // Store the reference on the booking so the webhook can match it
    await prisma.booking.update({
      where: { id: booking_id },
      data:  {
        paymentReference: reference,
        paymentGateway:   gateway as any,
      },
    })

    ok(res, { payment_url: paymentUrl, reference, gateway })
  } catch (err) {
    serverError(res, err)
  }
}

// ─── POST /payment/verify ─────────────────────────────────────────────────────
//
// Called by app after redirect from payment gateway.
// Also used as a fallback if webhook misses.

const VerifySchema = z.object({
  reference: z.string(),
  gateway:   z.enum(['paystack', 'flutterwave']),
})

export async function verifyPayment(req: Request, res: Response) {
  try {
    const { reference, gateway } = VerifySchema.parse(req.body)

    const booking = await prisma.booking.findFirst({
      where: { paymentReference: reference },
    })
    if (!booking) { fail(res, 'Booking not found for reference'); return }
    if (booking.paymentStatus === 'successful') {
      ok(res, { status: 'already_paid', booking_id: booking.id }); return
    }

    let paid = false
    let paidAt: Date | null = null

    if (gateway === 'paystack') {
      const result = await paystackVerify(reference)
      paid  = result.status === 'success'
      paidAt = paid ? new Date(result.paid_at) : null

    } else {
      const result = await flwVerifyByRef(reference)
      paid  = result.status === 'successful'
      paidAt = paid ? new Date(result.charged_at) : null
    }

    if (!paid) {
      ok(res, { status: 'pending_or_failed', booking_id: booking.id }); return
    }

    await _confirmBookingPayment(booking.id, gateway, paidAt)

    ok(res, { status: 'paid', booking_id: booking.id })
  } catch (err) {
    serverError(res, err)
  }
}

// ─── GET /payment/banks?gateway=paystack|flutterwave ─────────────────────────

export async function listBanks(req: Request, res: Response) {
  try {
    const gateway = (req.query.gateway as string) ?? 'flutterwave'
    const banks   = gateway === 'paystack'
      ? await paystackListBanks()
      : await flwListBanks()

    ok(res, banks)
  } catch (err) {
    serverError(res, err)
  }
}

// ─── POST /payment/resolve-account ───────────────────────────────────────────

const ResolveSchema = z.object({
  account_number: z.string().length(10),
  bank_code:      z.string(),
  gateway:        z.enum(['paystack', 'flutterwave']).default('paystack'),
})

export async function resolveAccount(req: Request, res: Response) {
  try {
    const { account_number, bank_code, gateway } = ResolveSchema.parse(req.body)
    const result = gateway === 'paystack'
      ? await paystackResolveAccount({ accountNumber: account_number, bankCode: bank_code })
      : await flwResolveAccount({ accountNumber: account_number, bankCode: bank_code })

    ok(res, {
      account_number: result.account_number,
      account_name:   result.account_name,
    })
  } catch (err) {
    serverError(res, err)
  }
}

// ─── POST /payment/save-bank-account ─────────────────────────────────────────
//
// Driver saves their bank account. Automatically creates a Paystack recipient
// for future fast payouts.

const SaveBankSchema = z.object({
  bank_name:      z.string().min(2),
  bank_code:      z.string(),
  account_number: z.string().length(10),
  account_name:   z.string().min(2),
  is_primary:     z.boolean().default(true),
})

export async function saveBankAccount(req: Request, res: Response) {
  try {
    const data   = SaveBankSchema.parse(req.body)
    const userId = req.user.id

    // Ensure user is a driver
    const profile = await prisma.driverProfile.findUnique({ where: { userId } })
    if (!profile) { fail(res, 'Driver profile not found'); return }

    // Create Paystack recipient for instant payouts
    let paystackRecipientCode: string | undefined
    try {
      const recipient = await paystackCreateRecipient({
        accountName:   data.account_name,
        accountNumber: data.account_number,
        bankCode:      data.bank_code,
      })
      paystackRecipientCode = recipient.recipient_code
    } catch {
      // Non-fatal — payout will fall back to Flutterwave
    }

    // If primary, demote others
    if (data.is_primary) {
      await prisma.driverBankAccount.updateMany({
        where: { driverId: userId },
        data:  { isPrimary: false },
      })
    }

    const account = await prisma.driverBankAccount.create({
      data: {
        driverId:              userId,
        bankName:              data.bank_name,
        bankCode:              data.bank_code,
        accountNumber:         data.account_number,
        accountName:           data.account_name,
        isPrimary:             data.is_primary,
        paystackRecipientCode: paystackRecipientCode ?? null,
      },
    })

    ok(res, {
      id:             account.id,
      bank_name:      account.bankName,
      account_number: account.accountNumber,
      account_name:   account.accountName,
      is_primary:     account.isPrimary,
    }, 'Bank account saved')
  } catch (err) {
    serverError(res, err)
  }
}

// ─── POST /payment/request-payout ────────────────────────────────────────────
//
// Driver requests a payout of their available wallet balance.

const PayoutRequestSchema = z.object({
  amount: z.number().positive(),
})

export async function requestPayout(req: Request, res: Response) {
  try {
    const { amount } = PayoutRequestSchema.parse(req.body)
    const userId     = req.user.id

    const [settings, driver, bankAccount] = await Promise.all([
      prisma.platformSettings.findUnique({ where: { id: 1 } }),
      prisma.user.findUnique({ where: { id: userId }, select: { walletBalance: true, name: true } }),
      prisma.driverBankAccount.findFirst({ where: { driverId: userId, isPrimary: true } }),
    ])

    if (!driver) { fail(res, 'User not found'); return }
    if (!bankAccount) { fail(res, 'No bank account on file. Add a bank account first.'); return }

    const minPayout  = dec(settings?.driverPayoutThreshold ?? 5000)
    const available  = dec(driver.walletBalance)

    if (amount < minPayout) {
      fail(res, `Minimum payout is ₦${minPayout.toLocaleString()}`); return
    }
    if (amount > available) {
      fail(res, `Insufficient balance. Available: ₦${available.toLocaleString()}`); return
    }

    // Check for existing pending request
    const existing = await prisma.payoutRequest.findFirst({
      where: { driverId: userId, status: 'pending' },
    })
    if (existing) {
      fail(res, 'You already have a pending payout request'); return
    }

    const payoutReq = await prisma.payoutRequest.create({
      data: {
        driverId:      userId,
        bankAccountId: bankAccount.id,
        amount,
        status:        'pending',
      },
    })

    ok(res, {
      payout_id:      payoutReq.id,
      amount,
      bank_name:      bankAccount.bankName,
      account_number: bankAccount.accountNumber,
      status:         'pending',
    }, 'Payout request submitted. Processed within 1 business day.')
  } catch (err) {
    serverError(res, err)
  }
}

// ─── POST /admin/payments/process-payout (Admin-only) ────────────────────────
//
// Admin processes a pending payout request — called from admin panel.
// Exported separately; mounted on the admin router.

export async function processPayout(req: Request, res: Response) {
  try {
    const { payout_id, gateway } = req.body as {
      payout_id: string
      gateway?:  'paystack' | 'flutterwave'
    }

    const payout = await prisma.payoutRequest.findUnique({
      where:   { id: payout_id },
      include: {
        driver:      { select: { name: true, walletBalance: true } },
        bankAccount: true,
      },
    })
    if (!payout)               { fail(res, 'Payout not found'); return }
    if (payout.status !== 'pending') {
      fail(res, `Payout is already ${payout.status}`); return
    }
    if (!payout.bankAccount)   { fail(res, 'No bank account linked to this payout'); return }

    const amountNGN   = dec(payout.amount)
    const reference   = `CCR-PAY-${payout.id}-${Date.now()}`
    const narration   = `CC Ride driver payout — ${payout.driver.name}`
    const bank        = payout.bankAccount
    const useGateway  = gateway ?? (bank.paystackRecipientCode ? 'paystack' : 'flutterwave')

    // Mark as processing
    await prisma.payoutRequest.update({
      where: { id: payout.id },
      data:  { status: 'processing' },
    })

    try {
      if (useGateway === 'paystack' && bank.paystackRecipientCode) {
        await paystackTransfer({
          amountKobo:    Math.round(amountNGN * 100),
          recipientCode: bank.paystackRecipientCode,
          reference,
          reason:        narration,
        })
      } else {
        await flwTransfer({
          amountNGN,
          accountNumber: bank.accountNumber,
          bankCode:      bank.bankCode ?? '',
          accountName:   bank.accountName,
          reference,
          narration,
        })
      }

      // Deduct from wallet
      await prisma.$transaction([
        prisma.user.update({
          where: { id: payout.driverId },
          data:  { walletBalance: { decrement: payout.amount } },
        }),
        prisma.payoutRequest.update({
          where: { id: payout.id },
          data:  { status: 'paid', processedAt: new Date() },
        }),
      ])

      ok(res, { payout_id: payout.id, status: 'paid', gateway: useGateway })

    } catch (transferErr: unknown) {
      // Revert to pending on failure
      await prisma.payoutRequest.update({
        where: { id: payout.id },
        data:  { status: 'pending' },
      })
      const msg = transferErr instanceof Error ? transferErr.message : 'Transfer failed'
      fail(res, `Transfer failed: ${msg}`)
    }
  } catch (err) {
    serverError(res, err)
  }
}

// ─── Internal helper ──────────────────────────────────────────────────────────

export async function _confirmBookingPayment(
  bookingId: string,
  gateway:   string,
  paidAt:    Date | null,
) {
  await prisma.booking.update({
    where: { id: bookingId },
    data:  {
      paymentStatus: 'successful',
      paymentGateway: gateway as any,
      status:         'confirmed',
      confirmedAt:    paidAt ?? new Date(),
    },
  })
}
