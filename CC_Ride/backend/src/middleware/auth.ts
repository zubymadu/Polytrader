import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { fail } from '../lib/response'

export interface AuthUser {
  id: string
  email: string | null
  isDriver: boolean
}

declare global {
  namespace Express {
    interface Request {
      user: AuthUser
      companyId?: string
      employeeRole?: string
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    fail(res, 'Authentication required', 401)
    return
  }

  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthUser
    req.user = payload
    next()
  } catch {
    fail(res, 'Invalid or expired token', 401)
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET!) as AuthUser
      req.user = payload
    } catch { /* ignore */ }
  }
  next()
}
