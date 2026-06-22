/**
 * Admin — Company, Department, Cost-Centre & Ride creation
 */
import { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ok, fail, serverError } from '../../lib/response'
import { dec } from '../../lib/naira'
import crypto from 'crypto'

// ─── POST /admin/companies/create ────────────────────────────────────────────

const CreateCompanySchema = z.object({
  name:                z.string().min(2),
  registration_number: z.string().optional(),
  tax_id:              z.string().optional(),
  industry:            z.string().optional(),
  address:             z.string().optional(),
  city:                z.string().optional(),
  state:               z.string().default('Lagos'),
  contact_name:        z.string().min(2),
  contact_email:       z.string().email(),
  contact_phone:       z.string().optional(),
  commission_rate:     z.number().min(0).max(50).optional(),
  monthly_subscription: z.number().optional(),
  notes:               z.string().optional(),
  // If true, immediately activate the company (skip pending_approval)
  auto_approve:        z.boolean().default(false),
})

export async function createCompany(req: Request, res: Response) {
  try {
    const data    = CreateCompanySchema.parse(req.body)
    const adminId = req.admin?.id ? BigInt(req.admin.id) : undefined

    // Check email uniqueness
    const exists = await prisma.company.findFirst({ where: { contactEmail: data.contact_email } })
    if (exists) { fail(res, 'A company with this email already exists'); return }

    const company = await prisma.company.create({
      data: {
        name:                 data.name,
        registrationNumber:   data.registration_number ?? null,
        taxId:                data.tax_id ?? null,
        industry:             data.industry ?? null,
        address:              data.address ?? null,
        city:                 data.city ?? null,
        state:                data.state,
        contactName:          data.contact_name,
        contactEmail:         data.contact_email,
        contactPhone:         data.contact_phone ?? null,
        commissionRate:       data.commission_rate ?? null,
        monthlySubscription:  data.monthly_subscription ?? 50000,
        notes:                data.notes ?? null,
        status:               data.auto_approve ? 'active' : 'pending_approval',
        onboardedById:        adminId ?? null,
      },
    })

    ok(res, {
      id:     company.id,
      name:   company.name,
      status: company.status,
    }, 'Company created')
  } catch (err) {
    serverError(res, err)
  }
}

// ─── POST /admin/companies/:id/departments ────────────────────────────────────

const CreateDeptSchema = z.object({
  name: z.string().min(2),
  code: z.string().optional(),
})

export async function createDepartment(req: Request, res: Response) {
  try {
    const companyId = String(req.params.id)
    const { name, code } = CreateDeptSchema.parse(req.body)

    const company = await prisma.company.findUnique({ where: { id: companyId } })
    if (!company) { fail(res, 'Company not found'); return }

    const dept = await prisma.department.create({
      data: { companyId, name, code: code ?? null },
    })

    ok(res, { id: dept.id.toString(), name: dept.name, code: dept.code ?? '' }, 'Department created')
  } catch (err: any) {
    if (err?.code === 'P2002') { fail(res, 'A department with this name already exists'); return }
    serverError(res, err)
  }
}

// ─── GET /admin/companies/:id/departments ─────────────────────────────────────

export async function listDepartments(req: Request, res: Response) {
  try {
    const companyId = String(req.params.id)
    const depts = await prisma.department.findMany({
      where:   { companyId, isActive: true },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { employees: true } },
      },
    })

    ok(res, depts.map((d) => ({
      id:             d.id.toString(),
      name:           d.name,
      code:           d.code ?? '',
      employee_count: d._count.employees,
    })))
  } catch (err) {
    serverError(res, err)
  }
}

// ─── POST /admin/companies/:id/cost-centres ───────────────────────────────────

const CreateCCSchema = z.object({
  name:          z.string().min(2),
  code:          z.string().min(1),
  description:   z.string().optional(),
  department_id: z.string().optional(),
})

export async function createCostCentre(req: Request, res: Response) {
  try {
    const companyId = String(req.params.id)
    const data = CreateCCSchema.parse(req.body)

    const company = await prisma.company.findUnique({ where: { id: companyId } })
    if (!company) { fail(res, 'Company not found'); return }

    const cc = await prisma.costCentre.create({
      data: {
        companyId,
        name:         data.name,
        code:         data.code.toUpperCase(),
        description:  data.description ?? null,
        departmentId: data.department_id ? BigInt(data.department_id) : null,
      },
    })

    ok(res, {
      id:   cc.id.toString(),
      name: cc.name,
      code: cc.code,
    }, 'Cost centre created')
  } catch (err: any) {
    if (err?.code === 'P2002') { fail(res, 'A cost centre with this code already exists'); return }
    serverError(res, err)
  }
}

