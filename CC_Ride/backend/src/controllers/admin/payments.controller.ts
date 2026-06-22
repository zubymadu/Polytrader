import { Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { ok, serverError } from '../../lib/response'
import { dec } from '../../lib/naira'

export async function getPaymentSummary(_req: Request, res: Response) {
  try {
    const now        = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const [allBookings, pendingPayoutsAgg, paidPayoutsAgg, revenueByMonth] = await Promise.all([
      prisma.booking.findMany({
        where: { createdAt: { gte: monthStart }, paymentStatus: 'successful' },
        select: { totalAmount: true, platformCommission: true, driverEarning: true, paymentGateway: true },
      }),
      prisma.payoutRequest.aggregate({
        where: { status: 'pending' }, _sum: { amount: true },
      }),
      prisma.payoutRequest.aggregate({
        // 'paid' and 'completed' are both valid statuses in the enum
        where: { status: { in: ['paid', 'completed'] } },
        _sum:  { amount: true },
      }),
      Promise.all(
        Array.from({ length: 6 }, async (_, i) => {
          const d   = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
          const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)
          const bks = await prisma.booking.findMany({
            where: { createdAt: { gte: d, lte: end }, paymentStatus: 'successful' },
            select: { totalAmount: true, platformCommission: true, paymentGateway: true },
          })
          return {
            month:       d.toLocaleString('en', { month: 'short' }),
            paystack:    bks.filter((b) => b.paymentGateway === 'paystack').reduce((s, b) => s + dec(b.totalAmount), 0),
            flutterwave: bks.filter((b) => b.paymentGateway === 'flutterwave').reduce((s, b) => s + dec(b.totalAmount), 0),
            revenue:     bks.reduce((s, b) => s + dec(b.platformCommission), 0),
          }
        }),
      ),
    ])

    ok(res, {
      total_collected:    allBookings.reduce((s, b) => s + dec(b.totalAmount), 0),
      platform_revenue:   allBookings.reduce((s, b) => s + dec(b.platformCommission), 0),
      driver_payouts:     dec(paidPayoutsAgg._sum.amount),
      pending_payouts:    dec(pendingPayoutsAgg._sum.amount),
      paystack_volume:    allBookings.filter((b) => b.paymentGateway === 'paystack').reduce((s, b) => s + dec(b.totalAmount), 0),
      flutterwave_volume: allBookings.filter((b) => b.paymentGateway === 'flutterwave').reduce((s, b) => s + dec(b.totalAmount), 0),
      monthly_breakdown:  revenueByMonth,
    })
  } catch (err) {
    serverError(res, err)
  }
}

export async function listTransactions(req: Request, res: Response) {
  try {
    const { gateway } = req.query as Record<string, string>
    const bookings = await prisma.booking.findMany({
      where: {
        paymentStatus: 'successful',
        ...(gateway ? { paymentGateway: gateway as any } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        passenger: { select: { name: true } },
        driver:    { select: { name: true } },
        company:   { select: { name: true } },
      },
    })

    ok(res, bookings.map((b) => ({
      id:             b.id,
      reference:      b.paymentReference ?? b.id.slice(0, 12).toUpperCase(),
      passenger:      b.passenger.name,
      driver:         b.driver?.name ?? '—',
      amount:         dec(b.totalAmount),
      platform_fee:   dec(b.platformCommission),
      driver_earning: dec(b.driverEarning),
      gateway:        b.paymentGateway ?? 'company_account',
      status:         b.paymentStatus,
      created_at:     b.createdAt.toISOString(),
      is_corporate:   !!b.companyId,
      company_name:   b.company?.name ?? null,
    })))
  } catch (err) {
    serverError(res, err)
  }
}

export async function listPayouts(req: Request, res: Response) {
  try {
    const { status } = req.query as Record<string, string>
    const payouts = await prisma.payoutRequest.findMany({
      where: status ? { status: status as any } : {},
      orderBy: { requestedAt: 'desc' },
      take: 100,
      include: {
        driver:      { select: { name: true } },
        bankAccount: { select: { bankName: true, accountNumber: true } },
      },
    })

    ok(res, payouts.map((p) => ({
      id:             p.id,
      driver:         p.driver.name,
      amount:         dec(p.amount),
      status:         p.status,
      requested_at:   p.requestedAt.toISOString(),
      bank_name:      p.bankAccount?.bankName ?? '—',
      account_number: p.bankAccount?.accountNumber ?? '—',
    })))
  } catch (err) {
    serverError(res, err)
  }
}
