// `/writing-dev`: the student Writing page on a fake session, one fixture per state (`?state=` or the bar).
import React, { useState } from 'react';
import type { UnsentWriting, WritingNotice } from '@/hooks/useWritingPiece';
import {
  WritingStudentShell,
  type WritingShellPiece,
  type WritingShellSession,
} from '@/components/student/writing/WritingStudentShell';
import { deriveWritingView } from '@/utils/writingStudentView';
import type { WritingResponseStatus } from '@/types';

const NOW = Date.UTC(2026, 10, 18, 15, 0);

const SESSION: WritingShellSession = {
  title: 'Personal narrative: a moment that changed you',
  prompt:
    'Write about a time something **changed how you see the world**.\n• Set the scene\n• Show what happened\n• Explain why it still matters',
  minWords: 40,
  maxWords: 600,
  enforceWordLimit: true,
  dueAt: Date.UTC(2026, 10, 20, 15, 0),
  recordingNotice: true,
  spellCheck: true,
  stimuli: [
    {
      id: 'st1',
      type: 'text',
      url: '',
      label: 'Mentor text',
      tabLabel: 'Mentor text',
      text: 'The summer I turned eleven, the creek behind our house flooded. For three days we watched the water climb the bank. My father said nothing, but he moved the photo albums upstairs one box at a time.\n\nWhen the water went down, everything smelled of mud. That was the week I learned that being calm is something you do, not something you feel.',
    },
    {
      id: 'st2',
      type: 'text',
      url: '',
      label: 'Checklist',
      tabLabel: 'Checklist',
      text: 'A strong narrative has a clear moment, details a reader can picture, and an ending that says why it matters.',
    },
  ],
};

const DRAFT =
  '<p>The morning of the science fair, I dropped my volcano in the parking lot. Baking soda went everywhere, and the cardboard cone folded in half.</p><p>My little brother picked up the pieces without a word and handed me the tape. We rebuilt it on the hood of the car in twenty minutes.</p>';
const SHORT = '<p>The morning of the science fair, I dropped my volcano.</p>';
const UNSENT =
  '<p>The morning of the science fair, I dropped my volcano in the parking lot. I wrote this part on the bus with no signal.</p>';

type StateId =
  | 'not-started'
  | 'writing'
  | 'saved-on-device'
  | 'not-saved'
  | 'turning-in'
  | 'taken-over'
  | 'unsent'
  | 'paste-blocked'
  | 'turned-in'
  | 'returned'
  | 'revising';

interface Fixture {
  status: WritingResponseStatus | null;
  tabId?: string;
  html: string;
  online?: boolean;
  dirty?: boolean;
  refused?: boolean;
  copyOk?: boolean;
  turningIn?: boolean;
  unsent?: UnsentWriting;
  notice?: WritingNotice;
}

const FIXTURES: Record<StateId, Fixture> = {
  'not-started': { status: null, html: '' },
  writing: { status: 'draft', html: DRAFT },
  'saved-on-device': {
    status: 'draft',
    html: DRAFT,
    online: false,
    dirty: true,
  },
  'not-saved': {
    status: 'draft',
    html: DRAFT,
    dirty: true,
    refused: true,
    copyOk: false,
  },
  'turning-in': { status: 'draft', html: DRAFT, turningIn: true },
  'taken-over': { status: 'draft', tabId: 'other', html: DRAFT },
  unsent: {
    status: 'draft',
    html: SHORT,
    unsent: { html: UNSENT, savedAt: NOW - 3_600_000, stored: true },
  },
  'paste-blocked': { status: 'draft', html: SHORT, notice: 'paste-blocked' },
  'turned-in': { status: 'turned-in', html: DRAFT },
  returned: { status: 'returned', html: DRAFT },
  revising: { status: 'revising', html: DRAFT },
};

const STATES = Object.keys(FIXTURES) as StateId[];

const initialState = (): StateId => {
  const q = new URLSearchParams(window.location.search).get('state');
  return STATES.includes(q as StateId) ? (q as StateId) : 'writing';
};

const noop = () => undefined;

export const WritingDevHarness: React.FC = () => {
  const [state, setState] = useState<StateId>(initialState);
  const [bar] = useState(
    () => !new URLSearchParams(window.location.search).has('shot')
  );
  const f = FIXTURES[state];
  const view = deriveWritingView({
    session: { ...SESSION, status: 'active', closeAt: null },
    response:
      f.status === null
        ? null
        : { status: f.status, tabId: f.tabId ?? 'me', classId: 'c1' },
    pointer: null,
    tab: {
      myTabId: 'me',
      holding: true,
      claiming: false,
      online: f.online ?? true,
      dirty: f.dirty ?? false,
      slow: false,
      refused: f.refused ?? false,
      copyOk: f.copyOk ?? true,
      turningIn: f.turningIn ?? false,
      html: f.html,
    },
    now: NOW,
  });
  const piece: WritingShellPiece = {
    view,
    editorKey: state,
    editorHtml: f.html,
    unsent: f.unsent ? [f.unsent] : [],
    notice: f.notice ?? null,
    busy: f.turningIn ? 'turn-in' : null,
    online: f.online ?? true,
    contextMenuOff: true,
    onStart: noop,
    onTurnIn: noop,
    onTakeBack: noop,
    onContinueHere: noop,
    onDismissUnsent: noop,
    onUnsentCopy: noop,
    onEditorChange: noop,
    allowInsert: () => false,
    onEditorCopy: noop,
    bindEditor: noop,
  };
  return (
    <div className="relative">
      {bar && (
      <div className="fixed bottom-3 left-1/2 z-50 flex max-w-[95vw] -translate-x-1/2 flex-wrap justify-center gap-1 rounded-xl bg-slate-900/90 p-1 text-xs font-semibold text-white shadow-lg">
        {STATES.map((s) => (
          // no-tour-anchor: dev-only harness
          <button
            key={s}
            type="button"
            data-state={s}
            onClick={() => setState(s)}
            className={`rounded-lg px-3 py-1.5 ${s === state ? 'bg-white text-slate-900' : 'hover:bg-white/10'}`}
          >
            {s}
          </button>
        ))}
      </div>
      )}
      <WritingStudentShell session={SESSION} piece={piece} onDone={noop} />
    </div>
  );
};
