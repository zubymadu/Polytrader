import { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ok, fail, serverError } from '../../lib/response'
import { dec } from '../../lib/naira'
import crypto from 'crypto'
import nodemailer from 'nodemailer'

// ─── GET /corporate/employee/profile ─────────────────────────────────────────

export async function getEmployeeProfile(req: Request, res: Response) {
  try {
    const userId    = req.user.id
    const companyId = (req.query.company_id as string) || ''

    const membership = await prisma.companyEmployee.findFirst({
      where: { userId, companyId, isActive: true },
      include: {
        company:    { select: { name: true } },
        department: { select: { id: true, name: true } },
        costCentre: { select: { id: true, name: true, code: true } },
      },
    })

    if (!membership) {
      fail(res, 'Not a member of this company')
      return
    }

    // Monthly spend for this employee
    const now        = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const spentThisMonth = await prisma.budgetTransaction.aggregate({
      where: { employeeId: userId, transactedAt: { gte: monthStart } },
      _sum: { amount: true },
    })

    // All cost centres for employee's dept (for selector in app)
    const costCentres = await prisma.costCentre.findMany({
      where: {
        companyId,
        ...(membership.departmentId ? { departmentId: membership.departmentId } : {}),
        isActive: true,
      },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    })

    ok(res, {
      company_id:          companyId,
      company_name:        membership.company.name,
      department_id:       membership.departmentId?.toString() ?? '',
      department:          membership.department?.name ?? '',
      cost_centre_id:      membership.costCentreId?.toString() ?? '',
      cost_centre:         membership.costCentre?.name ?? '',
      role:                membership.role,
      job_title:           membership.jobTitle ?? '',
      monthly_spend_limit: dec(membership.monthlySpendLimit),
      monthly_spent:       dec(spentThisMonth._sum.amount),
      cost_centres:        costCentres.map((c) => ({
        id:   c.id.toString(),
        name: c.name,
        code: c.code,
      })),
    })
  } catch (err) {
    serverError(res, err)
  }
}

// ─── GET /corporate/employees ─────────────────────────────────────────────────

export async function listEmployees(req: Request, res: Response) {
  try {
    const companyId = req.companyId!

    const members = await prisma.companyEmployee.findMany({
      where:   { companyId },
      orderBy: { invitedAt: 'desc' },
      include: {
        user:       { select: { name: true, email: true, mobile: true, profilePicUrl: true } },
        department: { select: { name: true } },
        costCentre: { select: { name: true } },
      },
    })

    ok(res, members.map((m) => ({
      id:                   m.id.toString(),
      user_id:              m.userId,
      name:                 m.user.name,
      email:                m.user.email ?? '',
      mobile:               m.user.mobile,
      profile_pic:          m.user.profilePicUrl ?? '',
      department:           m.department?.name ?? '',
      department_id:        m.departmentId?.toString() ?? '',
      cost_centre:          m.costCentre?.name ?? '',
      role:                 m.role,
      job_title:            m.jobTitle ?? '',
      monthly_spend_limit:  dec(m.monthlySpendLimit),
      is_active:            m.isActive,
      joined_at:            m.joinedAt?.toISOString() ?? '',
    })))
  } catch (err) {
    serverError(res, err)
  }
}

// ─── GET /corporate/departments ───────────────────────────────────────────────

export async function listDepartments(req: Request, res: Response) {
  try {
    const companyId = req.companyId ?? (req.query.company_id as string)

    const depts = await prisma.department.findMany({
      where:   { companyId, isActive: true },
      orderBy: { name: 'asc' },
    })

    ok(res, depts.map((d) => ({
      id:   d.id.toString(),
      name: d.name,
      code: d.code ?? '',
    })))
  } catch (err) {
    serverError(res, err)
  }
}

// ─── POST /corporate/employees/invite ────────────────────────────────────────

const InviteSchema = z.object({
  company_id:    z.string().uuid(),
  name:          z.string().min(2),
  email:         z.string().email(),
  department_id: z.string().optional(),
  role:          z.enum(['employee', 'manager', 'company_admin', 'company_finance', 'company_hr']).default('employee'),
})

export async function inviteEmployee(req: Request, res: Response) {
  try {
    const data       = InviteSchema.parse(req.body)
    const companyId  = req.companyId!

    // Check if user exists
    let user = await prisma.user.findFirst({
      where: { email: data.email },
    })

    // Create stub user if email not registered yet
    if (!user) {
      const tempPassword = crypto.randomBytes(16).toString('hex')
      const bcrypt = await import('bcryptjs')
      user = await prisma.user.create({
        data: {
          name:         data.name,
          email:        data.email,
          mobile:       '',
          countryCode:  '+234',
          passwordHash: await bcrypt.hash(tempPassword, 12),
          status:       'pending_verification',
          referralCode: crypto.randomBytes(4).toString('hex').toUpperCase(),
        },
      })
    }

    // Check not already a member
    const existing = await prisma.companyEmployee.findFirst({
      where: { companyId, userId: user.id },
    })
    if (existing) {
      fail(res, existing.isActive ? 'Employee already in company' : 'Employee was deactivated — reactivate instead')
      return
    }

    // Validate department if provided
    let deptId: bigint | null = null
    if (data.department_id) {
      const dept = await prisma.department.findFirst({
        where: { id: BigInt(data.department_id), companyId },
      })
      if (!dept) { fail(res, 'Department not found'); return }
      deptId = dept.id
    }

    await prisma.companyEmployee.create({
      data: {
        companyId,
        userId:       user.id,
        departmentId: deptId,
        role:         data.role as any,
        isActive:     true,
      },
    })

    // Send invitation email (fire-and-forget)
    _sendInviteEmail(data.email, data.name, companyId).catch(console.error)

    ok(res, { user_id: user.id }, 'Invitation sent successfully')
  } catch (err) {
    serverError(res, err)
  }
}

// ─── POST /corporate/employees/deactivate ────────────────────────────────────

export async function deactivateEmployee(req: Request, res: Response) {
  try {
    const { company_id: _cid, employee_id } = req.body as { company_id: string; employee_id: string }
    const companyId = req.companyId!

    const membership = await prisma.companyEmployee.findFirst({
      where: { id: BigInt(employee_id), companyId },
    })
    if (!membership) { fail(res, 'Employee not found'); return }

    await prisma.companyEmployee.update({
      where:  { id: membership.id },
      data:   { isActive: false, deactivatedAt: new Date() },
    })

    ok(res, { employee_id }, 'Employee deactivated')
  } catch (err) {
    serverError(res, err)
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function _sendInviteEmail(email: string, name: string, companyId: string) {
  if (!process.env.SMTP_HOST) return

  const settings = await prisma.platformSettings.findUnique({ where: { id: 1 } })
  const company  = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } })

  const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   Number(process.env.SMTP_PORT ?? 587),
    auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })

  await transporter.sendMail({
    from:    `"${settings?.appName ?? 'CC Ride'}" <${process.env.SMTP_FROM ?? 'noreply@ccride.ng'}>`,
    to:      email,
    subject: `You've been invited to ${company?.name ?? 'a company'} on CC Ride`,
    html:    `<p>Hi ${name},</p><p>You have been added to ${company?.name} on CC Ride. Download the app to get started.</p>`,
  })
}
