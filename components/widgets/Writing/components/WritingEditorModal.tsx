// Editor for one Writing assignment: prompt and Stimulus tabs on the left, limits and grading on the right.
import React, { useMemo, useState } from 'react';
import type {
  LibraryFolder,
  QuizStimulus,
  Rubric,
  WritingAssignmentDefinition,
  WritingGrading,
} from '@/types';
import { EditorWorkspace } from '@/components/common/EditorWorkspace';
import { FolderSelectField } from '@/components/common/library/FolderSelectField';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { tourAttr } from '@/config/tourAnchors';
import { rubricMaxPoints } from '@/utils/rubricPoints';
import {
  MAX_WRITING_POINTS,
  clampWritingPoints,
  writingGradingLabel,
  writingPointsLabel,
} from '@/utils/writingAssignments';
import { PromptRichEditor } from '@/components/widgets/QuizWidget/components/PromptRichEditor';
import {
  StimulusManagerPanel,
  type StimulusListState,
} from '@/components/widgets/QuizWidget/components/StimulusManagerPanel';
import { WordLimitFields } from '@/components/widgets/QuizWidget/components/WordLimitFields';
import { DraftNumberInput } from '@/components/widgets/QuizWidget/components/DraftNumberInput';
import { RubricBuilderPanel } from '@/components/widgets/QuizWidget/components/RubricBuilderPanel';
import { labelClass } from '@/components/widgets/QuizWidget/components/quizEditorFieldStyles';

type EditorTab = 'prompt' | 'stimuli';
type GradingMode = WritingGrading['mode'];

const TAB_ANCHORS = {
  prompt: tourAttr('writing-editor.tab-prompt'),
  stimuli: tourAttr('writing-editor.tab-stimuli'),
} as const;
const TAB_LABELS: Record<EditorTab, string> = {
  prompt: 'Prompt',
  stimuli: 'Stimuli',
};

const GRADING_OPTIONS: {
  value: GradingMode;
  label: string;
  anchor: ReturnType<typeof tourAttr>;
}[] = [
  {
    value: 'ungraded',
    label: 'Ungraded',
    anchor: tourAttr('writing-editor.grading-ungraded'),
  },
  {
    value: 'points',
    label: 'Points',
    anchor: tourAttr('writing-editor.grading-points'),
  },
  {
    value: 'rubric',
    label: 'Rubric',
    anchor: tourAttr('writing-editor.grading-rubric'),
  },
];

const DEFAULT_POINTS = 10;

// The fields a teacher edits; timestamps and order don't make the draft dirty.
const editedFields = (a: WritingAssignmentDefinition): string =>
  JSON.stringify([
    a.title,
    a.prompt,
    a.stimuli ?? [],
    a.minWords ?? null,
    a.maxWords ?? null,
    a.enforceWordLimit ?? false,
    a.grading,
    a.folderId ?? null,
  ]);

interface WritingEditorModalProps {
  isOpen: boolean;
  assignment: WritingAssignmentDefinition | null;
  folders: LibraryFolder[];
  teacherUid: string;
  onSave: (next: WritingAssignmentDefinition) => Promise<void>;
  onClose: () => void;
}

