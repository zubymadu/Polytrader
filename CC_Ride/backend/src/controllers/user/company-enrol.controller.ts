/**
 * User — self-service company enrolment & cost-centre management
 *
 * Allows a user to:
 *   1. Search for their company by name / email domain
 *   2. Request to join a company (creates CompanyEmployee with pending status)
 *   3. Update their department and cost centre once enrolled
 *   4. View their current enrolment profile
 */
import { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ok, fail, serverError } from '../../lib/response'

// ─── GET /user/companies/search?q= ───────────────────────────────────────────

export async function searchCompanies(req: Request, res: Response) {
  try {
    const q = String(req.query.q ?? '').trim()
    if (q.length < 2) { ok(res, []); return }

    const companies = await prisma.company.findMany({
      where: {
        status: 'active',
        OR: [
          { name:         { contains: q, mode: 'insensitive' } },
          { contactEmail: { contains: q, mode: 'insensitive' } },
          { industry:     { contains: q, mode: 'insensitive' } },
        ],
      },
      take:    10,
      select:  { id: true, name: true, industry: true, city: true, logoUrl: true },
    })

    ok(res, companies.map((c) => ({
      id:       c.id,
      name:     c.name,
      industry: c.industry ?? '',
      city:     c.city ?? '',
      logo_url: c.logoUrl ?? null,
    })))
  } catch (err) {
    serverError(res, err)
  }
}

// ─── GET /user/companies/:id/departments ─────────────────────────────────────

export async function getCompanyDepartments(req: Request, res: Response) {
  try {
    const companyId = String(req.params.id)

    const company = await prisma.company.findUnique({
      where:  { id: companyId, status: 'active' },
      select: { id: true, name: true },
    })
    if (!company) { fail(res, 'Company not found or inactive'); return }

    const [depts, costCentres] = await Promise.all([
      prisma.department.findMany({
        where:   { companyId, isActive: true },
        orderBy: { name: 'asc' },
        select:  { id: true, name: true, code: true },
      }),
      prisma.costCentre.findMany({
        where:   { companyId, isActive: true },
        orderBy: { name: 'asc' },
        select:  { id: true, name: true, code: true, departmentId: true },
      }),
    ])

    ok(res, {
      company: { id: company.id, name: company.name },
      departments: depts.map((d) => ({ id: d.id.toString(), name: d.name, code: d.code ?? '' })),
      cost_centres: costCentres.map((c) => ({
        id:            c.id.toString(),
        name:          c.name,
        code:          c.code,
        department_id: c.departmentId?.toString() ?? null,
      })),
    })
  } catch (err) {
    serverError(res, err)
  }
}

// ─── POST /user/companies/join ────────────────────────────────────────────────
//
// User requests to join a company. If the company has auto-join enabled (not yet
// implemented) the employee record is activated immediately. Otherwise it stays
// inactive until a company admin approves it via the corporate employees panel.

const JoinSchema = z.object({
  company_id:     z.string().uuid(),
  department_id:  z.string().optional(),
  cost_centre_id: z.string().optional(),
  employee_number: z.string().optional(),
  job_title:      z.string().optional(),
})

export async function joinCompany(req: Request, res: Response) {
  try {
    const userId = req.user.id
    const data   = JoinSchema.parse(req.body)

    const company = await prisma.company.findUnique({
      where:  { id: data.company_id, status: 'active' },
      select: { id: true, name: true },
    })
    if (!company) { fail(res, 'Company not found or not accepting enrolments'); return }

    // Already a member?
    const existing = await prisma.companyEmployee.findFirst({
      where: { companyId: data.company_id, userId },
    })
    if (existing) {
      if (existing.isActive) {
        fail(res, `You are already enrolled in ${company.name}`); return
      }
      // Re-activate if previously deactivated
      await prisma.companyEmployee.update({
        where: { id: existing.id },
        data:  {
          isActive:      true,
          joinedAt:      new Date(),
          departmentId:  data.department_id ? BigInt(data.department_id) : existing.departmentId,
          costCentreId:  data.cost_centre_id ? BigInt(data.cost_centre_id) : existing.costCentreId,
        },
      })
      ok(res, { status: 'reactivated', company_name: company.name }, `Re-enrolled in ${company.name}`)
      return
    }

    await prisma.companyEmployee.create({
      data: {
        companyId:      data.company_id,
        userId,
        departmentId:   data.department_id ? BigInt(data.department_id) : null,
        costCentreId:   data.cost_centre_id ? BigInt(data.cost_centre_id) : null,
        employeeNumber: data.employee_number ?? null,
        jobTitle:       data.job_title ?? null,
        role:           'employee',
        isActive:       true,    // auto-activate on join (company admin can deactivate)
        joinedAt:       new Date(),
      },
    })

    ok(res, { status: 'enrolled', company_name: company.name }, `Successfully enrolled in ${company.name}`)
  } catch (err) {
    serverError(res, err)
  }
}

