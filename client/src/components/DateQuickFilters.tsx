import {
  cn,
  detectDatePreset,
  resolveDatePreset,
  type DatePreset,
} from '../lib/utils';

const RANGE_PRESETS: Array<{ id: DatePreset; label: string }> = [
  { id: 'today', label: 'Hoy' },
  { id: 'yesterday', label: 'Ayer' },
  { id: 'week', label: '7 días' },
  { id: 'month', label: 'Mes' },
];

const SINGLE_PRESETS: Array<{ id: DatePreset; label: string }> = [
  { id: 'today', label: 'Hoy' },
  { id: 'yesterday', label: 'Ayer' },
];

type RangeProps = {
  mode?: 'range';
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  className?: string;
};

type SingleProps = {
  mode: 'single';
  date: string;
  onChange: (date: string) => void;
  className?: string;
};

type Props = RangeProps | SingleProps;

export function DateQuickFilters(props: Props) {
  const presets = props.mode === 'single' ? SINGLE_PRESETS : RANGE_PRESETS;
  const active =
    props.mode === 'single'
      ? detectDatePreset(props.date, props.date)
      : detectDatePreset(props.from, props.to);

  return (
    <div
      className={cn(
        'inline-flex rounded-xl border border-slate-200 bg-slate-50/80 p-1',
        props.className
      )}
      role="group"
      aria-label="Filtros rápidos de fecha"
    >
      {presets.map((preset) => {
        const isActive = active === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition',
              isActive
                ? 'bg-white text-brand-800 shadow-sm'
                : 'text-slate-500 hover:text-ink'
            )}
            onClick={() => {
              const range = resolveDatePreset(preset.id);
              if (props.mode === 'single') {
                props.onChange(range.from);
              } else {
                props.onChange(range);
              }
            }}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}
