import { Badge } from './Badge';
import { huliAgendaStatus } from '@shared/huli';
import { toTime24h } from '@shared/time';

type NoShowAppointment = {
  id: string;
  startTime: string;
  patientName: string;
  sourceStatus?: string | null;
  attendanceConfirmation?: string | null;
  operationalStatus: string;
};

export function NoShowSection<T extends NoShowAppointment>({
  items,
  detail,
  canAttend,
  isLocked,
  onSelect,
  className = '',
}: {
  items: T[];
  detail: (item: T) => string;
  canAttend: (item: T) => boolean;
  isLocked: (item: T) => boolean;
  onSelect: (item: T) => void;
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <section className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border-2 border-slate-300 bg-white shadow-soft ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-100 px-3 py-3">
        <div>
          <h2 className="font-semibold text-slate-900">No se presentaron</h2>
          <p className="text-xs text-slate-600">
            Salieron de la agenda. Si llega el paciente, tócalo para capturar.
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-700">{items.length}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {items.map((item) => {
          const attend = canAttend(item);
          const locked = isLocked(item);
          const huli = huliAgendaStatus(item.sourceStatus, item.attendanceConfirmation, item.operationalStatus);
          return (
            <button
              key={item.id}
              type="button"
              disabled={!attend}
              className="flex w-full items-center gap-3 border-t border-slate-100 px-3 py-2.5 text-left enabled:hover:bg-slate-50 disabled:cursor-default"
              onClick={() => onSelect(item)}
            >
              <span className="w-14 shrink-0 text-base font-semibold tabular-nums text-slate-700">{toTime24h(item.startTime)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{item.patientName || '—'}</span>
                <span className="block truncate text-xs text-slate-500">{detail(item) || 'Sin notas'}</span>
              </span>
              {huli && <Badge status={huli.status} label={huli.label} className="shrink-0" />}
              {attend ? (
                <span className="btn-secondary shrink-0 px-3 py-1.5">Atender</span>
              ) : locked ? (
                <span className="shrink-0 text-xs font-semibold text-brand-700">Cerrado</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
