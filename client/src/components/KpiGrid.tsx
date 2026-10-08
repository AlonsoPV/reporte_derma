import { formatMoney } from '../lib/utils';

export function KpiGrid({
  items,
}: {
  items: Array<{ label: string; value: string | number; accent?: string }>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))]">
      {items.map((item) => (
        <div key={item.label} className="card px-3 py-2.5">
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{item.label}</div>
          <div className={`mt-0.5 truncate text-lg font-semibold leading-tight sm:text-xl ${item.accent || 'text-ink'}`}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

export function money(n: number) {
  return formatMoney(n);
}
