import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

// Fails when an assignment widget builds its own monitor, Live view, results or grader instead of reusing Quiz's.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const Q = 'components/widgets/QuizWidget/components';

const FIX = [
  'Assignment widgets (Quiz, Writing, Video Activity, Flashcards, Mini Apps, Guided Learning and any new one) reuse the Quiz shells for the monitor, Live view, results and grader. Never build one from scratch: when the shared piece lacks something, extend it (a prop, a slot, a label) and keep Quiz working.',
  `Shared pieces: ${Q}/monitor/ (ClassPicker and PeriodBar, PeriodAccessStrip, StatusBuckets, RosterList, RosterParts, QuestionResults, LiveViewPanel, LiveLogList), ${Q}/results/ (ResultsHome, StudentAnswerLine, StudentResultsControl, StudentResultsBulkBar, ShowResultsDialog, SegmentedToggle), ${Q}/FreeResponseGrader, ${Q}/RubricScoringPanel and ${Q}/ResultsPrintModal. Flashcards' FlashcardMonitor.tsx and FlashcardCheckRoster.tsx are the worked example.`,
  "Read .claude/rules/assignment-shells.md. The allowlists below only shrink: an entry needs Paul's OK named in the PR.",
].join('\n');

// Every AssignmentKind: its widget folder and the file-name prefixes its teacher code uses anywhere under components/.
const ASSIGNMENT_WIDGETS: Record<string, { dir: string; prefixes: string[] }> =
  {
    quiz: { dir: 'components/widgets/QuizWidget', prefixes: [] },
    'video-activity': {
      dir: 'components/widgets/VideoActivityWidget',
      prefixes: ['VideoActivity', 'Va'],
    },
    'guided-learning': {
      dir: 'components/widgets/GuidedLearning',
      prefixes: ['GuidedLearning', 'Gl'],
    },
    'mini-app': { dir: 'components/widgets/MiniApp', prefixes: ['MiniApp'] },
    flashcards: {
      dir: 'components/widgets/Flashcards',
      prefixes: ['Flashcard'],
    },
    writing: { dir: 'components/widgets/Writing', prefixes: ['Writing'] },
  };

// The shared pieces every assignment widget must import, and the extra ones for written answers or a Live view.
const PIECES = {
  ClassPicker: `${Q}/monitor/PeriodBar`,
  StatusBuckets: `${Q}/monitor/StatusBuckets`,
  QuestionResults: `${Q}/monitor/QuestionResults`,
  Roster: `${Q}/monitor/RosterList or ${Q}/monitor/RosterParts`,
  ResultsHome: `${Q}/results/ResultsHome`,
  StudentResultsControl: `${Q}/results/StudentResultsControl`,
  FreeResponseGrader: `${Q}/FreeResponseGrader`,
  LiveViewPanel: `${Q}/monitor/LiveViewPanel`,
} as const;
type Piece = keyof typeof PIECES;
const PIECE_IMPORT: Record<Piece, RegExp> = {
  ClassPicker: /'[^']*QuizWidget\/components\/monitor\/PeriodBar'/,
  StatusBuckets: /'[^']*QuizWidget\/components\/monitor\/StatusBuckets'/,
  Roster: /'[^']*QuizWidget\/components\/monitor\/Roster(?:List|Parts)'/,
  QuestionResults: /'[^']*QuizWidget\/components\/monitor\/QuestionResults'/,
  ResultsHome: /'[^']*QuizWidget\/components\/results\/ResultsHome'/,
  StudentResultsControl:
    /'[^']*QuizWidget\/components\/results\/StudentResultsControl'/,
  FreeResponseGrader: /'[^']*QuizWidget\/components\/FreeResponseGrader'/,
  LiveViewPanel: /'[^']*QuizWidget\/components\/monitor\/LiveViewPanel'/,
};
// Once a widget has a file for a surface (by name), it must import that surface's shared pieces.
const SURFACES: { files: RegExp; pieces: Piece[]; writtenOnly?: Piece[] }[] = [
  {
    files: /Monitor|Roster|Submission/,
    pieces: ['ClassPicker', 'StatusBuckets', 'Roster', 'QuestionResults'],
  },
  {
    files: /Results|Grad(?:er|ing)|Marking/,
    pieces: ['ResultsHome', 'StudentResultsControl'],
    writtenOnly: ['FreeResponseGrader'],
  },
  { files: /LiveView/, pieces: ['LiveViewPanel'] },
];
// Kinds whose students write answers a teacher marks by hand.
const WRITTEN_ANSWERS = new Set(['video-activity', 'writing']);

