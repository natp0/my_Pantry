import type { Availability } from '../types'

const LABELS: Record<Availability, string> = {
  high: 'High availability',
  low: 'Low availability',
  out: 'Out of stock',
}

const STYLES: Record<Availability, string> = {
  high: 'bg-emerald-100 text-emerald-800',
  low: 'bg-amber-100 text-amber-800',
  out: 'bg-stone-200 text-stone-600',
}

export function AvailabilityBadge({ value }: { value: Availability }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STYLES[value]}`}
    >
      {LABELS[value]}
    </span>
  )
}
