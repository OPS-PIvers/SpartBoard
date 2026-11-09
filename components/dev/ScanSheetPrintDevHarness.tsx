// DEV-only: the real Results print modal over a class of paper students with kept scan pages, at /scan-sheet-print-dev.

import React, { useMemo, useState } from 'react';
import { AuthProvider } from '@/context/AuthContext';
import { ResultsPrintModal } from '@/components/widgets/QuizWidget/components/ResultsPrintModal';
import type { PaperBatch, QuizData, QuizResponse } from '@/types';
import type { KeptPageLoader } from '@/utils/paperPageFetch';
import type { PaperCropResolver } from '@/utils/paperCropFetch';
import { gradeQuestionForResponse } from '@/utils/quizQuestionStats';
import {
  BUBBLE_QUIZ,
  SCAN_QUIZ,
  bubbleBatch,
  bubbleResponse,
  scanBatch,
  scanMarkup,
  scanResponse,
} from '@/tests/utils/fixtures/scanSheetFixture';

const FIRST = [
  'Maya',
  'Jordan',
  'Priya',
  'Mateo',
  'Sofia',
  'Elijah',
  'Hana',
  'Owen',
  'Lucia',
  'Theo',
];
const LAST = [
  'Okafor',
  'Larson',
  'Patel',
  'Garcia',
  'Olson',
  'Kim',
  'Berg',
  'Novak',
  'Reyes',
  'Dahl',
];

/** `?students=30&missing=6&onePage=1&hold=1&delay=400&sheet=bubble`; pages come from `/scan-fixture/{sheet}-{page}.webp`. */
function readParams() {
  const q = new URLSearchParams(window.location.search);
  const num = (k: string, d: number) => {
    const v = Number(q.get(k));
    return Number.isFinite(v) && q.has(k) ? v : d;
  };
  return {
    sheet:
      q.get('sheet') === 'bubble' ? ('bubble' as const) : ('written' as const),
    students: Math.max(1, num('students', 30)),
    missing: num('missing', 0),
    onePage: q.get('onePage') === '1',
    hold: q.get('hold') === '1',
    delay: num('delay', 0),
    fixture: q.get('fixture') ?? '/scan-fixture',
    reportChoice: q.get('reportChoice') === '1',
  };
}

interface Fixture {
  quiz: QuizData;
  batch: PaperBatch;
  responses: QuizResponse[];
  names: Map<string, string>;
}

function buildFixture(p: ReturnType<typeof readParams>): Fixture {
  const names = new Map<string, string>();
  const responses: QuizResponse[] = [];
  for (let i = 0; i < p.students; i += 1) {
    const key = `paper-${String(i + 1).padStart(2, '0')}`;
    const period = i < Math.ceil(p.students / 2) ? 'Period 2' : 'Period 4';
    names.set(key, `${FIRST[i % FIRST.length]} ${LAST[(i * 3) % LAST.length]}`);
    // The last `missing` students were imported with the switch off.
    const keeps =
      i >= p.students - p.missing ? [] : p.onePage && i === 0 ? [1] : [1, 2];
    if (p.sheet === 'bubble') {
      responses.push(
        bubbleResponse({
          responseKey: key,
          period,
          keptPages: keeps.filter((n) => n === 1),
        })
      );
    } else {
      const r = scanResponse({
        responseKey: key,
        period,
        keptPages: keeps,
        markup: { w1: scanMarkup() },
      });
      responses.push(r);
    }
  }
  names.set('paper-01', 'Maya Okafor');
  return p.sheet === 'bubble'
    ? { quiz: BUBBLE_QUIZ, batch: bubbleBatch(), responses, names }
    : { quiz: SCAN_QUIZ, batch: scanBatch(), responses, names };
}

async function fetchBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url);
    return res.ok ? await res.blob() : null;
  } catch {
    return null;
  }
}

const noop = (): void => undefined;

export const ScanSheetPrintDevHarness: React.FC = () => {
  const [params] = useState(readParams);
  const fixture = useMemo(() => buildFixture(params), [params]);
  const loadKeptPage = useMemo<KeptPageLoader>(
    () => async (_sessionId, ref) => {
      if (params.hold) return new Promise<Blob | null>(noop);
      if (params.delay) await new Promise((r) => setTimeout(r, params.delay));
      return fetchBlob(`${params.fixture}/${params.sheet}-${ref.page}.webp`);
    },
    [params]
  );
  const resolvePaperCrop = useMemo<PaperCropResolver>(
    () => async (req) => {
      const blob = await fetchBlob(
        `${params.fixture}/crop-${req.questionId}.webp`
      );
      if (!blob) throw new Error('no crop');
      return URL.createObjectURL(blob);
    },
    [params]
  );
  const loadPaperBatch = useMemo(
    () => () => Promise.resolve(fixture.batch),
    [fixture]
  );
  const nameOf = (r: QuizResponse) =>
    fixture.names.get(r._responseKey ?? '') ?? 'Student';
  const sortName = (r: QuizResponse) => {
    const [first, ...rest] = nameOf(r).split(' ');
    return `${rest.join(' ')} ${first}`;
  };
  return (
    <AuthProvider>
      <div className="h-screen [height:100dvh] overflow-y-auto bg-slate-200 p-6 pb-12">
        <ResultsPrintModal
          quiz={fixture.quiz}
          responses={fixture.responses}
          initialSelection={null}
          resolveName={nameOf}
          resolveShownName={nameOf}
          sortNameFor={sortName}
          targetsFor={() => []}
          gradeFn={gradeQuestionForResponse}
          rubricFor={() => undefined}
          periodOrder={['Period 2', 'Period 4']}
          sessionLive={false}
          sheetsAvailable
          reportChoice={params.reportChoice}
          teacherUid="mock-user-id"
          sessionId="session-dev"
          writtenReturnMode="handwriting"
          resolvePaperCrop={resolvePaperCrop}
          loadKeptPage={loadKeptPage}
          loadPaperBatch={loadPaperBatch}
          onClose={noop}
          onError={(m) => window.alert(m)}
        />
      </div>
    </AuthProvider>
  );
};
