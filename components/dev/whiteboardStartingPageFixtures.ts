/** DEV-only starting page with two placed images and teacher ink, for the editor and capture harnesses. */
import type { WhiteboardPlacedImage, WhiteboardStartingPage } from '@/types';

const drawn = (
  w: number,
  h: number,
  paint: (ctx: CanvasRenderingContext2D) => void
): string => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) paint(ctx);
  return canvas.toDataURL('image/png');
};

const sunImage = () =>
  drawn(400, 400, (ctx) => {
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(0, 0, 400, 400);
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(200, 200, 110, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#78350f';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Sun', 200, 216);
  });

const planetImage = () =>
  drawn(480, 300, (ctx) => {
    ctx.fillStyle = '#e0f2fe';
    ctx.fillRect(0, 0, 480, 300);
    ctx.fillStyle = '#2563eb';
    ctx.beginPath();
    ctx.arc(150, 150, 80, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0c4a6e';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText('Earth', 260, 165);
  });

let cached: WhiteboardStartingPage | null = null;

const placed = (
  id: string,
  url: string,
  width: number,
  height: number,
  rect: Pick<WhiteboardPlacedImage, 'x' | 'y' | 'w' | 'h'>
): WhiteboardPlacedImage => ({
  driveFileId: id,
  url,
  mimeType: 'image/png',
  width,
  height,
  ...rect,
});

export function devRichStartingPage(): WhiteboardStartingPage {
  cached ??= {
    pattern: { kind: 'blank' },
    images: [
      placed('dev-sun', sunImage(), 400, 400, {
        x: 160,
        y: 380,
        w: 440,
        h: 440,
      }),
      placed('dev-earth', planetImage(), 480, 300, {
        x: 980,
        y: 420,
        w: 480,
        h: 300,
      }),
    ],
    ink: [
      {
        color: '#0f172a',
        size: 4,
        points: [620, 600, 700, 560, 800, 545, 900, 560, 970, 590],
      },
      { color: '#0f172a', size: 4, points: [940, 565, 972, 590, 938, 615] },
    ],
  };
  return cached;
}
