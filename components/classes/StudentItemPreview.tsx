// View Student Page's Open: one assignment as its students see it, local only; nothing is written.
import React, { Suspense, lazy, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, Loader2, ScrollText, X } from 'lucide-react';
import { Z_INDEX } from '@/config/zIndex';
import { WritingStudentShell } from '@/components/student/writing/WritingStudentShell';
import type { StudentPagePreviewItem } from '@/utils/studentPagePreviewLoad';
import type { GuidedLearningSet, ProjectGroup } from '@/types';
import { LayoutRouter } from '@/components/activityWall/render';
import { WallShell } from '@/components/activityWall/submission/WallShell';
import { MemoryFlashcardAdapter } from '@/components/flashcards/adapters';
import { ProjectOwnGroupSteps } from '@/components/student/project/ProjectOwnGroupSteps';
import { ProjectGroupWork } from '@/components/student/project/ProjectGroupWork';
import { ProjectRubricSheet } from '@/components/student/project/ProjectRubricSheet';
import { rubricMaxPoints } from '@/utils/rubricPoints';

const QuizStudentView = lazy(() =>
  import('@/components/quiz/QuizStudentView').then((m) => ({
    default: m.QuizStudentView,
  }))
);
const GuidedLearningPlayer = lazy(() =>
  import('@/components/widgets/GuidedLearning/components/GuidedLearningPlayer').then(
    (m) => ({ default: m.GuidedLearningPlayer })
  )
);
const MiniAppTryAsStudent = lazy(() =>
  import('@/components/widgets/MiniApp/components/MiniAppTryAsStudent').then(
    (m) => ({ default: m.MiniAppTryAsStudent })
  )
);
const FlashcardPlayer = lazy(() =>
  import('@/components/flashcards/FlashcardPlayer').then((m) => ({
    default: m.FlashcardPlayer,
  }))
);
const VideoActivityPreviewPlayer = lazy(() =>
  import('./VideoActivityPreviewPlayer').then((m) => ({
    default: m.VideoActivityPreviewPlayer,
  }))
);

const noWrite = (): Promise<void> => Promise.resolve();
const noop = (): void => undefined;

const Spinner: React.FC = () => (
  <div className="flex h-full items-center justify-center bg-slate-50">
    <Loader2 className="h-8 w-8 animate-spin text-brand-blue-primary" />
  </div>
);

/** The quiz and mini app views bring their own bar; the rest share this one. */
const Frame: React.FC<{
  title: string;
  onExit: () => void;
  children: React.ReactNode;
}> = ({ title, onExit, children }) =>
  createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Student view"
      className="fixed inset-0 flex flex-col bg-white"
      style={{ zIndex: Z_INDEX.modalDeep }}
    >
      <div className="flex h-11 shrink-0 items-center gap-2 bg-slate-900 px-3 text-xs text-slate-300">
        <div className="flex min-w-0 items-center gap-1.5 font-bold text-white">
          <Eye className="h-4 w-4 shrink-0" aria-hidden />
          <span className="shrink-0">Student view</span>
          <span className="truncate font-normal text-slate-300">{title}</span>
        </div>
        <button
          type="button"
          onClick={onExit}
          // no-tour-anchor: exits a full-screen preview a tour never opens on its own
          className="ml-auto flex shrink-0 items-center gap-1 rounded-md bg-white px-2.5 py-1 font-bold text-slate-900 hover:bg-slate-100"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          Exit
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <Suspense fallback={<Spinner />}>{children}</Suspense>
      </div>
    </div>,
    document.body
  );

const FlashcardsPreview: React.FC<{
  item: Extract<StudentPagePreviewItem, { kind: 'flashcards' }>;
}> = ({ item: { session } }) => {
  const [adapter] = useState(() => new MemoryFlashcardAdapter());
  const isCheck = session.kind === 'check';
  return (
    <FlashcardPlayer
      cards={session.cards}
      termLanguage={session.termLanguage}
      definitionLanguage={session.definitionLanguage}
      adapter={adapter}
      seed={`${session.id}:preview`}
      testQuestionBar
      missedCards={session.missedCards === true}
      studySettings={isCheck ? undefined : session.studySettings}
      lockedSettings={isCheck ? session.lockedSettings : undefined}
      check={
        isCheck && session.checkMode
          ? {
              mode: session.checkMode,
              masteryThreshold: session.masteryThreshold,
              submitting: false,
              onSubmit: noop,
            }
          : undefined
      }
    />
  );
};

