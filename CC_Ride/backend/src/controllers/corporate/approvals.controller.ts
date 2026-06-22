import { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ok, fail, serverError } from '../../lib/response'
import { dec } from '../../lib/naira'

// ─── GET /corporate/approvals ─────────────────────────────────────────────────

export async function listApprovals(req: Request, res: Response) {
  try {
    const companyId  = req.companyId!
    const approverId = (req.query.approver_id as string) || req.user.id

    const approvals = await prisma.approvalRequest.findMany({
      where: {
        workflow: { companyId },
        approverId,
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        requester: { select: { name: true, profilePicUrl: true } },
        booking: {
          include: {
            department: { select: { name: true } },
          },
        },
      },
    })

    ok(res, approvals.map((a) => ({
      id:                 a.id.toString(),
      booking_id:         a.bookingId,
      requester_name:     a.requester.name,
      requester_pic:      a.requester.profilePicUrl ?? '',
      requester_dept:     a.booking.department?.name ?? '',
      origin_address:     a.originAddress,
      destination_address: a.destinationAddress,
      estimated_fare:     dec(a.estimatedFare),
      scheduled_at:       a.scheduledAt.toISOString(),
      status:             a.status,
      decision_note:      a.decisionNote ?? null,
      expires_at:         a.expiresAt.toISOString(),
      created_at:         a.createdAt.toISOString(),
    })))
  } catch (err) {
    serverError(res, err)
  }
}

// ─── POST /corporate/approvals/decide ────────────────────────────────────────

const DecideSchema = z.object({
  approval_id:   z.string(),
  action:        z.enum(['approved', 'rejected']),
  decision_note: z.string().optional().default(''),
  approver_id:   z.string().uuid(),
})

export async function decideApproval(req: Request, res: Response) {
  try {
    const data      = DecideSchema.parse(req.body)
    const companyId = req.companyId!

    const approval = await prisma.approvalRequest.findFirst({
      where: {
        id:        BigInt(data.approval_id),
        workflow:  { companyId },
        approverId: data.approver_id,
        status:    'pending',
      },
      include: { booking: true },
    })

    if (!approval) {
      fail(res, 'Approval request not found or already decided')
      return
    }

    if (new Date() > approval.expiresAt) {
      fail(res, 'This approval request has expired')
      return
    }

    // Update approval record and booking status in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.approvalRequest.update({
        where: { id: approval.id },
        data: {
          status:       data.action as any,
          decisionNote: data.decision_note,
          decidedAt:    new Date(),
          approverId:   data.approver_id,
        },
      })

      // Mirror decision to the booking
      await tx.booking.update({
        where: { id: approval.bookingId },
        data: {
          status: data.action === 'approved' ? 'confirmed' : 'cancelled',
          ...(data.action === 'approved' ? { confirmedAt: new Date() } : { cancelledAt: new Date(), cancellationReason: data.decision_note }),
        },
      })
    })

    // TODO: Push notification to requester via Firebase

    ok(res, { approval_id: data.approval_id, action: data.action },
      data.action === 'approved' ? 'Ride approved' : 'Ride rejected')
  } catch (err) {
    serverError(res, err)
  }
}
