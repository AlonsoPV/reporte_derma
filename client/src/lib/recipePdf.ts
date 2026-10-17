import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

type PdfContext = {
  patientName: string;
  doctorName?: string | null;
  dateLabel: string;
};

type PdfLine = {
  category: string;
  productName: string;
  usage: string;
  recommendation: string;
};

function wrap(text: string, widthOf: (value: string) => number, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (widthOf(next) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    lines.push(current);
  }
  return lines.length ? lines : [''];
}

export async function buildRecipePdf(context: PdfContext, lines: PdfLine[]) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 48;
  const maxWidth = pageWidth - margin * 2;
  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const ensure = (height: number) => {
    if (y - height >= margin) return;
    page = doc.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
  };

  const draw = (text: string, size: number, used = font, color = rgb(0.11, 0.16, 0.2)) => {
    const rows = wrap(text, (value) => used.widthOfTextAtSize(value, size), maxWidth);
    for (const row of rows) {
      ensure(size + 6);
      page.drawText(row, { x: margin, y: y - size, size, font: used, color });
      y -= size + 4;
    }
  };

  draw('Recomendaciones', 20, bold, rgb(0.12, 0.43, 0.42));
  y -= 6;
  draw(`Paciente: ${context.patientName || '—'}`, 12);
  draw(`Fecha: ${context.dateLabel}`, 12);
  if (context.doctorName) draw(`Doctor: ${context.doctorName}`, 12);
  y -= 10;

  for (const line of lines) {
    ensure(48);
    draw(line.category.toUpperCase(), 9, bold, rgb(0.36, 0.42, 0.45));
    draw(line.productName, 14, bold);
    draw(`Forma de uso. ${line.usage}`, 11);
    draw(line.recommendation, 11);
    y -= 10;
  }

  return doc.save();
}

function fileName(patientName: string) {
  const safe = (patientName || 'paciente').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  return `Recomendaciones-${safe || 'paciente'}.pdf`;
}

export async function recipePdfFile(context: PdfContext, lines: PdfLine[]) {
  const bytes = await buildRecipePdf(context, lines);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new File([copy], fileName(context.patientName), { type: 'application/pdf' });
}

export function downloadRecipeFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function downloadRecipePdf(context: PdfContext, lines: PdfLine[]) {
  downloadRecipeFile(await recipePdfFile(context, lines));
}

function sharePayload(file: File, title: string, text?: string) {
  return text ? { files: [file], title, text } : { files: [file], title };
}

export function canShareRecipeFile(file: File, title: string, text?: string) {
  return Boolean(navigator.canShare?.(sharePayload(file, title, text)));
}

export async function shareRecipeFile(file: File, title: string, text?: string) {
  const withText = text ? sharePayload(file, title, text) : null;
  const payload = withText && navigator.canShare?.(withText) ? withText : sharePayload(file, title);
  if (navigator.canShare?.(payload)) {
    await navigator.share(payload);
    return 'shared' as const;
  }
  downloadRecipeFile(file);
  return 'downloaded' as const;
}

export async function shareRecipePdf(context: PdfContext, lines: PdfLine[], text?: string) {
  const file = await recipePdfFile(context, lines);
  const title = `Recomendaciones ${context.patientName || ''}`.trim();
  try {
    return await shareRecipeFile(file, title, text);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    downloadRecipeFile(file);
    return 'downloaded' as const;
  }
}