// Shared pieces a widget doesn't use yet. Only shrinks: delete the entry in the PR that adopts the piece.
const NOT_YET_ADOPTED: Record<string, Piece[]> = {
  // AB-249
  'video-activity': [
    'FreeResponseGrader',
    'QuestionResults',
    'ResultsHome',
    'Roster',
  ],
  // AB-250
  'guided-learning': ['QuestionResults', 'ResultsHome', 'Roster'],
  // AB-251
  'mini-app': [
    'QuestionResults',
    'ResultsHome',
    'Roster',
    'StudentResultsControl',
  ],
};

// Grader files that don't render FreeResponseGrader today. Only shrinks.
const OWN_GRADER_FILES: string[] = [
  // AB-249
  'components/widgets/VideoActivityWidget/components/results/VaShortAnswerMarking.tsx',
];

// Local components that copy a shared piece, and the piece to use instead.
// wrapper/via: a thin wrapper named like the shell is fine when the file renders that shell itself.
const CLONES: { name: RegExp; use: string; wrapper?: RegExp; via?: RegExp }[] =
  [
    {
      name: /(?:Roster(?:List|Row|Toolbar|RowMenu)|RowMenu|PercentPill)$/,
      use: `RosterList, or RosterRow/RosterToolbar/RosterRowMenu/RosterScorePill from ${Q}/monitor/RosterParts`,
      wrapper: /Roster(?:List)?$/,
      via: /'[^']*QuizWidget\/components\/monitor\/Roster(?:List|Parts)'/,
    },
    {
      name: /StatusBuckets?$/,
      use: `StatusBuckets from ${Q}/monitor/StatusBuckets`,
    },
    {
      name: /(?:PeriodBar|ClassPicker|PeriodAccess\w*)$/,
      use: `ClassPicker/PeriodBar from ${Q}/monitor/PeriodBar and PeriodAccessStrip from ${Q}/monitor/PeriodAccessStrip`,
    },
    {
      name: /(?:QuestionDetail|QuestionResults|ItemResults\w*|ItemDetail\w*)$/,
      use: `QuestionResults/QuestionDetail/ItemResultsList/ItemDetailView from ${Q}/monitor/QuestionResults`,
    },
    {
      name: /(?:LiveView\w*|LiveLog\w*)$/,
      use: `LiveViewPanel from ${Q}/monitor/LiveViewPanel and LiveLogList from ${Q}/monitor/LiveLogList`,
      wrapper: /LiveView(?:Panel)?$/,
      via: /'[^']*QuizWidget\/components\/monitor\/LiveViewPanel'/,
    },
    {
      name: /(?:DrillRow|SummaryCard|ScoreDistribution\w*|ResultsHome)$/,
      use: `ResultsSummaryCard/ScoreDistributionBars/ResultsDrillRow from ${Q}/results/ResultsHome`,
    },
    {
      name: /(?:AnswerLine|ProgressLine|BulkBar|ResultsControl)$/,
      use: `StudentAnswerLine, StudentResultsControl and StudentResultsBulkBar from ${Q}/results/`,
    },
    {
      name: /(?:Grader|Grading\w*|GradeQueue|Marking|MarkRow|ScoringPanel|Score(?:Input|Field)|ResponsePane|StudentQueue)$/,
      use: `FreeResponseGrader from ${Q}/FreeResponseGrader and RubricScoringPanel from ${Q}/RubricScoringPanel`,
      wrapper: /Grader$/,
      via: /'[^']*QuizWidget\/components\/FreeResponseGrader'/,
    },
  ];

// Old sessionViews pieces the Quiz layout replaced; ScorePill, SessionBadge, LaunchedBySubTag and OverflowMenu are still shared.
const LEGACY_IMPORT =
  /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'(?:@\/|(?:\.\.?\/)+)[\w/]*sessionViews(?:\/\w+)?'/g;
const LEGACY_NAMES =
  /\b(SessionRow|SessionViewHeader|StatTile|SegmentedTabs|ActionButton|PeriodAccessControls)\b/g;

// Copies that exist today, per file. Only shrinks: delete the entry in the PR that moves the file onto the shared piece.
const KNOWN_COPIES: Record<string, string[]> = {
  // AB-252
  'components/widgets/Flashcards/results/FlashcardMonitor.tsx': ['PercentPill'],
  'components/widgets/Flashcards/results/FlashcardResultsView.tsx': [
    'SessionViewHeader',
  ],
  'components/widgets/Flashcards/results/FlashcardSpeakResults.tsx': [
    'SessionRow',
    'StatTile',
  ],
  'components/widgets/Flashcards/results/FlashcardStudyResults.tsx': [
    'SegmentedTabs',
    'SessionRow',
    'StatTile',
  ],
  // AB-250
  'components/widgets/GuidedLearning/components/results/StudentProgressLine.tsx':
    ['StudentProgressLine'],
  // AB-251
  'components/widgets/MiniApp/components/MiniAppResultsView.tsx': ['DrillRow'],
  'components/widgets/MiniApp/components/SubmissionsModal.tsx': [
    'PeriodAccessControls',
  ],
  // AB-249
  'components/widgets/VideoActivityWidget/components/Results.tsx': [
    'SessionRow',
  ],
  'components/widgets/VideoActivityWidget/components/VideoActivityLivePlayer.tsx':
    ['ActionButton', 'SessionViewHeader'],
  'components/widgets/VideoActivityWidget/components/monitor/VaRosterList.tsx':
    ['RowMenu', 'VaRosterList'],
  'components/widgets/VideoActivityWidget/components/monitor/VideoActivityMonitor.tsx':
    ['QuestionDetail'],
  'components/widgets/VideoActivityWidget/components/results/VaResultsParity.tsx':
    ['DrillRow'],
  'components/widgets/VideoActivityWidget/components/results/VaShortAnswerMarking.tsx':
    ['MarkRow', 'VaShortAnswerMarking'],
};

