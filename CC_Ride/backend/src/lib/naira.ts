import { Decimal } from '@prisma/client/runtime/library'

export const toNaira = (v: Decimal | number | string) =>
  Number(v).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const dec = (v: unknown) => Number(v ?? 0)
