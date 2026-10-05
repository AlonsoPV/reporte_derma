import { formatMoney } from '../lib/utils';

export function KpiGrid({
  items,
}: {
  items: Array<{ label: string; value: string | number; accent?: string }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {items.map((item) => (
        <div key={item.label} className="card p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{item.label}</div>
          <div className={`mt-2 text-2xl font-semibold ${item.accent || 'text-ink'}`}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

export function money(n: number) {
  return formatMoney(n);
}
