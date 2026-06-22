import { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ok, serverError } from '../../lib/response'
import { dec } from '../../lib/naira'

// ─── GET /admin/billing/invoices ─────────────────────────────────────────────
// Generates a virtual invoice per company per month from booking history

export async function listInvoices(_req: Request, res: Response) {
  try {
    // Group completed bookings by company + month
    const raw = await prisma.booking.groupBy({
      by:     ['companyId', 'createdAt'],
      where:  { companyId: { not: null }, status: { in: ['completed', 'confirmed'] } },
      _sum:   { totalAmount: true, platformCommission: true },
      _count: { id: true },
    })

    // Collapse by companyId + YYYY-MM
    const invoiceMap: Record<string, {
      company_id: string; month: string; month_label: string
      total: number; commission: number; rides: number
    }> = {}

    raw.forEach((r) => {
      const d     = r.createdAt
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const key   = `${r.companyId}__${month}`
      if (!invoiceMap[key]) {
        invoiceMap[key] = {
          company_id:  r.companyId!,
          month,
          month_label: d.toLocaleString('en-NG', { month: 'long', year: 'numeric' }),
          total:       0, commission: 0, rides: 0,
        }
      }
      invoiceMap[key].total      += Number(r._sum.totalAmount      ?? 0)
      invoiceMap[key].commission += Number(r._sum.platformCommission ?? 0)
      invoiceMap[key].rides      += r._count.id
    })

    const companyIds = [...new Set(Object.values(invoiceMap).map((i) => i.company_id))]
    const companies  = await prisma.company.findMany({
      where:  { id: { in: companyIds } },
      select: { id: true, name: true, contactEmail: true, contactName: true, commissionRate: true },
    })
    const companyMap = Object.fromEntries(companies.map((c) => [c.id, c]))

    const invoices = Object.values(invoiceMap)
      .sort((a, b) => b.month.localeCompare(a.month))
      .map((inv, i) => {
        const co = companyMap[inv.company_id]
        return {
          id:             `INV-${inv.month.replace('-', '')}-${String(i + 1).padStart(4, '0')}`,
          company_id:     inv.company_id,
          company_name:   co?.name          ?? 'Unknown',
          contact_email:  co?.contactEmail  ?? '',
          contact_name:   co?.contactName   ?? '',
          month:          inv.month,
          month_label:    inv.month_label,
          total_rides:    inv.rides,
          gross_amount:   inv.total,
          commission:     inv.commission,
          net_payable:    inv.total - inv.commission,
          status:         inv.month < new Date().toISOString().slice(0, 7) ? 'issued' : 'pending',
        }
      })

    ok(res, invoices)
  } catch (err) {
    serverError(res, err)
  }
}

// ─── GET /admin/billing/invoices/:companyId/:month ────────────────────────────
// Detailed line items for a specific company-month invoice

export async function getInvoiceDetail(req: Request, res: Response) {
  try {
    const companyId = String(req.params.companyId)
    const month     = String(req.params.month)      // YYYY-MM
    const [year, mon] = month.split('-').map(Number)
    const start = new Date(year, mon - 1, 1)
    const end   = new Date(year, mon, 1)

    const [company, bookings] = await Promise.all([
      prisma.company.findUnique({ where: { id: companyId } }),
      prisma.booking.findMany({
        where: { companyId, createdAt: { gte: start, lt: end }, status: { in: ['completed', 'confirmed'] } },
        orderBy: { createdAt: 'asc' },
        include: {
          passenger:  { select: { name: true } },
          department: { select: { name: true } },
          costCentre: { select: { name: true, code: true } },
          ride:       { select: { originAddress: true, destinationAddress: true, scheduledAt: true } },
        },
      }),
    ])

    if (!company) { ok(res, null); return }

    const totals = bookings.reduce(
      (acc, b) => ({
        gross:      acc.gross + Number(b.totalAmount),
        commission: acc.commission + Number(b.platformCommission),
        rides:      acc.rides + 1,
      }),
      { gross: 0, commission: 0, rides: 0 },
    )

    ok(res, {
      company: {
        id: company.id, name: company.name,
        contact_name: company.contactName, contact_email: company.contactEmail,
      },
      month, month_label: start.toLocaleString('en-NG', { month: 'long', year: 'numeric' }),
      summary: {
        total_rides:  totals.rides,
        gross_amount: totals.gross,
        commission:   totals.commission,
        net_payable:  totals.gross - totals.commission,
      },
      line_items: bookings.map((b) => {
        const bb = b as typeof b & { passenger: { name: string }; ride: { originAddress: string; destinationAddress: string; scheduledAt: Date }; department?: { name: string } | null; costCentre?: { name: string; code: string } | null }
        return {
          booking_id:  b.id,
          date:        bb.ride.scheduledAt.toISOString(),
          passenger:   bb.passenger.name,
          origin:      bb.ride.originAddress.split(',').slice(0, 2).join(','),
          destination: bb.ride.destinationAddress.split(',').slice(0, 2).join(','),
          department:  bb.department?.name ?? '—',
          cost_centre: bb.costCentre?.code ?? '—',
          amount:      Number(b.totalAmount),
          commission:  Number(b.platformCommission),
          status:      b.status,
        }
      }),
    })
  } catch (err) {
    serverError(res, err)
  }
}
