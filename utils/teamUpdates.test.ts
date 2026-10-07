import { describe, expect, it } from 'vitest';
import type { Plc, PlcUpdate } from '@/types';
import {
  buildAckRoster,
  filterUpdates,
  isCalendarEmbedUrl,
  normalizeCalendarEmbedInput,
  parsePlcUpdate,
  pickHeroUpdate,
  sortUpdates,
  splitComposeText,
} from '@/utils/teamUpdates';

const upd = (id: string, extra: Partial<PlcUpdate> = {}): PlcUpdate => ({
  id,
  title: id,
  body: '',
  requiresAck: false,
  inDigest: true,
  pinned: false,
  reactions: {},
  authorUid: 'lead',
  authorName: 'Lead',
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

const CAL =
  'https://calendar.google.com/calendar/embed?src=staff%40example.org&ctz=America%2FChicago';

describe('calendar embed URLs', () => {
  it('accepts Google Calendar embed links only', () => {
    expect(isCalendarEmbedUrl(CAL)).toBe(true);
    expect(isCalendarEmbedUrl(CAL.replace('embed?', 'u/1/embed?'))).toBe(true);
    expect(isCalendarEmbedUrl('https://calendar.google.com/calendar/r')).toBe(
      false
    );
    expect(
      isCalendarEmbedUrl('http://calendar.google.com/calendar/embed?src=x')
    ).toBe(false);
    expect(
      isCalendarEmbedUrl(
        'https://calendar.google.com.evil.io/calendar/embed?src=x'
      )
    ).toBe(false);
    expect(isCalendarEmbedUrl(`${CAL}${'x'.repeat(2000)}`)).toBe(false);
  });

  it('pulls the src out of a pasted iframe snippet', () => {
    const snippet = `<iframe src="${CAL.replace(/&/g, '&amp;')}" style="border: 0" width="800"></iframe>`;
    expect(normalizeCalendarEmbedInput(snippet)).toBe(CAL);
    expect(normalizeCalendarEmbedInput(`  ${CAL}  `)).toBe(CAL);
    expect(normalizeCalendarEmbedInput('https://example.com')).toBeNull();
  });
});

describe('parsePlcUpdate', () => {
  it('keeps only true reactions and safe links', () => {
    const u = parsePlcUpdate('a', {
      title: 'T',
      authorUid: 'lead',
      reactions: { x: true, y: false },
      linkUrl: 'javascript:alert(1)',
      attachment: { name: 'f', url: 'https://evil.example.com/f' },
      requiresAck: true,
    });
    expect(u?.reactions).toEqual({ x: true });
    expect(u?.linkUrl).toBeUndefined();
    expect(u?.attachment).toBeUndefined();
    expect(u?.requiresAck).toBe(true);
    expect(parsePlcUpdate('b', { title: 3 })).toBeNull();
  });
});

describe('ordering, hero pick and filters', () => {
  const list = [
    upd('old', { createdAt: 10, pinned: true }),
    upd('new', { createdAt: 30 }),
    upd('mid', { createdAt: 20, pinned: true, requiresAck: true }),
    upd('pending', { createdAt: 0 }),
  ];

  it('sorts newest first with a pending write on top', () => {
    expect(sortUpdates(list).map((u) => u.id)).toEqual([
      'pending',
      'new',
      'mid',
      'old',
    ]);
  });

  it('defaults the hero to the newest pinned update, else the newest', () => {
    expect(pickHeroUpdate(list)?.id).toBe('mid');
    expect(pickHeroUpdate([upd('a', { createdAt: 5 })])?.id).toBe('a');
    expect(pickHeroUpdate(list, 'old')?.id).toBe('old');
    expect(pickHeroUpdate(list, 'gone')).toBeNull();
    expect(pickHeroUpdate([])).toBeNull();
  });

  it('filters by acknowledgement and pin', () => {
    expect(filterUpdates(list, 'ack').map((u) => u.id)).toEqual(['mid']);
    expect(filterUpdates(list, 'pinned')).toHaveLength(2);
    expect(filterUpdates(list, 'all')).toHaveLength(4);
  });
});

describe('splitComposeText', () => {
  it('uses the first line as the title', () => {
    expect(splitComposeText('  Fire drill\n\nUse the north stairs. ')).toEqual({
      title: 'Fire drill',
      body: 'Use the north stairs.',
    });
    expect(splitComposeText('Just a title')).toEqual({
      title: 'Just a title',
      body: '',
    });
  });

  it('keeps a long single line whole in the body', () => {
    const long = 'word '.repeat(60).trim();
    const out = splitComposeText(long);
    expect(out.title.length).toBeLessThanOrEqual(200);
    expect(out.body).toBe(long);
  });
});

describe('buildAckRoster', () => {
  const plc = {
    id: 'p',
    leadUid: 'lead',
    memberUids: ['lead', 'a', 'b', 'c'],
    memberEmails: {},
    members: {
      lead: {
        uid: 'lead',
        email: 'l@x',
        displayName: 'Lead',
        role: 'lead',
        joinedAt: 0,
        status: 'active',
      },
      a: {
        uid: 'a',
        email: 'a@x',
        displayName: 'Ann',
        role: 'member',
        joinedAt: 0,
        status: 'active',
      },
      b: {
        uid: 'b',
        email: 'b@x',
        displayName: 'Ben',
        role: 'viewer',
        joinedAt: 0,
        status: 'active',
      },
      c: {
        uid: 'c',
        email: 'c@x',
        displayName: 'Cy',
        role: 'member',
        joinedAt: 0,
        status: 'removed',
      },
    },
  } as unknown as Plc;

  it('splits active members other than the author', () => {
    const roster = buildAckRoster(plc, upd('u', { requiresAck: true }), [
      { uid: 'b', name: 'Ben B', ackedAt: 5 },
    ]);
    expect(roster.total).toBe(2);
    expect(roster.acknowledged).toEqual([
      { uid: 'b', name: 'Ben B', ackedAt: 5 },
    ]);
    expect(roster.notYet).toEqual([{ uid: 'a', name: 'Ann' }]);
  });
});
