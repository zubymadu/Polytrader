import { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ok, fail, serverError } from '../../lib/response'
import { dec } from '../../lib/naira'

// ─── GET /corporate/policies ──────────────────────────────────────────────────

export async function listPolicies(req: Request, res: Response) {
  try {
    const companyId = req.companyId!

    const policies = await prisma.ridePolicy.findMany({
      where:   { companyId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      include: {
        department:    { select: { name: true } },
        maxVehicleType: { select: { title: true } },
      },
    })

    ok(res, policies.map((p) => ({
      id:                    p.id.toString(),
      name:                  p.name,
      department:            p.department?.name ?? 'Company-wide',
      department_id:         p.departmentId?.toString() ?? '',
      allowed_days:          p.allowedDays,
      allowed_time_from:     p.allowedTimeFrom ?? null,
      allowed_time_to:       p.allowedTimeTo ?? null,
      max_fare_per_trip:     p.maxFarePerTrip ? dec(p.maxFarePerTrip) : null,
      max_monthly_spend:     p.maxMonthlySpend ? dec(p.maxMonthlySpend) : null,
      max_vehicle_type:      p.maxVehicleType?.title ?? null,
      is_active:             p.isActive,
    })))
  } catch (err) {
    serverError(res, err)
  }
}

// ─── POST /corporate/policies/create ─────────────────────────────────────────

const CreatePolicySchema = z.object({
  company_id:              z.string().uuid(),
  department_id:           z.string().optional(),
  name:                    z.string().min(2),
  allowed_days:            z.array(z.number().int().min(1).max(7)).min(1),
  allowed_time_from:       z.string().nullable().optional(),
  allowed_time_to:         z.string().nullable().optional(),
  max_fare_per_trip:       z.string().or(z.number()).transform(Number).nullable().optional(),
  max_monthly_spend:       z.string().or(z.number()).transform(Number).nullable().optional(),
  max_vehicle_type_id:     z.string().optional(),
  advance_booking_minutes: z.number().optional(),
  created_by:              z.string().uuid(),
})

export async function createPolicy(req: Request, res: Response) {
  try {
    const data      = CreatePolicySchema.parse(req.body)
    const companyId = req.companyId!

    let deptId: bigint | null = null
    if (data.department_id) {
      const dept = await prisma.department.findFirst({ where: { id: BigInt(data.department_id), companyId } })
      if (!dept) { fail(res, 'Department not found'); return }
      deptId = dept.id
    }

    let maxTypeId: bigint | null = null
    if (data.max_vehicle_type_id) {
      maxTypeId = BigInt(data.max_vehicle_type_id)
    }

    const policy = await prisma.ridePolicy.create({
      data: {
        companyId,
        departmentId:          deptId,
        name:                  data.name,
        allowedDays:           data.allowed_days,
        allowedTimeFrom:       data.allowed_time_from ?? null,
        allowedTimeTo:         data.allowed_time_to ?? null,
        maxFarePerTrip:        data.max_fare_per_trip ?? null,
        maxMonthlySpend:       data.max_monthly_spend ?? null,
        maxVehicleTypeId:      maxTypeId,
        advanceBookingMinutes: data.advance_booking_minutes ?? null,
        createdById:           data.created_by,
      },
    })

    ok(res, { id: policy.id.toString() }, 'Policy created')
  } catch (err) {
    serverError(res, err)
  }
}

// ─── POST /corporate/policies/toggle ─────────────────────────────────────────

export async function togglePolicy(req: Request, res: Response) {
  try {
    const { policy_id, is_active } = req.body as { policy_id: string; is_active: boolean }
    const companyId = req.companyId!

    const policy = await prisma.ridePolicy.findFirst({
      where: { id: BigInt(policy_id), companyId },
    })
    if (!policy) { fail(res, 'Policy not found'); return }

    await prisma.ridePolicy.update({
      where: { id: policy.id },
      data:  { isActive: Boolean(is_active) },
    })

    ok(res, { policy_id, is_active }, `Policy ${is_active ? 'enabled' : 'disabled'}`)
  } catch (err) {
    serverError(res, err)
  }
}
