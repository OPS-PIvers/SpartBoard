import { describe, expect, it, vi } from 'vitest';

vi.mock('@/config/firebase', () => ({
  db: {},
  isAuthBypass: false,
  isConfigured: false,
}));

const {
  defaultBackgroundFor,
  firstBoardOnDefault,
  normalizeBoardBackgroundDefaults,
} = await import('./boardBackgroundDefaults');
const { DEFAULT_BOARD_BACKGROUND } = await import('@/config/backgrounds');

describe('board background defaults', () => {
  it('reads the district and buildings, dropping junk', () => {
    expect(
      normalizeBoardBackgroundDefaults({
        district: 'bg-white',
        buildings: { b1: 'https://x/y.jpg', b2: '', b3: 7 },
      })
    ).toEqual({ district: 'bg-white', buildings: { b1: 'https://x/y.jpg' } });
    expect(normalizeBoardBackgroundDefaults(null)).toEqual({ buildings: {} });
  });

  it("uses the first listed building's default, then the district's, then Snowy", () => {
    const defaults = {
      district: 'district-bg',
      buildings: { b2: 'b2-bg', b3: 'b3-bg' },
    };
    expect(defaultBackgroundFor(defaults, ['b1', 'b3', 'b2'])).toBe('b3-bg');
    expect(defaultBackgroundFor(defaults, ['b1'])).toBe('district-bg');
    expect(defaultBackgroundFor({ buildings: {} }, ['b1'])).toBe(
      DEFAULT_BOARD_BACKGROUND
    );
  });

  it('finds the first board only while it still has the SpartBoard default', () => {
    const boards = [
      { id: 'later', background: DEFAULT_BOARD_BACKGROUND, createdAt: 2 },
      { id: 'first', background: DEFAULT_BOARD_BACKGROUND, createdAt: 1 },
    ];
    expect(firstBoardOnDefault(boards)?.id).toBe('first');
    expect(
      firstBoardOnDefault([
        { id: 'first', background: 'bg-white', createdAt: 1 },
      ])
    ).toBeNull();
    expect(firstBoardOnDefault([])).toBeNull();
  });
});