// ─── GET /admin/companies/:id/cost-centres ────────────────────────────────────

export async function listCostCentres(req: Request, res: Response) {
  try {
    const companyId = String(req.params.id)
    const ccs = await prisma.costCentre.findMany({
      where:   { companyId, isActive: true },
      orderBy: { name: 'asc' },
      include: {
        department: { select: { name: true } },
        _count:     { select: { employees: true, bookings: true } },
      },
    })

    ok(res, ccs.map((c) => ({
      id:              c.id.toString(),
      name:            c.name,
      code:            c.code,
      description:     c.description ?? '',
      department:      c.department?.name ?? null,
      employee_count:  c._count.employees,
      total_bookings:  c._count.bookings,
    })))
  } catch (err) {
    serverError(res, err)
  }
}

// ─── POST /admin/companies/:id/rides ─────────────────────────────────────────
// Admin creates a ride on behalf of a company (assigns a driver)

const CreateRideSchema = z.object({
  driver_id:             z.string().uuid(),
  origin_address:        z.string().min(5),
  origin_lat:            z.number(),
  origin_lng:            z.number(),
  destination_address:   z.string().min(5),
  destination_lat:       z.number(),
  destination_lng:       z.number(),
  scheduled_at:          z.string(),   // ISO datetime
  base_fare:             z.number().positive(),
  available_seats:       z.number().int().min(1).max(14).default(4),
  estimated_distance_km: z.number().optional(),
  estimated_duration_min: z.number().int().optional(),
  vehicle_id:            z.string().optional(),
  trip_notes:            z.string().optional(),
})

export async function createCompanyRide(req: Request, res: Response) {
  try {
    const companyId = String(req.params.id)
    const data      = CreateRideSchema.parse(req.body)

    const company = await prisma.company.findUnique({ where: { id: companyId } })
    if (!company) { fail(res, 'Company not found'); return }

    const driver = await prisma.driverProfile.findUnique({ where: { userId: data.driver_id } })
    if (!driver) { fail(res, 'Driver not found'); return }

    const otp = () => String(Math.floor(100000 + Math.random() * 900000))

    const ride = await prisma.ride.create({
      data: {
        driverId:              data.driver_id,
        vehicleId:             data.vehicle_id ? BigInt(data.vehicle_id) : null,
        originAddress:         data.origin_address,
        originLat:             data.origin_lat,
        originLng:             data.origin_lng,
        destinationAddress:    data.destination_address,
        destinationLat:        data.destination_lat,
        destinationLng:        data.destination_lng,
        scheduledAt:           new Date(data.scheduled_at),
        baseFare:              data.base_fare,
        estimatedDistanceKm:   data.estimated_distance_km ?? null,
        estimatedDurationMin:  data.estimated_duration_min ?? null,
        availableSeats:        data.available_seats,
        tripNotes:             data.trip_notes ?? null,
        status:                'pending',
        pickupOtp:             otp(),
        dropoffOtp:            otp(),
      },
    })

    ok(res, {
      ride_id:     ride.id,
      driver_id:   ride.driverId,
      origin:      ride.originAddress,
      destination: ride.destinationAddress,
      scheduled_at: ride.scheduledAt.toISOString(),
      base_fare:   dec(ride.baseFare),
      status:      ride.status,
    }, 'Ride created')
  } catch (err) {
    serverError(res, err)
  }
}

// ─── GET /admin/drivers/available ────────────────────────────────────────────
// Returns active drivers for the "pick driver" dropdown when creating a ride

export async function listAvailableDrivers(_req: Request, res: Response) {
  try {
    const drivers = await prisma.driverProfile.findMany({
      where:   { status: 'active' },
      orderBy: { createdAt: 'desc' },
      take:    100,
      include: { user: { select: { name: true, mobile: true } } },
    })

    ok(res, drivers.map((d) => {
      const u = d as typeof d & { user: { name: string; mobile: string } }
      return {
        id:     d.userId,
        name:   u.user.name,
        mobile: u.user.mobile,
        rating: dec(d.averageRating),
        trips:  0,
      }
    }))
  } catch (err) {
    serverError(res, err)
  }
}
