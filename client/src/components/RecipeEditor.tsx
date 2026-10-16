import { useMemo, useState } from 'react';
import { RECIPE_CATALOG, findRecipeProduct, productsInCategory } from '@shared/recipes';

export type RecipeLine = {
  id: string;
  category: string;
  productName: string;
  usage: string;
  recommendation: string;
};

export type RecipeContext = {
  patientName: string;
  phone?: string | null;
  doctorName?: string | null;
  dateLabel: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function whatsappUrl(phone: string | null | undefined, text: string) {
  const digits = (phone || '').replace(/\D/g, '');
  const normalized = digits.length === 10 ? `52${digits}` : digits;
  const base = normalized ? `https://wa.me/${normalized}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(text)}`;
}

function recipeMessage(context: RecipeContext, lines: RecipeLine[]) {
  const blocks = lines.map((line) => (
    `${line.category} — ${line.productName}\nUso: ${line.usage}\n${line.recommendation}`
  ));
  return [
    `Recomendaciones para ${context.patientName || 'paciente'}`,
    context.dateLabel,
    context.doctorName ? `Doctora: ${context.doctorName}` : '',
    '',
    blocks.join('\n\n'),
  ].filter((part) => part !== '').join('\n');
}

function printRecipe(context: RecipeContext, lines: RecipeLine[]) {
  const items = lines.map((line) => `
    <article>
      <p class="category">${escapeHtml(line.category)}</p>
      <h2>${escapeHtml(line.productName)}</h2>
      <p><strong>Forma de uso.</strong> ${escapeHtml(line.usage)}</p>
      <p>${escapeHtml(line.recommendation)}</p>
    </article>
  `).join('');
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Receta ${escapeHtml(context.patientName || 'paciente')}</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; color: #1c2b33; margin: 32px; }
    header { border-bottom: 2px solid #1f6f6a; padding-bottom: 12px; margin-bottom: 20px; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    .meta { margin: 0; font-size: 14px; line-height: 1.5; }
    article { break-inside: avoid; margin: 0 0 16px; }
    .category { margin: 0; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #5c6b73; }
    h2 { margin: 2px 0 6px; font-size: 16px; }
    p { margin: 0 0 6px; font-size: 14px; line-height: 1.45; }
  </style>
</head>
<body>
  <header>
    <h1>Recomendaciones</h1>
    <p class="meta">Paciente: ${escapeHtml(context.patientName || '—')}<br />
    Fecha: ${escapeHtml(context.dateLabel)}${context.doctorName ? `<br />Doctora: ${escapeHtml(context.doctorName)}` : ''}</p>
  </header>
  ${items}
</body>
</html>`;
  const frame = document.createElement('iframe');
  frame.setAttribute('title', 'Receta');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const run = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 1000);
  };
  if (frame.contentWindow?.document.readyState === 'complete') run();
  else frame.onload = run;
}

export function RecipeEditor({
  lines,
  onChange,
  context,
}: {
  lines: RecipeLine[];
  onChange: (lines: RecipeLine[]) => void;
  context: RecipeContext;
}) {
  const [category, setCategory] = useState('');
  const [productName, setProductName] = useState('');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const products = useMemo(() => productsInCategory(category), [category]);

  const chooseCategory = (next: string) => {
    setCategory(next);
    setProductName('');
    setError('');
  };

  const chooseProduct = (next: string) => {
    setProductName(next);
    setError('');
  };

  const updateLine = (id: string, patch: Partial<Pick<RecipeLine, 'usage' | 'recommendation'>>) => {
    onChange(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  };

  const add = () => {
    const product = findRecipeProduct(category, productName);
    if (!category || !product) {
      setError('Elige categoría y producto.');
      return;
    }
    if (lines.some((line) => line.category === category && line.productName === product.name)) {
      setError('Ese producto ya está en la receta.');
      return;
    }
    onChange([
      ...lines,
      {
        id: crypto.randomUUID(),
        category,
        productName: product.name,
        usage: product.usage,
        recommendation: product.recommendation,
      },
    ]);
    setProductName('');
    setError('');
  };

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 p-3">
      <div>
        <div className="text-sm font-semibold text-ink">Receta</div>
        <p className="text-xs text-slate-500">Opcional. El producto trae su uso y su recomendación. Se ajustan después de agregarlo.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Categoría</label>
          <select className="input" value={category} onChange={(e) => chooseCategory(e.target.value)}>
            <option value="">Seleccionar…</option>
            {RECIPE_CATALOG.map((entry) => (
              <option key={entry.category} value={entry.category}>{entry.category}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Producto</label>
          <select className="input" value={productName} onChange={(e) => chooseProduct(e.target.value)} disabled={!category}>
            <option value="">Seleccionar…</option>
            {products.map((product) => (
              <option key={product.name} value={product.name}>{product.name}</option>
            ))}
          </select>
        </div>
      </div>
      {error && <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
      <button type="button" className="btn-secondary w-full" onClick={add}>
        Agregar a la receta
      </button>

      {lines.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-3 py-3">
            <h3 className="font-display text-lg font-semibold">Recomendaciones</h3>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              <span className="block truncate">{context.patientName || 'Paciente sin nombre'}</span>
              <span className="block">{context.dateLabel}</span>
              {context.doctorName ? <span className="block truncate">{context.doctorName}</span> : null}
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {lines.map((line) => {
              const editing = editingId === line.id;
              return (
                <div key={line.id} className="px-3 py-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{line.category}</div>
                      <div className="truncate font-semibold leading-5">{line.productName}</div>
                    </div>
                    <button
                      type="button"
                      className="btn-ghost shrink-0 whitespace-nowrap px-2 py-1 text-xs"
                      onClick={() => setEditingId(editing ? null : line.id)}
                    >
                      {editing ? 'Listo' : 'Ajustar'}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost shrink-0 whitespace-nowrap px-2 py-1 text-xs text-rose-700"
                      onClick={() => {
                        if (editingId === line.id) setEditingId(null);
                        onChange(lines.filter((item) => item.id !== line.id));
                      }}
                    >
                      Quitar
                    </button>
                  </div>
                  {editing ? (
                    <div className="mt-2 grid gap-2">
                      <div>
                        <label className="label">Forma de uso</label>
                        <textarea
                          className="input min-h-[4.5rem] text-base sm:text-sm"
                          value={line.usage}
                          onChange={(e) => updateLine(line.id, { usage: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="label">Recomendación</label>
                        <textarea
                          className="input min-h-[4.5rem] text-base sm:text-sm"
                          value={line.recommendation}
                          onChange={(e) => updateLine(line.id, { recommendation: e.target.value })}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1 space-y-1 text-sm leading-5 text-slate-700">
                      <p><span className="font-semibold">Uso.</span> {line.usage}</p>
                      <p>{line.recommendation}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-1 gap-2 border-t border-slate-100 p-3 sm:grid-cols-3">
            <button type="button" className="btn-secondary w-full" onClick={() => printRecipe(context, lines)}>Imprimir</button>
            <button type="button" className="btn-secondary w-full" onClick={() => printRecipe(context, lines)}>Guardar PDF</button>
            <a
              className="btn-primary w-full"
              href={whatsappUrl(context.phone, recipeMessage(context, lines))}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </a>
          </div>
          <p className="px-3 pb-3 text-xs text-slate-500">Para el PDF, en la ventana de impresión elige Guardar como PDF.</p>
        </div>
      )}
    </div>
  );
}
