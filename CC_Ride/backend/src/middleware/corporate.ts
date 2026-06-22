import { Request, Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma'
import { fail } from '../lib/response'

/**
 * Verifies that req.user is an active member of the company identified by
 * req.query.company_id or req.body.company_id, then sets req.companyId and
 * req.employeeRole so downstream handlers don't repeat the lookup.
 *
 * Also applies PostgreSQL Row-Level Security by setting the session variable
 * app.company_id before every query in the request.
 */
export async function requireCompanyMember(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const companyId =
    (req.query.company_id as string) ||
    (req.body?.company_id as string) ||
    ''

  if (!companyId) {
    fail(res, 'company_id is required')
    return
  }

  try {
    const membership = await prisma.companyEmployee.findFirst({
      where: {
        companyId,
        userId: req.user.id,
        isActive: true,
      },
      select: { role: true, companyId: true },
    })

    if (!membership) {
      fail(res, 'You are not a member of this company', 403)
      return
    }

    req.companyId     = membership.companyId
    req.employeeRole  = membership.role

    // Set RLS session variable so Postgres policies enforce company isolation.
    // We use $executeRaw; it runs within the same connection pool slot.
    await prisma.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`

    next()
  } catch (err) {
    console.error('[corporate middleware]', err)
    fail(res, 'Authorization check failed', 500)
  }
}

/** Only company_admin or company_finance may call this route. */
export function requireAdminRole(req: Request, res: Response, next: NextFunction) {
  const adminRoles = ['company_admin', 'company_finance', 'company_hr']
  if (!adminRoles.includes(req.employeeRole ?? '')) {
    fail(res, 'Insufficient permissions', 403)
    return
  }
  next()
}

/** Only company_admin or manager may approve rides. */
export function requireApproverRole(req: Request, res: Response, next: NextFunction) {
  const approverRoles = ['company_admin', 'manager']
  if (!approverRoles.includes(req.employeeRole ?? '')) {
    fail(res, 'Only managers can approve ride requests', 403)
    return
  }
  next()
}
