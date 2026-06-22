import { Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { ok, serverError } from '../../lib/response'
import { dec } from '../../lib/naira'

// ─── GET /admin/analytics ─────────────────────────────────────────────────────

export async function getAnalytics(_req: Request, res: Response) {
  try {
    const now        = new Date()
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const start6m    = new Date(now.getFullYear(), now.getMonth() - 5, 1)

    // Monthly totals for last 6 months
    const monthlyRaw = await prisma.booking.groupBy({
      by:     ['createdAt'],
      where:  { createdAt: { gte: start6m }, status: { in: ['completed', 'confirmed'] } },
      _sum:   { totalAmount: true },
      _count: { id: true },
    })

    // Aggregate by month label
    const monthMap: Record<string, { gmv: number; rides: number }> = {}
    monthlyRaw.forEach((r) => {
      const label = r.createdAt.toLocaleString('en-NG', { month: 'short', year: '2-digit' })
      if (!monthMap[label]) monthMap[label] = { gmv: 0, rides: 0 }
      monthMap[label].gmv   += Number(r._sum.totalAmount ?? 0)
      monthMap[label].rides += r._count.id
    })
    const monthly = Object.entries(monthMap).map(([month, v]) => ({ month, ...v }))

    // Top companies by GMV this month
    const topCompanies = await prisma.booking.groupBy({
      by:     ['companyId'],
      where:  { createdAt: { gte: startMonth }, companyId: { not: null }, status: { in: ['completed', 'confirmed'] } },
      _sum:   { totalAmount: true },
      _count: { id: true },
      orderBy:{ _sum: { totalAmount: 'desc' } },
      take:   10,
    })

    const companyIds = topCompanies.map((c) => c.companyId!).filter(Boolean)
    const companies  = await prisma.company.findMany({
      where:  { id: { in: companyIds } },
      select: { id: true, name: true, industry: true },
    })
    const companyMap = Object.fromEntries(companies.map((c) => [c.id, c]))

    const topCompaniesOut = topCompanies.map((c) => ({
      company_id:   c.companyId!,
      company_name: companyMap[c.companyId!]?.name ?? 'Unknown',
      industry:     companyMap[c.companyId!]?.industry ?? '',
      gmv:          dec(c._sum.totalAmount ?? 0),
      rides:        c._count.id,
    }))

    // Ride status breakdown this month
    const statusBreakdown = await prisma.booking.groupBy({
      by:     ['status'],
      where:  { createdAt: { gte: startMonth } },
      _count: { id: true },
    })

    // Average fare, total users, total drivers
    const [avgFare, userCount, driverCount, pendingApprovals] = await Promise.all([
      prisma.booking.aggregate({
        where: { status: 'completed' },
        _avg:  { totalAmount: true },
      }),
      prisma.user.count({ where: { isDriver: false, status: 'active' } }),
      prisma.driverProfile.count({ where: { status: 'active' } }),
      prisma.approvalRequest.count({ where: { status: 'pending' } }),
    ])

    // Corporate vs personal split this month
    const [corporate, personal] = await Promise.all([
      prisma.booking.count({ where: { createdAt: { gte: startMonth }, companyId: { not: null } } }),
      prisma.booking.count({ where: { createdAt: { gte: startMonth }, companyId: null } }),
    ])

    ok(res, {
      monthly_trend:    monthly,
      top_companies:    topCompaniesOut,
      status_breakdown: statusBreakdown.map((s) => ({ status: s.status, count: s._count.id })),
      avg_fare:         dec(avgFare._avg.totalAmount ?? 0),
      active_users:     userCount,
      active_drivers:   driverCount,
      pending_approvals:pendingApprovals,
      corporate_rides:  corporate,
      personal_rides:   personal,
    })
  } catch (err) {
    serverError(res, err)
  }
}

// ─── GET /admin/analytics/company/:id ────────────────────────────────────────

export async function getCompanyAnalytics(req: Request, res: Response) {
  try {
    const companyId = String(req.params.id)
    const start30   = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const [bookings, deptBreakdown] = await Promise.all([
      prisma.booking.findMany({
        where:   { companyId, createdAt: { gte: start30 } },
        orderBy: { createdAt: 'desc' },
        take:    50,
        include: {
          passenger:  { select: { name: true } },
          department: { select: { name: true } },
          costCentre: { select: { name: true, code: true } },
        },
      }),
      prisma.booking.groupBy({
        by:    ['departmentId'],
        where: { companyId, departmentId: { not: null }, status: { in: ['completed', 'confirmed'] } },
        _sum:  { totalAmount: true },
        _count:{ id: true },
        orderBy:{ _sum: { totalAmount: 'desc' } },
        take:  10,
      }),
    ])

    const deptIds = deptBreakdown.map((d) => d.departmentId!).filter(Boolean)
    const depts   = await prisma.department.findMany({ where: { id: { in: deptIds } }, select: { id: true, name: true } })
    const deptMap = Object.fromEntries(depts.map((d) => [d.id.toString(), d.name]))

    ok(res, {
      recent_bookings: bookings.map((b) => {
        const bb = b as typeof b & { passenger: { name: string }; department?: { name: string } | null; costCentre?: { name: string; code: string } | null }
        return {
          id:          b.id,
          passenger:   bb.passenger.name,
          department:  bb.department?.name ?? null,
          cost_centre: bb.costCentre?.code ?? null,
          amount:      dec(b.totalAmount),
          status:      b.status,
          created_at:  b.createdAt.toISOString(),
        }
      }),
      department_breakdown: deptBreakdown.map((d) => ({
        department_id:   d.departmentId!.toString(),
        department_name: deptMap[d.departmentId!.toString()] ?? 'Unknown',
        gmv:             dec(d._sum.totalAmount ?? 0),
        rides:           d._count.id,
      })),
    })
  } catch (err) {
    serverError(res, err)
  }
}
