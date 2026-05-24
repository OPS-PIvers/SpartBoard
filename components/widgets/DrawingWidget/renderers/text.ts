import { TextObject } from '@/types';

// Pure Canvas 2D renderer for TextObject. Wrapped in save/restore so font /
// fillStyle / textBaseline never leak into other objects in the dispatcher
// render loop. Multi-line content is split on '\n' and laid out by advancing
// y by `fontSize * 1.2` (a standard line-height ratio) per line.

const LINE_HEIGHT_RATIO = 1.2;

export const renderText = (
  ctx: CanvasRenderingContext2D,
  obj: TextObject
): void => {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.font = `${obj.fontSize}px ${obj.fontFamily}`;
  ctx.fillStyle = obj.color;
  ctx.textBaseline = 'alphabetic';

  // First baseline sits one full font-size below the top of the bbox so the
  // glyph caps land roughly at the top edge of the object — matches what the
  // contenteditable overlay shows during editing.
  const lineHeight = obj.fontSize * LINE_HEIGHT_RATIO;
  const lines = obj.content.split('\n');
  lines.forEach((line, i) => {
    const baselineY = obj.y + obj.fontSize + i * lineHeight;
    ctx.fillText(line, obj.x, baselineY);
  });
  ctx.restore();
};