const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

// Type-only imports don't render anything, so they don't count as using a shared piece.
const valueImports = (text: string) =>
  text.replace(/import\s+type\s+[^;]*?from\s+'[^']+';?/g, '');

// Tracked and new untracked files, so a fresh draft is caught before its first commit.
const componentFiles = (): string[] =>
  execFileSync(
    'git',
    [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      '--',
      'components/',
    ],
    { cwd: repoRoot, encoding: 'utf8' }
  )
    .split('\n')
    .filter(
      (f) =>
        /\.tsx?$/.test(f) &&
        !f.includes('.test.') &&
        !f.includes('.dev.') &&
        !f.startsWith('components/dev/') &&
        existsSync(resolve(repoRoot, f))
    );

// Student-side apps, whose files share the prefixes but are not teacher views.
const STUDENT_DIRS =
  /^components\/(?:student|quiz|flashcards|miniApp|guidedLearning|videoActivity)\//;

const kindOf = (file: string): string | null => {
  const name = basename(file);
  if (STUDENT_DIRS.test(file)) return null;
  for (const [kind, { dir, prefixes }] of Object.entries(ASSIGNMENT_WIDGETS)) {
    if (file.startsWith(dir + '/')) return kind;
    if (prefixes.some((p) => new RegExp(`^${p}[A-Z]`).test(name))) return kind;
  }
  return null;
};

const COMPONENT_DEF =
  /(?:^|\n)\s*(?:export\s+(?:default\s+)?)?(?:const|let|function|class)\s+([A-Z]\w*)/g;

const findCopies = (text: string): { name: string; use: string }[] => {
  const found: { name: string; use: string }[] = [];
  for (const m of text.matchAll(COMPONENT_DEF)) {
    const name = m[1];
    const clone = CLONES.find((c) => c.name.test(name));
    if (!clone) continue;
    if (clone.wrapper?.test(name) && clone.via?.test(valueImports(text)))
      continue;
    found.push({ name, use: clone.use });
  }
  for (const m of text.matchAll(LEGACY_IMPORT)) {
    for (const n of m[1].matchAll(LEGACY_NAMES))
      found.push({
        name: n[1],
        use: `the Quiz layout (old sessionViews piece): ${Q}/monitor/ and ${Q}/results/`,
      });
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
};

const sortedRecord = (
  r: Record<string, string[]>
): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  for (const k of Object.keys(r).sort())
    if (r[k].length) out[k] = [...r[k]].sort();
  return out;
};

