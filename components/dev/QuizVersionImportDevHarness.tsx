// DEV-ONLY: the real import wizard and version review on fixture reads; `?print=1` renders the matching test as pages to save as PDF.
import React, { useState } from 'react';
import { ImportWizard } from '@/components/common/library/importer';
import { createQuizImportAdapter } from '@/components/widgets/QuizWidget/adapters/quizImportAdapter';
import type { ExtractedImage } from '@/utils/quizDocumentImport';
import type { VersionImportBuild } from '@/utils/quizDocumentImport/versionPlan';
import {
  MAP_BOXES,
  MAP_PAGES,
  frqTestSet,
  mcReorderedTestSet,
} from './quizVersionFixtures';

const MapArt: React.FC<{ which: number }> = ({ which }) => (
  <svg viewBox="0 0 400 280" width="100%" height="100%">
    <rect x="1" y="1" width="398" height="278" fill="#eef2f7" stroke="#334" />
    {which === 0 ? (
      <>
        <path d="M40 60 L160 40 L220 90 L180 170 L80 190 Z" fill="#9db4d0" />
        <path d="M230 120 L340 100 L360 200 L250 230 Z" fill="#c9a66b" />
        <path d="M120 80 L200 120" stroke="#8b1d1d" strokeWidth="5" />
      </>
    ) : (
      <>
        <path d="M60 40 L300 50 L320 140 L90 160 Z" fill="#b6cfa3" />
        <circle cx="200" cy="200" r="45" fill="#d9926b" />
        <path d="M80 220 L340 230" stroke="#24476b" strokeWidth="6" />
      </>
    )}
    <text x="12" y="268" fontSize="14" fill="#222">
      {`MAP #${which + 1}. Source: World Religions Atlas, 2020`}
    </text>
  </svg>
);

/** Letter pages laid out to match the fixture's page numbers and map boxes. */
const PrintableTest: React.FC = () => {
  const set = frqTestSet();
  const pages = Array.from({ length: 17 }, (_, i) => i + 1);
  const mapPages = new Set<number>(Object.values(MAP_PAGES));
  return (
    <div>
      <style>{`@page { size: letter; margin: 0 } body { margin: 0; background: white; overflow: visible !important }`}</style>
      {pages.map((page) => {
        const version = set.versions.find((v) => v.pages?.start === page);
        const rubric = set.rubrics.find((r) => r.pages?.start === page);
        return (
          <div
            key={page}
            style={{
              position: 'relative',
              width: '8.5in',
              height: '11in',
              breakAfter: 'page',
              fontFamily: 'Georgia, serif',
              color: '#111',
            }}
          >
            <div style={{ position: 'absolute', left: '0.8in', top: '0.5in' }}>
              <b style={{ fontSize: 20 }}>
                {version?.label ?? rubric?.label ?? ''}
              </b>
            </div>
            {mapPages.has(page) &&
              MAP_BOXES.map((box, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: `${box.x * 100}%`,
                    top: `${box.y * 100}%`,
                    width: `${box.width * 100}%`,
                    height: `${box.height * 100}%`,
                  }}
                >
                  <MapArt which={i} />
                </div>
              ))}
            {version && (
              <div
                style={{
                  position: 'absolute',
                  left: '0.8in',
                  right: '0.8in',
                  top: mapPages.has(page) ? '50%' : '1.2in',
                  whiteSpace: 'pre-line',
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                {version.questions[0].text}
              </div>
            )}
            {rubric && (
              <div
                style={{ position: 'absolute', left: '0.8in', top: '1.2in' }}
              >
                {rubric.criteria.map((c) => (
                  <p key={c.letter}>
                    {c.letter}. {c.prompt} ({c.points})
                  </p>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// Module scope rather than a ref: the adapter's getters run outside render.
const harnessImages: { list: readonly ExtractedImage[] } = { list: [] };

const harnessAdapter = (onSaved: (build: VersionImportBuild) => void) =>
  createQuizImportAdapter({
    saveQuiz: () => Promise.resolve(),
    importFromSheet: () => Promise.reject(new Error('Not in the harness.')),
    importFromCSV: () => Promise.reject(new Error('Not in the harness.')),
    createQuizTemplate: () => Promise.reject(new Error('Not in the harness.')),
    ensureDriveScope: () => Promise.resolve(null),
    pickSheet: () => Promise.resolve(null),
    canImportDocuments: true,
    aiExtract: () => Promise.reject(new Error('Not in the harness.')),
    importVersions: true,
    aiExtractVersions: (input) =>
      Promise.resolve(
        /quiz/i.test(input.fileName) ? mcReorderedTestSet() : frqTestSet()
      ),
    onDocumentImages: (next) => {
      harnessImages.list = next;
    },
    documentImages: () => harnessImages.list,
    rubricScoringGuides: true,
    saveVersionImport: (build) => {
      onSaved(build);
      return Promise.resolve();
    },
  });

export const QuizVersionImportDevHarness: React.FC = () => {
  const [open, setOpen] = useState(true);
  const [saved, setSaved] = useState<VersionImportBuild | null>(null);
  if (new URLSearchParams(window.location.search).get('print'))
    return <PrintableTest />;

  const adapter = harnessAdapter(setSaved);

  return (
    <div className="h-screen h-dvh overflow-y-auto bg-slate-100 p-6">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-slate-700"
      >
        Open import
      </button>
      {saved && (
        <pre
          data-testid="harness-saved"
          className="mt-4 whitespace-pre-wrap text-xs text-slate-700"
        >
          {JSON.stringify(
            {
              folder: saved.folderTitle,
              bank: saved.bank?.questions.length ?? 0,
              rubrics: saved.rubrics.map((r) => r.title),
              rubricsAttached: saved.bank?.questions.map(
                (q) => q.rubricSnapshot?.title ?? null
              ),
              quizzes: saved.quizzes.map((p) => ({
                title: p.quiz.title,
                shuffle: p.shuffle,
                slots: p.quiz.bankSlots?.length ?? 0,
                sections: p.quiz.sections?.map((s) => s.title),
                rubrics: p.quiz.questions.map(
                  (q) =>
                    q.rubricSnapshot?.criteria.map((c) => c.name.slice(0, 1)) ??
                    null
                ),
              })),
            },
            null,
            2
          )}
        </pre>
      )}
      <ImportWizard
        isOpen={open}
        onClose={() => setOpen(false)}
        adapter={adapter}
      />
    </div>
  );
};
