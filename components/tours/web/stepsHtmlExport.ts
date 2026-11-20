import type { GuidedLearningSet } from '@/types';
import { isWebTourPicturePath } from '@/components/tours/webTours';
import {
  stepsFromWebTour,
  type StepsLabels,
  type StepsPicture,
  type StepsViewStep,
} from '@/components/tours/steps/stepsModel';
import {
  MARKUP_BADGE,
  MARKUP_HEAD,
  MARKUP_STROKE,
} from '@/components/tours/tourPictureMarkupGeometry';
import { webTourSequenceOf } from './tourSequence';
import { loadStepPicture } from './webPictures';

const BRAND_RED = '#ad2122';
/** Pictures wider than this are scaled down so the file stays small enough to paste. */
const MAX_PICTURE_W = 1600;
const MAX_SHOWN_W = 800;

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const TOKEN = /\*\*([^*\n]+?)\*\*|\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/g;

/** Step text as HTML: `**bold**`, https links and line breaks, with everything else escaped. */
export function stepTextHtml(text: string): string {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    out += escapeHtml(text.slice(last, at));
    out +=
      m[1] !== undefined
        ? `<strong>${escapeHtml(m[1])}</strong>`
        : `<a href="${escapeHtml(m[3])}" target="_blank" rel="noopener noreferrer">${escapeHtml(m[2])}</a>`;
    last = at + m[0].length;
  }
  out += escapeHtml(text.slice(last));
  return out.replace(/\r?\n/g, '<br>');
}

/** A step picture ready to embed: a data URL with the ring and markup drawn in, and the width to show it at. */
export interface ExportPicture {
  src: string;
  width: number;
}

/** The tour as one HTML document a help desk article can take: headings, words and pictures, with no scripts or classes. */
export function buildStepsHtml(
  title: string,
  steps: readonly StepsViewStep[],
  pictures: Readonly<Record<string, ExportPicture>>,
  labels: StepsLabels
): string {
  const body = steps
    .map((step, i) => {
      const parts: string[] = [];
      if (step.continueOn)
        parts.push(
          `<p><em>${escapeHtml(labels.continueOn(step.continueOn))}</em></p>`
        );
      const heading = `${labels.stepNumber(i + 1)}: ${step.title.trim() || labels.untitledStep}`;
      parts.push(`<h2>${escapeHtml(heading)}</h2>`);
      if (step.onlyIfAppears)
        parts.push(`<p><em>${escapeHtml(labels.onlyIfAppears)}</em></p>`);
      const text = step.text.trim();
      if (text) parts.push(`<p>${stepTextHtml(text)}</p>`);
      const pic = pictures[step.id];
      if (pic)
        parts.push(
          `<p><img src="${pic.src}" alt="${escapeHtml(labels.pictureAlt(i + 1))}" width="${pic.width}" style="max-width:100%;height:auto;border:1px solid #e2e8f0;border-radius:8px"></p>`
        );
      return parts.join('\n');
    })
    .join('\n\n');
  const safeTitle = escapeHtml(title);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<style>body{font-family:Lexend,Arial,sans-serif;max-width:860px;margin:2rem auto;padding:0 1rem;color:#0f172a;line-height:1.5}h2{margin-top:2rem}</style>
</head>
<body>
<h1>${safeTitle}</h1>

${body}
</body>
</html>
`;
}

const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
};

/** Draws the step picture with its target ring and markup baked in, so it reads the same pasted anywhere. */
export async function bakeStepPicture(
  blob: Blob,
  pic: StepsPicture
): Promise<ExportPicture> {
  const bitmap = await createImageBitmap(blob);
  const k = Math.min(1, MAX_PICTURE_W / bitmap.width);
  const w = Math.round(bitmap.width * k);
  const h = Math.round(bitmap.height * k);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  // Ring sizes follow the page's CSS pixels, as the on-screen ring does.
  const px = w / Math.max(1, pic.cssW || pic.w);
  if (pic.target) {
    const pad = 6 * px;
    const x = pic.target.x * w - pad;
    const y = pic.target.y * h - pad;
    const rw = pic.target.w * w + pad * 2;
    const rh = pic.target.h * h + pad * 2;
    roundRect(ctx, x, y, rw, rh, 10 * px);
    ctx.lineWidth = 7 * px;
    ctx.strokeStyle = 'rgba(15,23,42,0.65)';
    ctx.stroke();
    ctx.lineWidth = 3 * px;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }
  const unit = Math.max(w, h);
  const stroke = Math.max(2, unit * MARKUP_STROKE);
  for (const s of pic.markup ?? []) {
    ctx.strokeStyle = BRAND_RED;
    ctx.fillStyle = BRAND_RED;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (s.kind === 'box') {
      roundRect(ctx, s.x * w, s.y * h, s.w * w, s.h * h, stroke * 2);
      ctx.lineWidth = stroke;
      ctx.stroke();
    } else if (s.kind === 'arrow') {
      const [x1, y1, x2, y2] = [s.x1 * w, s.y1 * h, s.x2 * w, s.y2 * h];
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineWidth = stroke;
      ctx.stroke();
      const size = unit * MARKUP_HEAD;
      const angle = Math.atan2(y2 - y1, x2 - x1);
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      for (const a of [Math.PI / 7, -Math.PI / 7])
        ctx.lineTo(
          x2 - size * Math.cos(angle + a),
          y2 - size * Math.sin(angle + a)
        );
      ctx.closePath();
      ctx.lineWidth = stroke / 2;
      ctx.fill();
      ctx.stroke();
    } else {
      const r = unit * MARKUP_BADGE;
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = stroke / 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${r * 1.2}px Lexend, Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(s.n), s.x * w, s.y * h);
    }
  }
  const png = canvas.toDataURL('image/png');
  const src =
    png.length > 2_000_000 ? canvas.toDataURL('image/jpeg', 0.9) : png;
  const shown = Math.min(w, MAX_SHOWN_W, Math.round(pic.cssW || w));
  return { src, width: Math.max(1, shown) };
}

/** A file name for the tour: its title in lowercase words joined by dashes. */
export const stepsFileName = (title: string): string =>
  `${
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'web-tour'
  }.html`;

/** The published tour's steps as an HTML file, pictures included; a picture that won't load is left out. */
export async function webTourStepsHtml(
  setId: string,
  set: GuidedLearningSet,
  title: string,
  labels: StepsLabels,
  load: (path: string) => Promise<Blob> = loadStepPicture
): Promise<{ html: string; missing: number }> {
  const sequence = webTourSequenceOf(set);
  const steps = stepsFromWebTour(sequence);
  const pictures: Record<string, ExportPicture> = {};
  let missing = 0;
  await Promise.all(
    sequence.map(async (step, i) => {
      const path = step.web?.picture?.path;
      const pic = steps[i].picture;
      if (!path || !pic || !isWebTourPicturePath(setId, path)) return;
      try {
        pictures[step.id] = await bakeStepPicture(await load(path), pic);
      } catch {
        missing += 1;
      }
    })
  );
  return { html: buildStepsHtml(title, steps, pictures, labels), missing };
}

/** Saves the HTML as a file in the browser's downloads. */
export function downloadHtml(html: string, fileName: string): void {
  const url = URL.createObjectURL(
    new Blob([html], { type: 'text/html;charset=utf-8' })
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
