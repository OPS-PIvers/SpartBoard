import type { FurnitureItem } from '@/types';
import { escapeHtml, type PrintableDocument } from '@/utils/printHtmlDocument';

// Landscape letter less the drawn margins, the header and the front-of-room band, with room to spare.
const AREA_W_MM = 250;
const AREA_H_MM = 150;
const MARGIN_MM = { vertical: 10, horizontal: 12 };
const PT_PER_MM = 2.835;

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

const num = (n: unknown): number =>
  typeof n === 'number' && Number.isFinite(n) ? n : 0;

interface Box {
  item: FurnitureItem;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}

// Bounding box of the item as drawn, rotated about its centre.
const extents = (b: Box) => {
  const rad = (b.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const hw = (b.w * cos + b.h * sin) / 2;
  const hh = (b.w * sin + b.h * cos) / 2;
  return { minX: cx - hw, maxX: cx + hw, minY: cy - hh, maxY: cy + hh };
};

export const buildSeatingChartPrint = (
  job: SeatingChartPrintJob
): PrintableDocument => {
  const boxes: Box[] = job.furniture.map((item) => ({
    item,
    x: num(item.x),
    y: num(item.y),
    w: Math.max(1, num(item.width)),
    h: Math.max(1, num(item.height)),
    rotation: num(item.rotation),
  }));
  const ext = boxes.map(extents);
  const minX = ext.length ? Math.min(...ext.map((e) => e.minX)) : 0;
  const minY = ext.length ? Math.min(...ext.map((e) => e.minY)) : 0;
  const maxX = Math.max(...ext.map((e) => e.maxX), minX + 1);
  const maxY = Math.max(...ext.map((e) => e.maxY), minY + 1);
  const scale = Math.min(AREA_W_MM / (maxX - minX), AREA_H_MM / (maxY - minY));
  const offsetX = (AREA_W_MM - (maxX - minX) * scale) / 2;
  const offsetY = (AREA_H_MM - (maxY - minY) * scale) / 2;
  const mm = (n: number) => n.toFixed(2);

  const pieces = boxes
    .map((b) => {
      const names = job.namesBySeat.get(b.item.id) ?? [];
      // Text sits upright; a quarter-turned seat swaps the space it has.
      const quarter = Math.round(((b.rotation % 180) + 180) % 180) === 90;
      const textW = (quarter ? b.h : b.w) * scale;
      const textH = (quarter ? b.w : b.h) * scale;
      const lines = Math.max(1, names.length);
      const longest = Math.max(1, ...names.map((n) => n.length));
      const longestWord = Math.max(
        1,
        ...names.flatMap((n) => n.split(/[\s-]+/).map((w) => w.length))
      );
      // Fit the lines by height, each word on one line, and a long name over up to three lines.
      const byHeight = (textH / (lines * 1.25)) * PT_PER_MM;
      const byWord = (textW / (longestWord * 0.6)) * PT_PER_MM;
      const byName = ((textW * 3) / (longest * 0.6)) * PT_PER_MM;
      const namePt = Math.max(
        6,
        Math.min(14, byHeight, byWord, byName)
      ).toFixed(1);
      const text =
        names.length > 0
          ? names
              .map(
                (n) =>
                  `<div class="name" style="font-size:${namePt}pt">${escapeHtml(n)}</div>`
              )
              .join('')
          : `<div class="label">${escapeHtml(fallbackLabel(b.item))}</div>`;
      const shape = b.item.type === 'table-round' ? ' round' : '';
      const kind = b.item.type === 'rug' ? ' rug' : '';
      const left = offsetX + (b.x - minX) * scale;
      const top = offsetY + (b.y - minY) * scale;
      return `<div class="item${shape}${kind}" style="left:${mm(left)}mm;top:${mm(top)}mm;width:${mm(b.w * scale)}mm;height:${mm(b.h * scale)}mm;transform:rotate(${b.rotation}deg)"><div class="text" style="width:${mm(textW)}mm;height:${mm(textH)}mm;transform:rotate(${-b.rotation}deg)">${text}</div></div>`;
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
    .sheet { page-break-inside: avoid; break-inside: avoid; }
    header { display: flex; justify-content: space-between; align-items: baseline; gap: 6mm; border-bottom: 0.3mm solid #cbd5e1; padding-bottom: 2mm; }
    header > div:first-child { min-width: 0; }
    h1, .details { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    h1 { font-size: 16pt; margin: 0; }
    .details { font-size: 10pt; color: #475569; margin-top: 1mm; }
    .date { font-size: 10pt; color: #475569; white-space: nowrap; }
    .front { margin: 3mm 0 2mm; text-align: center; font-size: 9pt; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #475569; border: 0.3mm solid #94a3b8; padding: 1mm 0; }
    .room { position: relative; width: ${AREA_W_MM}mm; height: ${AREA_H_MM}mm; margin: 0 auto; }
    .item { position: absolute; border: 0.4mm solid #334155; border-radius: 1.5mm; display: flex; align-items: center; justify-content: center; }
    .item.round { border-radius: 50%; }
    .item.rug { border-style: dashed; border-color: #94a3b8; }
    .text { flex: none; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 0.5mm; line-height: 1.15; overflow: hidden; }
    .name { font-weight: 600; overflow-wrap: break-word; max-width: 100%; }
    .label { font-size: 8pt; color: #64748b; }
  `;

  const body = `
    <div class="sheet">
      <header>
        <div>
          <h1>${escapeHtml(job.title)}</h1>
          ${details ? `<div class="details">${details}</div>` : ''}
        </div>
        <div class="date">${escapeHtml(date)}</div>
      </header>
      <div class="front">Front of room</div>
      <div class="room">${pieces}</div>
    </div>
  `;

  return { title: job.title, styles, body, marginMm: MARGIN_MM };
};