export const WritingEditorModal: React.FC<WritingEditorModalProps> = ({
  isOpen,
  assignment,
  folders,
  teacherUid,
  onSave,
  onClose,
}) => {
  const [draft, setDraft] = useState(assignment);
  const [tab, setTab] = useState<EditorTab>('prompt');
  const [saving, setSaving] = useState(false);
  const [rubricBuilderOpen, setRubricBuilderOpen] = useState(false);
  // The points total comes back if the teacher switches away and back.
  const [lastPoints, setLastPoints] = useState(
    assignment?.grading.mode === 'points'
      ? assignment.grading.points
      : DEFAULT_POINTS
  );

  // Re-seed while rendering when a different assignment opens.
  const [seededId, setSeededId] = useState(assignment?.id);
  if (seededId !== assignment?.id) {
    setSeededId(assignment?.id);
    setDraft(assignment);
    setTab('prompt');
    setRubricBuilderOpen(false);
  }

  const isDirty = useMemo(
    () =>
      Boolean(draft && assignment) &&
      editedFields(draft as WritingAssignmentDefinition) !==
        editedFields(assignment as WritingAssignmentDefinition),
    [draft, assignment]
  );

  // New identity on every draft edit; the autosave quiet period restarts on it.
  const draftToken = useMemo(() => [draft], [draft]);

  const stimuli = draft?.stimuli;
  const stimulusState = useMemo<StimulusListState>(() => {
    const setStimuli = (next: (list: QuizStimulus[]) => QuizStimulus[]) =>
      setDraft((current) =>
        current ? { ...current, stimuli: next(current.stimuli ?? []) } : current
      );
    return {
      stimuli: stimuli ?? [],
      addStimulus: (s) => setStimuli((list) => [...list, s]),
      updateStimulus: (id, updates) =>
        setStimuli((list) =>
          list.map((s) => (s.id === id ? { ...s, ...updates } : s))
        ),
      deleteStimulus: (id) =>
        setStimuli((list) => list.filter((s) => s.id !== id)),
    };
  }, [stimuli]);

  if (!draft) return null;

  const patch = (updates: Partial<WritingAssignmentDefinition>): void =>
    setDraft((current) => (current ? { ...current, ...updates } : current));

  const setGrading = (grading: WritingGrading): void => patch({ grading });

  const chooseMode = (mode: GradingMode): void => {
    if (mode === draft.grading.mode) return;
    if (mode === 'ungraded') setGrading({ mode: 'ungraded' });
    else if (mode === 'points')
      setGrading({ mode: 'points', points: lastPoints });
    // A rubric grade needs a rubric, so the builder opens and attaching selects it.
    else setRubricBuilderOpen(true);
  };

  const attachRubric = (rubric: Rubric, rubricId?: string): void => {
    setGrading({
      mode: 'rubric',
      rubricId: rubricId ?? rubric.id,
      rubricSnapshot: rubric,
    });
    setRubricBuilderOpen(false);
  };

  const detachRubric = (): void => {
    setGrading({ mode: 'ungraded' });
    setRubricBuilderOpen(false);
  };

  const incompleteNotice = !draft.prompt.trim() ? 'Add a prompt' : null;

  // Persist only; the shell owns closing.
  const persistDraft = async (): Promise<void> => {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  const contextPane = (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 gap-1 border-b border-slate-200 bg-white px-4 pt-3">
        {(['prompt', 'stimuli'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            {...TAB_ANCHORS[key]}
            className={`rounded-t-lg px-3 py-2 text-xs font-black uppercase tracking-wider transition-colors ${
              tab === key
                ? 'bg-brand-blue-primary text-white'
                : 'text-slate-500 hover:bg-brand-blue-lighter/30 hover:text-brand-blue-primary'
            }`}
          >
            {TAB_LABELS[key]}
            {key === 'stimuli' && (draft.stimuli?.length ?? 0) > 0
              ? ` (${draft.stimuli?.length})`
              : ''}
          </button>
        ))}
      </div>
      {tab === 'prompt' ? (
        <div className="px-5 py-4">
          <PromptRichEditor
            value={draft.prompt}
            onChange={(prompt) => patch({ prompt })}
            ariaLabel="Prompt"
            tourWidgetType="writing"
            anchor={tourAttr('writing-editor.prompt')}
          />
        </div>
      ) : (
        <StimulusManagerPanel state={stimulusState} tourWidgetType="writing" />
      )}
    </div>
  );

  const grading = draft.grading;
  const detailPane = (
    <div className="space-y-5 px-5 py-4">
      <WordLimitFields
        question={draft}
        onChange={(updates) => patch(updates)}
        tourWidgetType="writing"
      />

      <div>
        <span className={labelClass}>Grading</span>
        <SegmentedControl<GradingMode>
          value={grading.mode}
          onChange={chooseMode}
          options={GRADING_OPTIONS}
          ariaLabel="Grading"
          role="radiogroup"
        />
      </div>

      {grading.mode === 'points' && (
        <div>
          <label className={labelClass} htmlFor="writing-editor-points">
            Points
          </label>
          <DraftNumberInput
            id="writing-editor-points"
            value={grading.points}
            min={1}
            max={MAX_WRITING_POINTS}
            integer
            onCommit={(n) => {
              const points = clampWritingPoints(n);
              setLastPoints(points);
              setGrading({ mode: 'points', points });
            }}
            anchor={tourAttr('writing-editor.points')}
            className="max-w-[140px]"
          />
        </div>
      )}

      {grading.mode === 'rubric' && (
        <div>
          <span className={labelClass}>Rubric</span>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-slate-700">
              {grading.rubricSnapshot.title || 'Untitled rubric'}
            </span>
            <span className="text-xs text-slate-500">
              {writingPointsLabel(rubricMaxPoints(grading.rubricSnapshot))}
            </span>
            <button
              type="button"
              onClick={() => setRubricBuilderOpen(true)}
              className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-bold text-slate-700"
              {...tourAttr('writing-editor.rubric-edit')}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={detachRubric}
              className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-bold text-rose-700"
              {...tourAttr('writing-editor.rubric-detach')}
            >
              Detach
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <EditorWorkspace
      isOpen={isOpen}
      title={draft.title}
      onTitleChange={(title) => patch({ title })}
      titlePlaceholder="Writing assignment title"
      tourScope="writing"
      saveAnchor={tourAttr('writing-editor.save')}
      headerExtras={
        <FolderSelectField
          variant="header"
          folders={folders}
          value={draft.folderId ?? null}
          onChange={(folderId) => patch({ folderId })}
          anchor={tourAttr('writing-editor.folder')}
        />
      }
      subtitle={writingGradingLabel(grading)}
      isDirty={isDirty}
      isSaving={saving}
      saveLabel="Save"
      onSave={persistDraft}
      autosave={{ draftToken, resetKey: draft.id }}
      incompleteNotice={incompleteNotice}
      onClose={onClose}
      contextRatio={60}
      contextPane={contextPane}
      detailPane={detailPane}
      overlay={
        rubricBuilderOpen && (
          <RubricBuilderPanel
            key={draft.id}
            questionId={draft.id}
            existingSnapshot={
              grading.mode === 'rubric' ? grading.rubricSnapshot : undefined
            }
            onAttach={attachRubric}
            onDetach={detachRubric}
            onClose={() => setRubricBuilderOpen(false)}
            teacherUid={teacherUid}
          />
        )
      }
    />
  );
};
