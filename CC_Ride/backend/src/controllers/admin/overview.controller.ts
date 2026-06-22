import { Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { ok, serverError } from '../../lib/response'
import { dec } from '../../lib/naira'

export async function getOverview(_req: Request, res: Response) {
  try {
    const now        = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastStart  = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastEnd    = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
    const dayStart   = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const [
      totalUsers, totalDrivers, totalCompanies,
      activeRides, ridesMonthly, ridesLastMonth,
      ridesDaily, pendingDrivers, pendingCompanies,
      openTickets, completedRides,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.driverProfile.count({ where: { status: 'active' } }),
      prisma.company.count({ where: { status: 'active' } }),
      prisma.booking.count({ where: { status: 'in_progress' } }),
      prisma.booking.findMany({
        where: { createdAt: { gte: monthStart }, status: { in: ['completed', 'confirmed'] } },
        select: { totalAmount: true },
      }),
      prisma.booking.findMany({
        where: { createdAt: { gte: lastStart, lte: lastEnd }, status: { in: ['completed', 'confirmed'] } },
        select: { totalAmount: true },
      }),
      prisma.booking.count({ where: { createdAt: { gte: dayStart } } }),
      prisma.driverProfile.count({ where: { status: 'pending' } }),
      prisma.company.count({ where: { status: 'pending_approval' } }),
      prisma.supportTicket.count({ where: { status: 'open' } }),
      prisma.booking.findMany({
        where: { createdAt: { gte: monthStart }, status: 'completed' },
        orderBy: { createdAt: 'desc' }, take: 10,
        include: {
          passenger: { select: { name: true } },
          driver:    { select: { name: true } },
          ride:      { select: { originAddress: true, destinationAddress: true } },
        },
      }),
    ])

    const gmvThisMonth = ridesMonthly.reduce((s, r) => s + dec(r.totalAmount), 0)
    const gmvLastMonth = ridesLastMonth.reduce((s, r) => s + dec(r.totalAmount), 0)

    // 6-month revenue chart
    const revenueChart = await Promise.all(
      Array.from({ length: 6 }, async (_, i) => {
        const d   = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)
        const bookings = await prisma.booking.findMany({
          where: { createdAt: { gte: d, lte: end }, status: { in: ['completed', 'confirmed'] } },
          select: { totalAmount: true },
        })
        const gmv   = bookings.reduce((s, b) => s + dec(b.totalAmount), 0)
        const label = d.toLocaleString('en', { month: 'short' })
        return { month: label, gmv, rides: bookings.length }
      }),
    )

    ok(res, {
      total_users:               totalUsers,
      total_drivers:             totalDrivers,
      total_companies:           totalCompanies,
      active_rides:              activeRides,
      gmv_this_month:            gmvThisMonth,
      gmv_last_month:            gmvLastMonth,
      rides_today:               ridesDaily,
      rides_this_month:          ridesMonthly.length,
      pending_driver_approvals:  pendingDrivers,
      pending_company_approvals: pendingCompanies,
      open_support_tickets:      openTickets,
      revenue_chart:             revenueChart,
      recent_rides: completedRides.map((b) => ({
        id:          b.id,
        passenger:   b.passenger.name,
        driver:      b.driver?.name ?? '—',
        origin:      b.ride.originAddress,
        destination: b.ride.destinationAddress,
        amount:      dec(b.totalAmount),
        status:      b.status,
        created_at:  b.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    serverError(res, err)
  }
}
