import { Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { ok, serverError } from '../../lib/response'
import { dec } from '../../lib/naira'

export async function getDashboard(req: Request, res: Response) {
  try {
    const companyId = req.companyId!
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

    // Run independent queries in parallel
    const [
      company,
      totalEmployees,
      activeEmployees,
      pendingApprovals,
      monthlyBookings,
      activeBudgets,
      recentBookings,
    ] = await Promise.all([
      prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),

      prisma.companyEmployee.count({ where: { companyId } }),

      prisma.companyEmployee.count({ where: { companyId, isActive: true } }),

      prisma.approvalRequest.count({
        where: {
          status: 'pending',
          workflow: { companyId },
          expiresAt: { gt: now },
        },
      }),

      prisma.booking.findMany({
        where: {
          companyId,
          createdAt: { gte: monthStart, lte: monthEnd },
          status: { in: ['completed', 'confirmed', 'processing'] },
        },
        select: { totalAmount: true, departmentId: true },
      }),

      prisma.budget.findMany({
        where: { companyId, isActive: true, periodStart: { lte: now }, periodEnd: { gte: now } },
        include: { department: { select: { name: true } }, transactions: { select: { amount: true } } },
      }),

      prisma.booking.findMany({
        where: { companyId, createdAt: { gte: monthStart } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          passenger: { select: { name: true, profilePicUrl: true } },
          ride: { select: { originAddress: true, destinationAddress: true } },
        },
      }),
    ])

    // Monthly spend totals
    const monthlySpent  = monthlyBookings.reduce((s, b) => s + dec(b.totalAmount), 0)
    const monthlyBudget = activeBudgets.reduce((s, b) => s + dec(b.allocatedAmount), 0)
    const spendPercent  = monthlyBudget > 0 ? (monthlySpent / monthlyBudget) * 100 : 0

    // Dept spend breakdown
    const deptMap = new Map<string, { name: string; spent: number; budget: number }>()

    for (const b of activeBudgets) {
      const deptName = b.department?.name ?? 'Company-wide'
      const deptId   = b.departmentId?.toString() ?? 'company'
      const budgetAmt = dec(b.allocatedAmount)
      const spentAmt  = b.transactions.reduce((s, t) => s + dec(t.amount), 0)
      const existing  = deptMap.get(deptId)
      if (existing) {
        existing.budget += budgetAmt
        existing.spent  += spentAmt
      } else {
        deptMap.set(deptId, { name: deptName, spent: spentAmt, budget: budgetAmt })
      }
    }

    const deptSpend = Array.from(deptMap.values()).map((d) => ({
      department: d.name,
      spent:      d.spent,
      budget:     d.budget,
      percent:    d.budget > 0 ? Math.round((d.spent / d.budget) * 100) : 0,
    }))

    // Recent rides
    const recentRides = recentBookings.map((b) => ({
      employee_name: b.passenger.name,
      profile_pic:   b.passenger.profilePicUrl ?? '',
      origin:        b.ride.originAddress,
      destination:   b.ride.destinationAddress,
      amount:        dec(b.totalAmount),
      status:        b.status,
      ride_date:     b.createdAt.toISOString(),
    }))

    ok(res, {
      company_name:       company?.name ?? '',
      company_id:         companyId,
      monthly_budget:     monthlyBudget,
      monthly_spent:      monthlySpent,
      total_employees:    totalEmployees,
      active_employees:   activeEmployees,
      pending_approvals:  pendingApprovals,
      rides_this_month:   monthlyBookings.length,
      spend_percent:      Math.round(spendPercent * 10) / 10,
      dept_spend:         deptSpend,
      recent_rides:       recentRides,
    })
  } catch (err) {
    serverError(res, err)
  }
}
