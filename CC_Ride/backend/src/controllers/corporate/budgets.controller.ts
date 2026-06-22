import { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ok, fail, serverError } from '../../lib/response'
import { dec } from '../../lib/naira'

// ─── GET /corporate/budgets ───────────────────────────────────────────────────

export async function listBudgets(req: Request, res: Response) {
  try {
    const companyId = req.companyId!

    const budgets = await prisma.budget.findMany({
      where:   { companyId },
      orderBy: [{ isActive: 'desc' }, { periodStart: 'desc' }],
      include: {
        department:   { select: { name: true } },
        transactions: { select: { amount: true } },
      },
    })

    ok(res, budgets.map((b) => {
      const spent     = b.transactions.reduce((s, t) => s + dec(t.amount), 0)
      const allocated = dec(b.allocatedAmount)
      return {
        id:               b.id.toString(),
        department:       b.department?.name ?? 'Company-wide',
        department_id:    b.departmentId?.toString() ?? '',
        period_type:      b.periodType,
        period_start:     b.periodStart.toISOString().split('T')[0],
        period_end:       b.periodEnd.toISOString().split('T')[0],
        allocated_amount: allocated,
        spent_amount:     spent,
        remaining_amount: Math.max(0, allocated - spent),
        spend_percent:    allocated > 0 ? Math.round((spent / allocated) * 1000) / 10 : 0,
        alert_threshold:  dec(b.alertThreshold),
        is_active:        b.isActive,
      }
    }))
  } catch (err) {
    serverError(res, err)
  }
}

// ─── POST /corporate/budgets/create ──────────────────────────────────────────

const CreateBudgetSchema = z.object({
  company_id:       z.string().uuid(),
  department_id:    z.string().optional(),
  cost_centre_id:   z.string().optional(),
  period_type:      z.enum(['monthly', 'quarterly', 'annual']).default('monthly'),
  period_start:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  period_end:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  allocated_amount: z.string().or(z.number()).transform(Number),
  alert_threshold:  z.string().or(z.number()).transform(Number).default(80),
  created_by:       z.string().uuid(),
})

export async function createBudget(req: Request, res: Response) {
  try {
    const data      = CreateBudgetSchema.parse(req.body)
    const companyId = req.companyId!

    const start = new Date(data.period_start)
    const end   = new Date(data.period_end)
    if (end <= start) { fail(res, 'period_end must be after period_start'); return }

    let deptId: bigint | null = null
    if (data.department_id) {
      const dept = await prisma.department.findFirst({ where: { id: BigInt(data.department_id), companyId } })
      if (!dept) { fail(res, 'Department not found'); return }
      deptId = dept.id
    }

    let ccId: bigint | null = null
    if (data.cost_centre_id) {
      const cc = await prisma.costCentre.findFirst({ where: { id: BigInt(data.cost_centre_id), companyId } })
      if (!cc) { fail(res, 'Cost centre not found'); return }
      ccId = cc.id
    }

    const budget = await prisma.budget.create({
      data: {
        companyId,
        departmentId:    deptId,
        costCentreId:    ccId,
        periodType:      data.period_type as any,
        periodStart:     start,
        periodEnd:       end,
        allocatedAmount: data.allocated_amount,
        alertThreshold:  data.alert_threshold,
        createdById:     data.created_by,
      },
    })

    ok(res, { id: budget.id.toString() }, 'Budget created successfully')
  } catch (err) {
    serverError(res, err)
  }
}