describe('assignment widgets reuse the Quiz shells', () => {
  const files = componentFiles();

  it('registers every assignment kind', () => {
    const union = read(
      'components/assignmentsHub/useUnifiedAssignments.ts'
    ).match(/export type AssignmentKind =([^;]+);/)?.[1];
    const kinds = [...(union ?? '').matchAll(/'([\w-]+)'/g)].map((m) => m[1]);
    expect(kinds.length).toBeGreaterThan(0);
    expect(
      kinds.sort(),
      `New AssignmentKind: add its widget folder and file prefixes to ASSIGNMENT_WIDGETS (and WRITTEN_ANSWERS if teachers mark written answers) in tests/assignmentShells.static.test.ts.\n${FIX}`
    ).toEqual(Object.keys(ASSIGNMENT_WIDGETS).sort());
  });

  it('builds no copy of a shared monitor, Live view, results or grader piece', () => {
    const copies: Record<string, string[]> = {};
    const hints: string[] = [];
    for (const file of files) {
      const kind = kindOf(file);
      if (!kind || kind === 'quiz' || !file.endsWith('.tsx')) continue;
      const found = findCopies(read(file));
      if (!found.length) continue;
      copies[file] = found.map((f) => f.name);
      for (const f of found)
        if (!KNOWN_COPIES[file]?.includes(f.name))
          hints.push(`${file}: ${f.name} -> use ${f.use}`);
    }
    expect(
      sortedRecord(copies),
      `${hints.length ? `New copy of a shared Quiz piece:\n${hints.join('\n')}\n\n` : 'A known copy is gone: delete its KNOWN_COPIES entry (and finish or trim its AB item).\n\n'}${FIX}`
    ).toEqual(sortedRecord(KNOWN_COPIES));
  });

  it('grades inside FreeResponseGrader, not a shell of its own', () => {
    const own: string[] = [];
    for (const file of files) {
      const kind = kindOf(file);
      if (
        kind &&
        WRITTEN_ANSWERS.has(kind) &&
        file.endsWith('.tsx') &&
        /Grad(?:er|ing)|Marking/.test(basename(file)) &&
        !PIECE_IMPORT.FreeResponseGrader.test(valueImports(read(file)))
      )
        own.push(file);
    }
    expect(
      own.sort(),
      `A grader file must render ${Q}/FreeResponseGrader itself (its student list, drag handles, inline Score, graded checks and Auto-advance). Wrapping only the outer modal or RubricScoringPanel and hand-building the panes inside misses every Quiz grader change; add a prop or slot to FreeResponseGrader instead.\n\n${FIX}`
    ).toEqual(OWN_GRADER_FILES);
  });

  it('imports the shared pieces each assignment widget needs', () => {
    const text: Record<string, string> = {};
    const names: Record<string, string[]> = {};
    for (const file of files) {
      const kind = kindOf(file);
      if (!kind || kind === 'quiz') continue;
      text[kind] = (text[kind] ?? '') + valueImports(read(file));
      (names[kind] ??= []).push(basename(file));
    }
    const missing: Record<string, Piece[]> = {};
    for (const kind of Object.keys(names)) {
      const needed = new Set<Piece>();
      for (const s of SURFACES)
        if (names[kind].some((n) => s.files.test(n)))
          [
            ...s.pieces,
            ...(WRITTEN_ANSWERS.has(kind) ? (s.writtenOnly ?? []) : []),
          ].forEach((p) => needed.add(p));
      missing[kind] = [...needed].filter(
        (p) => !PIECE_IMPORT[p].test(text[kind])
      );
    }
    const hints = [
      ...Object.entries(missing).flatMap(([kind, pieces]) =>
        pieces
          .filter((p) => !NOT_YET_ADOPTED[kind]?.includes(p))
          .map((p) => `${kind} must import ${p} from ${PIECES[p]}`)
      ),
      ...Object.entries(NOT_YET_ADOPTED).flatMap(([kind, pieces]) =>
        pieces
          .filter((p) => !missing[kind]?.includes(p))
          .map((p) => `${kind} now uses ${p}: delete it from NOT_YET_ADOPTED`)
      ),
    ];
    expect(sortedRecord(missing), `${hints.join('\n')}\n\n${FIX}`).toEqual(
      sortedRecord(NOT_YET_ADOPTED)
    );
  });

  it('spots copies in the self-check', () => {
    const names = (src: string) => findCopies(src).map((f) => f.name);
    expect(
      names(`import { FreeResponseGrader } from '@/components/widgets/QuizWidget/components/FreeResponseGrader';
export const WritingGrader: React.FC = () => <FreeResponseGrader />;
const WritingStudentQueue: React.FC = () => null;`)
    ).toEqual(['WritingStudentQueue']);
    expect(
      names(`import { LiveViewPanel } from '@/components/widgets/QuizWidget/components/monitor/LiveViewPanel';
export const WritingLiveView: React.FC = () => <LiveViewPanel />;`)
    ).toEqual([]);
    expect(
      names(`import type { LiveViewPanelProps } from '@/components/widgets/QuizWidget/components/monitor/LiveViewPanel';
export const WritingLiveView: React.FC = () => null;`)
    ).toEqual(['WritingLiveView']);
    expect(
      names(`
const WritingLiveViewPanel: React.FC<P> = () => null;
export function WritingRosterList(props: P) { return null; }
const DrillRow = ({ a }: P) => null;
const Grader = React.memo(() => null);
const WritingGradingPanel: React.FC = () => null;
const Fine: React.FC = () => null;
const ROW_STYLE = { a: 1 };
import { SessionRow, ScorePill } from '@/components/common/sessionViews';
import { StatTile } from '@/components/common/sessionViews/StatTile';
export default function WritingGrader() { return null; }
const WritingStudentRosterRow: FC<P> = () => null;
const WritingDrillRow = <R,>(props: R) => null;
import { SegmentedTabs } from '../../common/sessionViews';`)
    ).toEqual([
      'DrillRow',
      'Grader',
      'SegmentedTabs',
      'SessionRow',
      'StatTile',
      'WritingDrillRow',
      'WritingGrader',
      'WritingGradingPanel',
      'WritingLiveViewPanel',
      'WritingRosterList',
      'WritingStudentRosterRow',
    ]);
  });
});