// ─── PUT /user/company-profile ────────────────────────────────────────────────
//
// User updates their department / cost centre after joining.
// This directly affects which cost centre gets charged for their rides.

const UpdateProfileSchema = z.object({
  department_id:  z.string().optional(),
  cost_centre_id: z.string().optional(),
  job_title:      z.string().optional(),
  employee_number: z.string().optional(),
})

export async function updateCompanyProfile(req: Request, res: Response) {
  try {
    const userId = req.user.id
    const data   = UpdateProfileSchema.parse(req.body)

    const employee = await prisma.companyEmployee.findFirst({
      where:   { userId, isActive: true },
      include: { company: { select: { name: true } }, department: { select: { name: true } }, costCentre: { select: { name: true, code: true } } },
    })
    if (!employee) { fail(res, 'You are not enrolled in any company'); return }

    // If switching cost centre, verify it belongs to same company
    if (data.cost_centre_id) {
      const cc = await prisma.costCentre.findFirst({
        where: { id: BigInt(data.cost_centre_id), companyId: employee.companyId, isActive: true },
      })
      if (!cc) { fail(res, 'Invalid cost centre'); return }
    }

    if (data.department_id) {
      const dept = await prisma.department.findFirst({
        where: { id: BigInt(data.department_id), companyId: employee.companyId, isActive: true },
      })
      if (!dept) { fail(res, 'Invalid department'); return }
    }

    const updated = await prisma.companyEmployee.update({
      where: { id: employee.id },
      data:  {
        ...(data.department_id  ? { departmentId:  BigInt(data.department_id) }  : {}),
        ...(data.cost_centre_id ? { costCentreId:  BigInt(data.cost_centre_id) } : {}),
        ...(data.job_title      ? { jobTitle:       data.job_title }              : {}),
        ...(data.employee_number ? { employeeNumber: data.employee_number }       : {}),
      },
      include: {
        department: { select: { name: true } },
        costCentre: { select: { name: true, code: true } },
      },
    })

    const ue = updated as typeof updated & {
      department: { name: string } | null
      costCentre: { name: string; code: string } | null
    }

    ok(res, {
      company_id:         employee.companyId,
      company_name:       (employee as any).company?.name,
      department_id:      updated.departmentId?.toString() ?? null,
      department_name:    ue.department?.name ?? null,
      cost_centre_id:     updated.costCentreId?.toString() ?? null,
      cost_centre_name:   ue.costCentre?.name ?? null,
      cost_centre_code:   ue.costCentre?.code ?? null,
      job_title:          updated.jobTitle ?? null,
      employee_number:    updated.employeeNumber ?? null,
    }, 'Company profile updated')
  } catch (err) {
    serverError(res, err)
  }
}

// ─── GET /user/company-profile ────────────────────────────────────────────────

export async function getMyCompanyProfile(req: Request, res: Response) {
  try {
    const userId  = req.user.id
    const employee = await prisma.companyEmployee.findFirst({
      where:   { userId, isActive: true },
      include: {
        company:    { select: { id: true, name: true, logoUrl: true, status: true } },
        department: { select: { id: true, name: true } },
        costCentre: { select: { id: true, name: true, code: true } },
      },
    })

    if (!employee) {
      ok(res, null, 'Not enrolled in any company')
      return
    }

    const e = employee as typeof employee & {
      company:    { id: string; name: string; logoUrl: string | null; status: string }
      department: { id: bigint; name: string } | null
      costCentre: { id: bigint; name: string; code: string } | null
    }

    ok(res, {
      company_id:       e.company.id,
      company_name:     e.company.name,
      company_logo:     e.company.logoUrl ?? null,
      company_status:   e.company.status,
      role:             e.role,
      employee_number:  e.employeeNumber ?? null,
      job_title:        e.jobTitle ?? null,
      department_id:    e.department?.id.toString() ?? null,
      department_name:  e.department?.name ?? null,
      cost_centre_id:   e.costCentre?.id.toString() ?? null,
      cost_centre_name: e.costCentre?.name ?? null,
      cost_centre_code: e.costCentre?.code ?? null,
      joined_at:        (e.joinedAt ?? e.invitedAt).toISOString(),
    })
  } catch (err) {
    serverError(res, err)
  }
}

// ─── POST /user/companies/leave ───────────────────────────────────────────────

export async function leaveCompany(req: Request, res: Response) {
  try {
    const userId   = req.user.id
    const employee = await prisma.companyEmployee.findFirst({ where: { userId, isActive: true } })
    if (!employee) { fail(res, 'Not enrolled in any company'); return }

    await prisma.companyEmployee.update({
      where: { id: employee.id },
      data:  { isActive: false, deactivatedAt: new Date() },
    })

    ok(res, { status: 'left' }, 'Left company successfully')
  } catch (err) {
    serverError(res, err)
  }
}
