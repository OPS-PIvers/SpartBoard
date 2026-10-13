import type { GuidedLearningSet, GuidedLearningStep } from '@/types';

export type ClaudePromptTarget =
  | { kind: 'activity' }
  | { kind: 'slide'; slideIndex: number }
  | { kind: 'step'; stepId: string };

const DEV_PROJECT = 'spartboard-dev';

export const isDevProject = (): boolean =>
  import.meta.env.VITE_FIREBASE_PROJECT_ID === DEV_PROJECT;

const stepName = (step: GuidedLearningStep, number: number): string =>
  step.label?.trim()
    ? `step ${number} ("${step.label.trim()}")`
    : `step ${number}`;

/** Starter prompt naming the exact connector ids for one part of a Guided Learning set. */
export function buildClaudePrompt(
  set: Pick<
    GuidedLearningSet,
    'id' | 'title' | 'steps' | 'isBuilding' | 'helpCenter'
  > &
    Partial<Pick<GuidedLearningSet, 'mode'>>,
  target: ClaudePromptTarget,
  options: { dev?: boolean } = {}
): string {
  if (set.mode === 'tour') return buildTourPrompt(set, target, options);
  const source = set.isBuilding || set.helpCenter ? 'building' : 'mine';
  const title = set.title.trim() || 'Untitled activity';
  const activity = `my SpartBoard Guided Learning activity "${title}" (set_id: ${set.id}, source: ${source})`;
  const lines: string[] = [];
  if (options.dev) lines.push('Use the SpartBoard-Dev connector.');

  if (target.kind === 'activity') {
    lines.push(
      `I'm working on ${activity}.`,
      'Fetch it first with get_guided_learning.'
    );
  } else if (target.kind === 'slide') {
    const n = target.slideIndex + 1;
    const onSlide = set.steps
      .map((step, i) => ({ step, number: i + 1 }))
      .filter(({ step }) => step.imageIndex === target.slideIndex);
    lines.push(
      `I'm working on slide ${n} of ${activity}.`,
      `Fetch it first with get_guided_learning, then look at the slide with get_guided_learning_slide (slide_index: ${target.slideIndex}).`
    );
    if (onSlide.length > 0) {
      const names = onSlide.map(({ step, number }) => stepName(step, number));
      const ids = onSlide.map(({ step }) => step.id).join(', ');
      lines.push(
        `Its steps are ${names.join(', ')}. Slides are numbered by position, so if they have moved, find the slide by these step ids: ${ids}.`
      );
    } else {
      lines.push('This slide has no steps yet.');
    }
  } else {
    const index = set.steps.findIndex((s) => s.id === target.stepId);
    const step = set.steps[index];
    if (!step) return buildClaudePrompt(set, { kind: 'activity' }, options);
    lines.push(
      `I'm working on ${stepName(step, index + 1)}, on slide ${step.imageIndex + 1}, of ${activity}.`,
      `Fetch it first with get_guided_learning and find the step by its id, ${step.id}, since step numbers change when steps move.`
    );
  }

  lines.push('', 'What I want: ');
  return lines.join('\n');
}

// Live tours have their own connector tools and no slides.
function buildTourPrompt(
  set: Pick<GuidedLearningSet, 'id' | 'title' | 'steps'>,
  target: ClaudePromptTarget,
  options: { dev?: boolean }
): string {
  const title = set.title.trim() || 'Untitled tour';
  const tour = `my SpartBoard live tour "${title}" (set_id: ${set.id})`;
  const lines: string[] = [];
  if (options.dev) lines.push('Use the SpartBoard-Dev connector.');
  const index =
    target.kind === 'step'
      ? set.steps.findIndex((s) => s.id === target.stepId)
      : -1;
  const step = set.steps[index];
  if (step) {
    lines.push(
      `I'm working on ${stepName(step, index + 1)} of ${tour}.`,
      `Fetch it first with get_live_tour and find the step by its id, ${step.id}, since step numbers change when steps move.`
    );
  } else {
    lines.push(`I'm working on ${tour}.`, 'Fetch it first with get_live_tour.');
  }
  lines.push('', 'What I want: ');
  return lines.join('\n');
}
