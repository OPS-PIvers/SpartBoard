// `/writing-dev?view=monitor`: the Writing monitor on fake responses, sized like the widget; needs VITE_AUTH_BYPASS.
import React, { useState } from 'react';
import type {
  WritingAssignmentSession,
  WritingResponse,
  WritingResponseStatus,
} from '@/types';
import { DialogProvider } from '@/context/DialogContext';
import { AuthProvider } from '@/context/AuthContext';
import { CustomWidgetsProvider } from '@/context/CustomWidgetsContext';
import { SavedWidgetsProvider } from '@/context/SavedWidgetsContext';
import { DashboardProvider } from '@/context/DashboardContext';
import { DialogContainer } from '@/components/common/DialogContainer';
import { WritingMonitorView } from '@/components/widgets/Writing/components/monitor/WritingMonitor';

const NOW = Date.now();
const MIN = 60_000;

const SESSION: WritingAssignmentSession = {
  id: 'dev-writing',
  teacherUid: 'mock-user-id',
  itemId: 'w1',
  title: 'Personal narrative: a moment that changed you',
  prompt:
    'Write about a time something **changed how you see the world**.\n• Set the scene\n• Show what happened\n• Explain why it still matters',
  grading: { mode: 'points', points: 20 },
  allowPaste: false,
  recordingNotice: true,
  studentCanViewRecord: false,
  spellCheck: true,
  classIds: ['p1', 'p3'],
  classId: 'p1',
  periodNames: ['Period 1', 'Period 3'],
  status: 'active',
  createdAt: NOW - 60 * MIN,
  updatedAt: NOW,
};

const NAMES: [string, string, string][] = [
  ['s1', 'Maya', 'Okonkwo-Lindqvist'],
  ['s2', 'Jo', 'Li'],
  ['s3', 'Theodore', 'Abernathy'],
  ['s4', 'Ana', 'García'],
  ['s5', 'Sam', 'Nguyen'],
  ['s6', 'Priya', 'Raman'],
  ['s7', 'Elijah', 'Brooks'],
  ['s8', 'Hana', 'Sato'],
  ['s9', 'Leo', 'Fischer'],
  ['s10', 'Zoe', 'Martin'],
];

const TEXT =
  '<p>The summer I turned eleven, my grandmother handed me the keys to her old bike and told me to ride to the lake by myself.</p><p>I had never gone farther than the end of our street alone. The road felt enormous, and every car that passed seemed to slow down just to look at me.</p><p>When I finally reached the water, I sat on the dock and realized nobody knew exactly where I was.</p>';

const response = (
  uid: string,
  status: WritingResponseStatus,
  words: number,
  savedMinsAgo: number,
  awayMs = 0,
  awayCount = 0,
  classId = 'p1'
): WritingResponse => ({
  studentUid: uid,
  classId,
  html: words > 0 ? TEXT : '',
  summary: {
    wordCount: words,
    savedAt: NOW - savedMinsAgo * MIN,
    writingMs: Math.max(0, 38 - savedMinsAgo) * MIN,
    sessions: 1,
    pasteCount: 0,
    pastedChars: 0,
    untypedCount: 0,
    untypedChars: 0,
    awayMs,
    awayCount,
  },
  status,
  saveCount: words > 0 ? 40 : 0,
  tabId: 't',
  logChunk: 0,
  startedAt: NOW - 40 * MIN,
  draftCount: status === 'draft' ? 0 : 1,
  updatedAt: NOW,
});

const RESPONSES: WritingResponse[] = [
  response('s1', 'draft', 412, 0, 72_000, 2),
  response('s2', 'draft', 88, 6),
  response('s3', 'turned-in', 534, 12),
  response('s4', 'draft', 0, 0),
  response('s5', 'revising', 301, 1, 15_000, 1),
  response('s6', 'draft', 1260, 0),
  response('s7', 'returned', 476, 30),
  response('s8', 'draft', 205, 1, 0, 0, 'p3'),
];

const gate = (label: string, state: 'open' | 'paused') => ({
  state,
  openAt: null,
  closeAt: null,
  bellPeriodId: null,
  verified: true,
  label,
});

// ?classes=manual shows the per-class Start and Pause bar.
const PERIOD_BAR = {
  periodAccess: {
    p1: gate('Period 1', 'open'),
    p3: gate('Period 3', 'paused'),
  },
  onStart: () => Promise.resolve(),
  onPause: () => Promise.resolve(),
  onExtend: () => Promise.resolve(),
  extendMs: 600_000,
  dueAt: null,
};

export const WritingMonitorDev: React.FC = () => {
  const [classId, setClassId] = useState('');
  const [width, setWidth] = useState(520);
  if (import.meta.env.VITE_AUTH_BYPASS !== 'true')
    return <p className="p-6">Set VITE_AUTH_BYPASS=true for this page.</p>;
  const names = new Map(
    NAMES.map(([uid, givenName, familyName]) => [
      uid,
      { givenName, familyName },
    ])
  );
  const rosterUids = NAMES.map(([uid]) => uid).filter(
    (uid) => !classId || uid !== 's8'
  );
  return (
    <DialogProvider>
      <AuthProvider>
        <CustomWidgetsProvider>
          <SavedWidgetsProvider>
            <DashboardProvider>
              <div className="flex min-h-screen flex-col items-start gap-4 bg-slate-900 p-8">
                <div className="flex gap-1 text-xs font-semibold text-white">
                  {[340, 520, 820].map((w) => (
                    // no-tour-anchor: dev-only harness
                    <button
                      key={w}
                      type="button"
                      onClick={() => setWidth(w)}
                      className={`rounded-lg px-3 py-1.5 ${w === width ? 'bg-white text-slate-900' : 'bg-slate-700'}`}
                    >
                      {w}px
                    </button>
                  ))}
                </div>
                <div
                  data-testid="writing-monitor-frame"
                  className="overflow-hidden rounded-2xl bg-white shadow-xl"
                  style={{
                    width,
                    height: Math.round(width * 1.15),
                    containerType: 'size',
                  }}
                >
                  <WritingMonitorView
                    session={SESSION}
                    periodBar={
                      new URLSearchParams(window.location.search).get(
                        'classes'
                      ) === 'manual'
                        ? PERIOD_BAR
                        : null
                    }
                    fallbackClasses={{ classIds: [], periodNames: [] }}
                    responses={RESPONSES}
                    names={names}
                    rosterUids={rosterUids}
                    loading={false}
                    missing={false}
                    classId={classId}
                    onClassChange={setClassId}
                    onBack={() => undefined}
                  />
                </div>
              </div>
            </DashboardProvider>
          </SavedWidgetsProvider>
        </CustomWidgetsProvider>
      </AuthProvider>
      <DialogContainer />
    </DialogProvider>
  );
};
