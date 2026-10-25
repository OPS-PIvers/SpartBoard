import type { FurnitureItem } from '@/types';
import { escapeHtml, type PrintableDocument } from '@/utils/printHtmlDocument';

// Landscape letter, less the drawn margins and the header block.
const AREA_W_MM = 255;
const AREA_H_MM = 165;
const MARGIN_MM = { vertical: 10, horizontal: 12 };

export interface SeatingChartPrintJob {
  title: string;
  planName?: string;
  className?: string;
  date: Date;
  furniture: FurnitureItem[];
  /** Student names per furniture id, already filtered to what the board shows. */
  namesBySeat: Map<string, string[]>;
}

const fallbackLabel = (item: FurnitureItem): string => {
  if (item.label) return item.label;
  if (item.type === 'teacher-desk') return 'Teacher';
  if (item.type === 'rug') return 'Rug';
  return '';
};

export const buildSeatingChartPrint = (
  job: SeatingChartPrintJob
): PrintableDocument => {
  const items = job.furniture;
  const minX = items.length ? Math.min(...items.map((f) => f.x)) : 0;
  const minY = items.length ? Math.min(...items.map((f) => f.y)) : 0;
  const maxX = Math.max(...items.map((f) => f.x + f.width), minX + 1);
  const maxY = Math.max(...items.map((f) => f.y + f.height), minY + 1);
  const scale = Math.min(AREA_W_MM / (maxX - minX), AREA_H_MM / (maxY - minY));
  const mm = (px: number) => (px * scale).toFixed(2);
  // Name size follows the seat size, within readable bounds.
  const seatH = Math.min(...items.map((f) => Math.min(f.width, f.height)), 80);
  const namePt = Math.max(7, Math.min(14, seatH * scale * 0.9)).toFixed(1);

  const pieces = items
    .map((f) => {
      const names = job.namesBySeat.get(f.id) ?? [];
      const text =
        names.length > 0
          ? names
              .map((n) => `<div class="name">${escapeHtml(n)}</div>`)
              .join('')
          : `<div class="label">${escapeHtml(fallbackLabel(f))}</div>`;
      const shape = f.type === 'table-round' ? ' round' : '';
      const kind = f.type === 'rug' ? ' rug' : '';
      return `<div class="item${shape}${kind}" style="left:${mm(f.x - minX)}mm;top:${mm(f.y - minY)}mm;width:${mm(f.width)}mm;height:${mm(f.height)}mm;transform:rotate(${f.rotation}deg)"><div class="text" style="transform:rotate(${-f.rotation}deg)">${text}</div></div>`;
    })
    .join('');

  const details = [job.className, job.planName]
    .filter((v): v is string => !!v)
    .map((v) => escapeHtml(v))
    .join(' &middot; ');
  const date = job.date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const styles = `
    @page { size: letter landscape; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Lexend, Roboto, Arial, sans-serif; color: #1e293b; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 0.3mm solid #cbd5e1; padding-bottom: 2mm; }
    h1 { font-size: 16pt; margin: 0; }
    .details { font-size: 10pt; color: #475569; margin-top: 1mm; }
    .date { font-size: 10pt; color: #475569; }
    .front { margin: 3mm 0 2mm; text-align: center; font-size: 9pt; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #475569; border: 0.3mm solid #94a3b8; padding: 1mm 0; }
    .room { position: relative; width: ${AREA_W_MM}mm; height: ${AREA_H_MM}mm; margin: 0 auto; }
    .item { position: absolute; border: 0.4mm solid #334155; border-radius: 1.5mm; display: flex; align-items: center; justify-content: center; }
    .item.round { border-radius: 50%; }
    .item.rug { border-style: dashed; border-color: #94a3b8; }
    .text { text-align: center; padding: 0.5mm; line-height: 1.15; }
    .name { font-size: ${namePt}pt; font-weight: 600; overflow-wrap: anywhere; }
    .label { font-size: 8pt; color: #64748b; }
  `;

  const body = `
    <header>
      <div>
        <h1>${escapeHtml(job.title)}</h1>
        ${details ? `<div class="details">${details}</div>` : ''}
      </div>
      <div class="date">${escapeHtml(date)}</div>
    </header>
    <div class="front">Front of room</div>
    <div class="room">${pieces}</div>
  `;

  return { title: job.title, styles, body, marginMm: MARGIN_MM };
};
