import { describe, expect, it } from 'vitest';
import { rectOverlapArea } from '@/components/widgets/GuidedLearning/utils/calloutPlacement';
import { centreTip } from './tipPlacement';

const view = { w: 1024, h: 768 };
const box = { w: 400, h: 200 };

describe('centreTip', () => {
  it('centres when nothing is in the way', () => {
    expect(centreTip(box, view, [], 16)).toEqual({ left: 312, top: 284 });
  });

  it('drops below a bar it would cover', () => {
    const bar = { x: 300, y: 250, w: 420, h: 60 };
    const at = centreTip(box, view, [bar], 16);
    expect(at.top).toBe(326);
    expect(rectOverlapArea({ x: at.left, y: at.top, ...box }, bar)).toBe(0);
  });

  it('goes above the bar when there is no room below', () => {
    const bar = { x: 300, y: 500, w: 420, h: 200 };
    const at = centreTip(box, view, [bar], 16);
    expect(at.top).toBe(284);
    const low = { x: 300, y: 300, w: 420, h: 400 };
    expect(centreTip(box, view, [low], 16).top).toBe(84);
  });
});
