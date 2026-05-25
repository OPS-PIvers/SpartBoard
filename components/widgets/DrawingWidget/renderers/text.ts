import { TextObject } from '@/types';

// Pure Canvas 2D renderer for TextObject. Wrapped in save/restore so font /
// fillStyle / textBaseline never leak into other objects in the dispatcher
// render loop. Multi-line content is split on '\n' and laid out by advancing
// y by `fontSize * 1.2` (a standard line-height ratio) per line.
//
// Rotation: when `obj.rotation` is non-zero, the canvas is rotated around
// the bbox center BEFORE the per-line `fillText` calls so the entire text
// block rotates together (rather than each line rotating around its own
// baseline).
//
// Known limitation: `TextEditorOverlay` is intentionally NOT rotation-aware —
// it positions the contenteditable with `left`/`top` only, so editing a
// rotated `TextObject` opens the editor at the object's unrotated top-left
// (the world-coord anchor), not at its visual rotated position. The persisted
// draw still rotates correctly on commit. Adding `transform: rotate(...)` to
// the editor would require synchronizing the transform-origin with the
// renderer's bbox center AND adjusting caret/selection geometry in a rotated
// contenteditable — non-trivial; deferred.

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

  // Rotation pivots around the bbox center.
  const rot = obj.rotation ?? 0;
  if (Number.isFinite(rot) && rot !== 0) {
    const cx = obj.x + obj.w / 2;
    const cy = obj.y + obj.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.translate(-cx, -cy);
  }

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