const ProjectPreview: React.FC<{
  item: Extract<StudentPagePreviewItem, { kind: 'projects' }>;
}> = ({ item: { run } }) => {
  const [rubricOpen, setRubricOpen] = useState(false);
  const group: ProjectGroup = {
    id: 'preview',
    name: '',
    classId: '',
    memberUids: [],
    order: 0,
    stepStates: {},
    updatedAt: 0,
  };
  return (
    <div className="h-full overflow-y-auto bg-slate-50 px-4 pb-10 pt-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-black tracking-tight text-slate-900">
              {run.title}
            </h1>
            {run.dueAt && (
              <p className="text-sm font-medium text-slate-500">
                Due {new Date(run.dueAt).toLocaleDateString()}
              </p>
            )}
          </div>
          {run.rubric && (
            <button
              type="button"
              onClick={() => setRubricOpen(true)}
              // no-tour-anchor: student view inside a preview; tours don't walk it
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              <ScrollText className="h-4 w-4" strokeWidth={2.25} />
              How this is scored
            </button>
          )}
        </div>
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <ProjectOwnGroupSteps
            group={group}
            steps={run.steps}
            canEdit={false}
            busyStepId={null}
            openStepId={null}
            onOpenStep={noop}
            onPick={noop}
          />
        </section>
        <ProjectGroupWork
          steps={run.steps}
          workLinks={[]}
          uploads={[]}
          uploadsLoading={false}
          canEdit={false}
          uid=""
          onAddLink={noWrite}
          onRemoveLink={noWrite}
          onUpload={noWrite}
          onRemoveUpload={noWrite}
          onError={noop}
        />
      </div>
      {rubricOpen && run.rubric && (
        <ProjectRubricSheet
          rubric={run.rubric}
          maxPoints={run.rubricMaxPoints ?? rubricMaxPoints(run.rubric)}
          onClose={() => setRubricOpen(false)}
        />
      )}
    </div>
  );
};

export const StudentItemPreview: React.FC<{
  item: StudentPagePreviewItem;
  tabAwayTimerOn: boolean;
  onExit: () => void;
}> = ({ item, tabAwayTimerOn, onExit }) => {
  switch (item.kind) {
    case 'quiz':
      return (
        <Suspense fallback={null}>
          <QuizStudentView
            assigned={item.view}
            tabAwayTimerOn={tabAwayTimerOn}
            onExit={onExit}
          />
        </Suspense>
      );
    case 'mini-app':
      return (
        <Suspense fallback={null}>
          <MiniAppTryAsStudent
            title={item.title}
            html={item.html}
            manifest={item.manifest}
            answerKey={item.answerKey}
            onClose={onExit}
          />
        </Suspense>
      );
    case 'video-activity':
      return (
        <Frame title={item.session.activityTitle ?? ''} onExit={onExit}>
          <VideoActivityPreviewPlayer
            session={item.session}
            keyQuestions={item.key}
          />
        </Frame>
      );
    case 'guided-learning': {
      const s = item.session;
      return (
        <Frame title={s.title} onExit={onExit}>
          <div
            className="h-full overflow-hidden bg-slate-950"
            style={{ containerType: 'size' }}
          >
            <GuidedLearningPlayer
              set={
                {
                  id: s.id,
                  schemaVersion: s.schemaVersion,
                  title: s.title,
                  imageUrls: s.imageUrls,
                  imageKinds: s.imageKinds,
                  videoTrims: s.videoTrims,
                  steps: s.publicSteps,
                  mode: s.mode,
                  createdAt: s.createdAt,
                  updatedAt: s.createdAt,
                  hotspotPulse: s.hotspotPulse,
                  imageTransition: s.imageTransition,
                  welcomeEnabled: s.welcomeEnabled,
                  welcomeMessage: s.welcomeMessage,
                  watchPace: s.watchPace,
                } as GuidedLearningSet
              }
              teacherMode={false}
              autoPlay
            />
          </div>
        </Frame>
      );
    }
    case 'activity-wall': {
      const wall = item.session;
      return (
        <Frame title={wall.title} onExit={onExit}>
          <div className="h-full [&>div]:h-full">
            <WallShell
              appearance={wall.appearance}
              title={wall.title}
              prompt={wall.prompt}
              open={wall.acceptingResponses !== false}
            >
              <LayoutRouter
                session={wall}
                submissions={item.posts}
                mode="student"
                appearance={wall.appearance}
                showNames={wall.showNames ?? false}
              />
            </WallShell>
          </div>
        </Frame>
      );
    }
    case 'flashcards':
      return (
        <Frame title={item.session.title} onExit={onExit}>
          <FlashcardsPreview item={item} />
        </Frame>
      );
    case 'projects':
      return (
        <Frame title={item.run.title} onExit={onExit}>
          <ProjectPreview item={item} />
        </Frame>
      );
    case 'writing':
      return (
        <WritingStudentShell session={item.session} onDone={onExit} />
      );
  }
};
