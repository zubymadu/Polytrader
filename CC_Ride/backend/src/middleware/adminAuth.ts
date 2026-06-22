import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { fail } from '../lib/response'

interface AdminPayload {
  id: number; username: string; email: string; isSuperAdmin: boolean
}

declare global {
  namespace Express {
    interface Request { admin?: AdminPayload }
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) { fail(res, 'Admin authentication required', 401); return }
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET!) as AdminPayload
    if (!payload.isSuperAdmin) { fail(res, 'Super-admin access required', 403); return }
    req.admin = payload
    next()
  } catch {
    fail(res, 'Invalid or expired token', 401)
  }
}
