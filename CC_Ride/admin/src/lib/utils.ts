import { format, formatDistanceToNow } from 'date-fns'
import clsx, { ClassValue } from 'clsx'

export const cn = (...inputs: ClassValue[]) => clsx(inputs)

export const fmt = {
  naira: (n: number) =>
    '₦' + n.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),

  date: (d: string | Date) => format(new Date(d), 'dd MMM yyyy'),

  datetime: (d: string | Date) => format(new Date(d), 'dd MMM yyyy, h:mm a'),

  relative: (d: string | Date) => formatDistanceToNow(new Date(d), { addSuffix: true }),

  percent: (n: number) => `${n.toFixed(1)}%`,
}

export const statusColor: Record<string, string> = {
  active:              'bg-green-100 text-green-700',
  approved:            'bg-green-100 text-green-700',
  completed:           'bg-green-100 text-green-700',
  confirmed:           'bg-blue-100 text-blue-700',
  pending:             'bg-yellow-100 text-yellow-700',
  pending_verification:'bg-yellow-100 text-yellow-700',
  pending_approval:    'bg-yellow-100 text-yellow-700',
  in_progress:         'bg-blue-100 text-blue-700',
  suspended:           'bg-orange-100 text-orange-700',
  cancelled:           'bg-red-100 text-red-700',
  rejected:            'bg-red-100 text-red-700',
  banned:              'bg-red-100 text-red-700',
  inactive:            'bg-gray-100 text-gray-500',
  offline:             'bg-gray-100 text-gray-500',
  open:                'bg-blue-100 text-blue-700',
  resolved:            'bg-green-100 text-green-700',
  closed:              'bg-gray-100 text-gray-500',
}

export const badge = (status: string) =>
  `badge ${statusColor[status] ?? 'bg-gray-100 text-gray-600'}`
