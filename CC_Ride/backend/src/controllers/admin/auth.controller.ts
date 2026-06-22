import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../../lib/prisma'
import { ok, fail, serverError } from '../../lib/response'

export async function adminLogin(req: Request, res: Response) {
  try {
    const { username, password } = req.body as { username: string; password: string }
    if (!username || !password) { fail(res, 'Username and password required'); return }

    const admin = await prisma.adminUser.findFirst({
      where: { OR: [{ username }, { email: username }] },
    })
    if (!admin) { fail(res, 'Invalid credentials'); return }

    const valid = await bcrypt.compare(password, admin.passwordHash)
    if (!valid) { fail(res, 'Invalid credentials'); return }

    if (!admin.isActive) { fail(res, 'Account disabled'); return }

    const adminId = admin.id.toString()

    const token = jwt.sign(
      { id: adminId, username: admin.username, email: admin.email, isSuperAdmin: admin.isSuperAdmin },
      process.env.JWT_SECRET!,
      { expiresIn: '12h' },
    )

    await prisma.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } })

    ok(res, {
      token,
      admin: { id: adminId, username: admin.username, email: admin.email, isSuperAdmin: admin.isSuperAdmin },
    })
  } catch (err) {
    serverError(res, err)
  }
}
