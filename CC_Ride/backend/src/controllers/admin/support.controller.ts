import { Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { ok, fail, serverError } from '../../lib/response'

export async function listTickets(req: Request, res: Response) {
  try {
    const { status } = req.query as Record<string, string>
    const tickets = await prisma.supportTicket.findMany({
      where: status ? { status: status as any } : {},
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      take: 100,
      include: {
        user:     { select: { name: true, email: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    })

    ok(res, tickets.map((t) => ({
      id:           t.id,
      subject:      t.subject,
      category:     t.category ?? 'general',
      user_name:    t.user.name,
      user_email:   t.user.email ?? '',
      status:       t.status,
      priority:     t.priority ?? 'medium',
      created_at:   t.createdAt.toISOString(),
      updated_at:   t.updatedAt.toISOString(),
      last_message: t.messages[0]?.body ?? t.subject,
    })))
  } catch (err) {
    serverError(res, err)
  }
}

export async function replyToTicket(req: Request, res: Response) {
  try {
    const { ticket_id, message } = req.body as { ticket_id: string; message: string }
    if (!message?.trim()) { fail(res, 'Message cannot be empty'); return }

    // SupportTicket.id is UUID (String) — no conversion needed
    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticket_id } })
    if (!ticket) { fail(res, 'Ticket not found'); return }

    await prisma.$transaction([
      prisma.supportMessage.create({
        data: {
          ticketId:   ticket_id,
          body:       message,
          senderType: 'admin',
          senderId:   'admin',
        },
      }),
      prisma.supportTicket.update({
        where: { id: ticket_id },
        data:  { status: 'in_progress', updatedAt: new Date() },
      }),
    ])

    ok(res, { ticket_id }, 'Reply sent')
  } catch (err) {
    serverError(res, err)
  }
}

export async function resolveTicket(req: Request, res: Response) {
  try {
    const { ticket_id } = req.body as { ticket_id: string }
    await prisma.supportTicket.update({
      where: { id: ticket_id },
      data:  { status: 'resolved', resolvedAt: new Date(), updatedAt: new Date() },
    })
    ok(res, { ticket_id }, 'Ticket resolved')
  } catch (err) {
    serverError(res, err)
  }
}
