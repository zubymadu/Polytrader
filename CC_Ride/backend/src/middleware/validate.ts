import { Request, Response, NextFunction } from 'express'
import { ZodSchema, ZodError } from 'zod'
import { fail } from '../lib/response'

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse({ ...req.body, ...req.query, ...req.params })
    if (!result.success) {
      const msg = (result.error as ZodError).errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ')
      fail(res, msg)
      return
    }
    req.body = { ...req.body, ...result.data }
    next()
  }
}
