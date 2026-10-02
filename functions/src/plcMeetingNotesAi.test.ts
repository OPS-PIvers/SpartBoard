// Unit tests for the meeting notes prompt parsers, owner matching and markdown.
import { describe, it, expect } from 'vitest';
import {
  buildDraftActionItems,
  buildSummarizePrompt,
  matchOwner,
  parseSummaryResponse,
  parseTranscriptResponse,
  sectionsToMarkdown,
} from './plcMeetingNotesAi';

const MEMBERS = [
  { uid: 'u-sarah', name: 'Sarah Lund' },
  { uid: 'u-marcus', name: 'Marcus Hill' },
  { uid: 'u-sam1', name: 'Sam Ortiz' },
  { uid: 'u-sam2', name: 'Sam Park' },
];

describe('parseTranscriptResponse', () => {
  it('converts seconds to ms, clamps speakers and drops empty text', () => {
    const out = parseTranscriptResponse(
      JSON.stringify({
        segments: [
          { speaker: 1, start: 0, text: ' Okay,  let us start. ' },
          { speaker: 0, start: 4.6, text: 'Yes.' },
          { speaker: 2, start: 9, text: '   ' },
          'junk',
        ],
      })
    );
    expect(out).toEqual([
      { speaker: 1, startMs: 0, text: 'Okay, let us start.' },
      { speaker: 1, startMs: 4600, text: 'Yes.' },
    ]);
  });

  it('keeps start times from running backwards', () => {
    const out = parseTranscriptResponse(
      JSON.stringify({
        segments: [
          { speaker: 1, start: 10, text: 'a' },
          { speaker: 2, start: 9, text: 'b' },
        ],
      })
    );
    expect(out.map((s) => s.startMs)).toEqual([10000, 10000]);
  });

  it('returns nothing for a response without segments', () => {
    expect(parseTranscriptResponse('{}')).toEqual([]);
  });
});

describe('summaries', () => {
  it('strips list markers and empty bullets', () => {
    const s = parseSummaryResponse(
      JSON.stringify({
        agenda: ['- Unit 3 results', '2. Retakes', ''],
        discussion: [],
        decisions: ['Reteach unit rates.'],
        actionItems: [
          { text: 'Build a warm-up set', owner: 'Sarah' },
          { text: '', owner: 'Marcus' },
          { text: 'Email families', owner: null },
        ],
      })
    );
    expect(s.agenda).toEqual(['Unit 3 results', 'Retakes']);
    expect(s.actionItems).toEqual([
      { text: 'Build a warm-up set', owner: 'Sarah' },
      { text: 'Email families', owner: null },
    ]);
  });

  it('writes only the sections that have bullets', () => {
    expect(
      sectionsToMarkdown({
        agenda: ['Unit 3'],
        discussion: [],
        decisions: ['Reteach'],
        actionItems: [{ text: 'x', owner: null }],
      })
    ).toBe('## Agenda\n- Unit 3\n\n## Decisions\n- Reteach');
  });

  it('suggests an owner only for a single matching member', () => {
    expect(matchOwner('Sarah', MEMBERS)).toBe('u-sarah');
    expect(matchOwner('marcus hill', MEMBERS)).toBe('u-marcus');
    expect(matchOwner('Sam', MEMBERS)).toBeNull();
    expect(matchOwner('Sam Park', MEMBERS)).toBe('u-sam2');
    expect(matchOwner('Jordan', MEMBERS)).toBeNull();
    expect(matchOwner(null, MEMBERS)).toBeNull();
  });

  it('gives each drafted action item an id and a suggested owner', () => {
    let n = 0;
    const items = buildDraftActionItems(
      {
        agenda: [],
        discussion: [],
        decisions: [],
        actionItems: [
          { text: 'Build a warm-up set', owner: 'Sarah' },
          { text: 'Email families', owner: null },
        ],
      },
      MEMBERS,
      () => `id-${(n += 1)}`
    );
    expect(items).toEqual([
      { id: 'id-1', text: 'Build a warm-up set', suggestedOwnerUid: 'u-sarah' },
      { id: 'id-2', text: 'Email families', suggestedOwnerUid: null },
    ]);
  });

  it('puts the transcript between delimiters with clock times', () => {
    expect(
      buildSummarizePrompt([
        { speaker: 1, startMs: 4000, text: 'Hi' },
        { speaker: 2, startMs: 3_725_000, text: 'Bye' },
      ])
    ).toBe(
      'Transcript:\n<<<\n[0:04] Speaker 1: Hi\n[1:02:05] Speaker 2: Bye\n>>>'
    );
  });
});
