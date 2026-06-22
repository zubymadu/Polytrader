import { Response } from 'express'

// Flutter app expects: { Result: "true"|"false", ResponseMsg: "...", data?: any }

export function ok(res: Response, data: unknown, msg = 'Success') {
  return res.json({ Result: 'true', ResponseMsg: msg, data })
}

export function fail(res: Response, msg: string, status = 200) {
  // Return 200 with Result:"false" so Flutter catches it cleanly
  return res.status(status).json({ Result: 'false', ResponseMsg: msg })
}

export function serverError(res: Response, err: unknown) {
  const message = err instanceof Error ? err.message : 'Unexpected error'
  console.error('[API Error]', err)
  return res.status(500).json({ Result: 'false', ResponseMsg: message })
}
