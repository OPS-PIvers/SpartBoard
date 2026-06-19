/**
 * Unit tests for the PLC route-path parser/builder (T4, Decision 0.3).
 *
 * `App.tsx` uses manual pathname routing, so `parsePlcPath` is the contract
 * that turns a `/plc...` URL into `{ plcId, section, meetingId }`. These tests
 * pin: deep-linking a section, the default section, unknown-section fallback,
 * the meeting + meeting/:id forms, tolerance (trailing slash, encoding), and
 * the `parse → build` round-trip.
 */

import { describe, it, expect } from 'vitest';
import { parsePlcPath, buildPlcPath, isPlcRoute } from '@/utils/plcPath';
import type { PlcSectionId } from '@/components/plc/sections';

describe('isPlcRoute', () => {
  it('matches /plc and any path under it', () => {
    expect(isPlcRoute('/plc')).toBe(true);
    expect(isPlcRoute('/plc/abc')).toBe(true);
    expect(isPlcRoute('/plc/abc/data')).toBe(true);
  });

  it('does not match unrelated paths or look-alikes', () => {
    expect(isPlcRoute('/')).toBe(false);
    expect(isPlcRoute('/plc-invite/xyz')).toBe(false);
    expect(isPlcRoute('/plcs')).toBe(false);
    expect(isPlcRoute('/quiz')).toBe(false);
  });
});

describe('parsePlcPath', () => {
  it('returns the index-hub shape for the bare /plc', () => {
    expect(parsePlcPath('/plc')).toEqual({
      plcId: null,
      section: 'home',
      meetingId: null,
    });
  });

  it('returns the index-hub shape for /plc with a trailing slash', () => {
    expect(parsePlcPath('/plc/')).toEqual({
      plcId: null,
      section: 'home',
      meetingId: null,
    });
  });

  it('defaults the section to home for /plc/:plcId', () => {
    expect(parsePlcPath('/plc/plc-123')).toEqual({
      plcId: 'plc-123',
      section: 'home',
      meetingId: null,
    });
  });

  it('deep-links a known section', () => {
    expect(parsePlcPath('/plc/plc-123/sharedData')).toEqual({
      plcId: 'plc-123',
      section: 'sharedData',
      meetingId: null,
    });
  });

  it.each<[PlcSectionId]>([
    ['quizzes'],
    ['videoActivities'],
    ['docs'],
    ['todos'],
    ['sharedBoards'],
    ['members'],
    ['resources'],
    ['settings'],
  ])('accepts the %s section id', (section) => {
    expect(parsePlcPath(`/plc/plc-123/${section}`).section).toBe(section);
  });

  it('coerces an unknown section to home', () => {
    expect(parsePlcPath('/plc/plc-123/not-a-section')).toEqual({
      plcId: 'plc-123',
      section: 'home',
      meetingId: null,
    });
  });

  it('parses the meeting section without an id', () => {
    expect(parsePlcPath('/plc/plc-123/meeting')).toEqual({
      plcId: 'plc-123',
      section: 'meeting',
      meetingId: null,
    });
  });

  it('parses /plc/:plcId/meeting/:meetingId', () => {
    expect(parsePlcPath('/plc/plc-123/meeting/mtg-9')).toEqual({
      plcId: 'plc-123',
      section: 'meeting',
      meetingId: 'mtg-9',
    });
  });

  it('ignores a trailing id segment for a non-meeting section', () => {
    // `/plc/:id/data/extra` — the extra segment is not a meeting id.
    expect(parsePlcPath('/plc/plc-123/sharedData/extra')).toEqual({
      plcId: 'plc-123',
      section: 'sharedData',
      meetingId: null,
    });
  });

  it('tolerates a trailing slash on a section path', () => {
    expect(parsePlcPath('/plc/plc-123/members/')).toEqual({
      plcId: 'plc-123',
      section: 'members',
      meetingId: null,
    });
  });

  it('decodes URL-encoded segments', () => {
    expect(parsePlcPath('/plc/plc%20123/meeting/mtg%2F9')).toEqual({
      plcId: 'plc 123',
      section: 'meeting',
      meetingId: 'mtg/9',
    });
  });

  it('returns the fallback for non-PLC paths', () => {
    expect(parsePlcPath('/')).toEqual({
      plcId: null,
      section: 'home',
      meetingId: null,
    });
    expect(parsePlcPath('/plc-invite/abc')).toEqual({
      plcId: null,
      section: 'home',
      meetingId: null,
    });
  });
});

describe('buildPlcPath', () => {
  it('collapses the default home section to the bare /plc/:id form', () => {
    expect(buildPlcPath('plc-123')).toBe('/plc/plc-123');
    expect(buildPlcPath('plc-123', 'home')).toBe('/plc/plc-123');
  });

  it('builds a section path', () => {
    expect(buildPlcPath('plc-123', 'sharedData')).toBe(
      '/plc/plc-123/sharedData'
    );
  });

  it('builds the meeting and meeting/:id forms', () => {
    expect(buildPlcPath('plc-123', 'meeting')).toBe('/plc/plc-123/meeting');
    expect(buildPlcPath('plc-123', 'meeting', 'mtg-9')).toBe(
      '/plc/plc-123/meeting/mtg-9'
    );
  });

  it('encodes ids with reserved characters', () => {
    expect(buildPlcPath('plc 123')).toBe('/plc/plc%20123');
    expect(buildPlcPath('plc-123', 'meeting', 'mtg/9')).toBe(
      '/plc/plc-123/meeting/mtg%2F9'
    );
  });

  it('round-trips through parsePlcPath for representative inputs', () => {
    const cases: Array<[string, PlcSectionId, string | null]> = [
      ['plc-1', 'home', null],
      ['plc-1', 'todos', null],
      ['plc-1', 'meeting', null],
      ['plc-1', 'meeting', 'mtg-7'],
    ];
    for (const [plcId, section, meetingId] of cases) {
      const path = buildPlcPath(plcId, section, meetingId);
      const parsed = parsePlcPath(path);
      expect(parsed.plcId).toBe(plcId);
      expect(parsed.section).toBe(section);
      expect(parsed.meetingId).toBe(meetingId);
    }
  });
});
