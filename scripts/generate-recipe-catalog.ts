import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';

function cellText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    const rich = value as { text?: string; richText?: { text: string }[]; result?: unknown };
    if (Array.isArray(rich.richText)) return rich.richText.map((part) => part.text).join('').trim();
    if (typeof rich.text === 'string') return rich.text.trim();
    if (rich.result != null) return cellText(rich.result);
  }
  return String(value).trim();
}

async function main() {
  const source = 'C:/Users/alpev/Downloads/Productos DMX-2026-10-22-11-05.xlsx';
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(source);
  const ws = wb.getWorksheet('Productos');
  if (!ws) throw new Error('No se encontró la hoja Productos');

  const seen = new Set<string>();
  const products: Array<{ name: string; brand?: string; category?: string }> = [];

  ws.eachRow((row, num) => {
    if (num <= 4) return;
    const name = cellText(row.getCell(1).value).replace(/\s+/g, ' ');
    if (!name) return;
    const key = name.toLocaleLowerCase('es');
    if (seen.has(key)) return;
    seen.add(key);
    const brand = cellText(row.getCell(3).value).replace(/\s+/g, ' ');
    const category = cellText(row.getCell(4).value).replace(/\s+/g, ' ');
    const item: { name: string; brand?: string; category?: string } = { name };
    if (brand) item.brand = brand;
    if (category) item.category = category;
    products.push(item);
  });

  products.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

  const out = `/** Generado desde Productos DMX. No editar a mano; regenerar con scripts/generate-recipe-catalog.ts */\nexport const RECIPE_PRODUCTS: Array<{ name: string; brand?: string; category?: string }> = ${JSON.stringify(products, null, 2)};\n`;
  const dest = resolve('shared/recipeCatalog.ts');
  writeFileSync(dest, out, 'utf8');
  console.log(`Wrote ${products.length} products to ${dest}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
