import React, { useState } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { useAuth } from '@/context/useAuth';
import { useScoredWorkList, useScoredWorkScores } from '@/hooks/useScoredWork';
import { rubricMaxPoints } from '@/utils/scoredWorkMath';
import { RubricBuilderPanel } from '@/components/widgets/QuizWidget/components/RubricBuilderPanel';
import { NewScoredWork } from './NewScoredWork';
import { ScanStep } from './ScanStep';
import { ScoringStep } from './ScoringStep';
import { ShareStep } from './ShareStep';

type Step = 'scan' | 'score' | 'share';

interface ScoredWorkModalProps {
  onClose: () => void;
}

export const ScoredWorkModal: React.FC<ScoredWorkModalProps> = ({
  onClose,
}) => {
  const { user } = useAuth();
  const { data: works, loading } = useScoredWorkList(user?.uid);
  const [view, setView] = useState<string>('list');
  const [step, setStep] = useState<Step>('scan');
  const [builderOpen, setBuilderOpen] = useState(false);
  const [newRubricId, setNewRubricId] = useState<string | null>(null);
  const active = works.find((w) => w.id === view) ?? null;
  const { data: scores } = useScoredWorkScores(user?.uid, active?.id);

  const showList = view === 'list' || (!active && view !== 'new');
  let title = 'Scored paper work';
  if (view === 'new') title = 'New worksheet';
  else if (active) title = active.title;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={title}
      maxWidth="max-w-5xl"
      allowFullscreen
      className="max-h-[90vh] flex flex-col"
      contentClassName="px-6 pb-6 overflow-y-auto"
      overlay={
        builderOpen &&
        user && (
          <RubricBuilderPanel
            questionId="scored-work"
            attachLabel="Use for worksheet"
            onAttach={(rubric) => {
              setNewRubricId(rubric.id);
              setBuilderOpen(false);
            }}
            onDetach={() => setBuilderOpen(false)}
            onClose={() => setBuilderOpen(false)}
            teacherUid={user.uid}
          />
        )
      }
    >
      {!showList && (
        <button // no-tour-anchor: preview feature, tours are added when it opens
          type="button"
          onClick={() => setView('list')}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          All worksheets
        </button>
      )}

      {showList && (
        <div className="space-y-3">
          <Button
            onClick={() => setView('new')}
            icon={<Plus className="w-4 h-4" aria-hidden="true" />}
          >
            New worksheet
          </Button>
          {!loading && works.length === 0 && (
            <p className="text-sm text-slate-600">
              Print a worksheet to start.
            </p>
          )}
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {works.map((w) => (
              <li key={w.id}>
                <button // no-tour-anchor: preview feature, tours are added when it opens
                  type="button"
                  onClick={() => {
                    setView(w.id);
                    setStep(w.scans ? 'score' : 'scan');
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <span className="flex-1 truncate font-medium text-slate-800">
                    {w.title}
                  </span>
                  <span className="text-sm text-slate-500">
                    {w.rubric.title} · {rubricMaxPoints(w.rubric)} pts
                  </span>
                  <span className="text-sm text-slate-500">
                    {new Date(w.createdAt).toLocaleDateString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {view === 'new' && (
        <NewScoredWork
          onCreated={(id) => setView(id)}
          onOpenRubricBuilder={() => setBuilderOpen(true)}
          requestedRubricId={newRubricId}
        />
      )}

      {active && (
        <div className="space-y-4">
          <SegmentedControl<Step>
            value={step}
            onChange={setStep}
            ariaLabel="Step"
            options={[
              { value: 'scan', label: 'Scan' },
              { value: 'score', label: 'Score' },
              { value: 'share', label: 'Share' },
            ]}
          />
          {step === 'scan' && (
            <ScanStep work={active} onDone={() => setStep('score')} />
          )}
          {step === 'score' && <ScoringStep work={active} />}
          {step === 'share' && <ShareStep work={active} scores={scores} />}
        </div>
      )}
    </Modal>
  );
};
