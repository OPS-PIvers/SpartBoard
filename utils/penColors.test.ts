import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PEN_COLORS,
  normalizePenColors,
  resolvePenColors,
  toPenHex,
} from './penColors';

const TEACHER = ['#111111', '#222222', '#333333', '#444444', '#555555'];
const BUILDING = ['#aaaaaa', '#bbbbbb', '#cccccc', '#dddddd', '#eeeeee'];

describe('toPenHex', () => {
  it('lowercases 6-digit hex and expands 3-digit hex', () => {
    expect(toPenHex('#FF0000')).toBe('#ff0000');
    expect(toPenHex('#abc')).toBe('#aabbcc');
  });

  it('rejects non-hex values', () => {
    expect(toPenHex('eraser')).toBeNull();
    expect(toPenHex('red')).toBeNull();
    expect(toPenHex(42)).toBeNull();
  });
});

describe('normalizePenColors', () => {
  it('accepts exactly five valid colors', () => {
    expect(normalizePenColors(TEACHER)).toEqual(TEACHER);
  });

  it('rejects the wrong count or any invalid entry', () => {
    expect(normalizePenColors(TEACHER.slice(0, 4))).toBeNull();
    expect(normalizePenColors([...TEACHER, '#666666'])).toBeNull();
    expect(normalizePenColors([...TEACHER.slice(0, 4), 'nope'])).toBeNull();
    expect(normalizePenColors(undefined)).toBeNull();
  });
});

describe('resolvePenColors', () => {
  it('prefers the teacher palette over the building palette', () => {
    expect(resolvePenColors(TEACHER, BUILDING)).toEqual(TEACHER);
  });

  it('falls back to the building palette, then the defaults', () => {
    expect(resolvePenColors(null, BUILDING)).toEqual(BUILDING);
    expect(resolvePenColors(null, undefined)).toEqual([...DEFAULT_PEN_COLORS]);
  });

  it('ignores a malformed teacher palette', () => {
    expect(resolvePenColors(['#fff'], BUILDING)).toEqual(BUILDING);
  });
});
