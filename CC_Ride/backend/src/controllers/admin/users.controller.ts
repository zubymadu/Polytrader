import { Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { ok, fail, serverError } from '../../lib/response'
import { dec } from '../../lib/naira'

export async function listUsers(req: Request, res: Response) {
  try {
    const { search, status } = req.query as Record<string, string>
    const users = await prisma.user.findMany({
      where: {
        ...(status ? { status: status as any } : {}),
        ...(search ? {
          OR: [
            { name:   { contains: search, mode: 'insensitive' } },
            { email:  { contains: search, mode: 'insensitive' } },
            { mobile: { contains: search } },
          ],
        } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        driverProfile: { select: { userId: true } },  // PK is userId
        _count:        { select: { bookings: true } },
      },
    })

    ok(res, users.map((u) => ({
      id:             u.id,
      name:           u.name,
      email:          u.email ?? '',
      mobile:         u.mobile,
      wallet_balance: dec(u.walletBalance),  // walletBalance lives on User directly
      is_driver:      !!u.driverProfile,
      status:         u.status,
      created_at:     u.createdAt.toISOString(),
      total_bookings: u._count.bookings,
    })))
  } catch (err) {
    serverError(res, err)
  }
}

export async function userAction(req: Request, res: Response) {
  try {
    const { user_id, action } = req.body as { user_id: string; action: 'suspend' | 'ban' | 'activate' }
    const statusMap = { suspend: 'suspended', ban: 'banned', activate: 'active' } as const
    const newStatus = statusMap[action]
    if (!newStatus) { fail(res, 'Invalid action'); return }

    await prisma.user.update({ where: { id: user_id }, data: { status: newStatus } })
    ok(res, { user_id, status: newStatus }, `User ${action}d`)
  } catch (err) {
    serverError(res, err)
  }
}
