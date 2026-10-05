import { STATUS_LABELS, type OperationalStatus } from '@shared/constants';
import { cn } from '../lib/utils';

const styles: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  ATTENDED: 'bg-emerald-100 text-emerald-800',
  NO_SHOW: 'bg-slate-200 text-slate-700',
  CANCELLED: 'bg-rose-100 text-rose-800',
  RESCHEDULED: 'bg-sky-100 text-sky-800',
  CLOSED: 'bg-brand-100 text-brand-800',
  OPEN: 'bg-lime-100 text-lime-800',
  CONFIRMADA: 'bg-emerald-50 text-emerald-700',
};

export function Badge({
  status,
  label,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  const text =
    label ||
    STATUS_LABELS[status as OperationalStatus] ||
    status;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
        styles[status] || 'bg-slate-100 text-slate-700',
        className
      )}
    >
      {text}
    </span>
  );
}
