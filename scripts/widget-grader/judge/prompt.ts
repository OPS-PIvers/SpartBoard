// Judge prompt: the rubric's descriptors, script measurements, screenshots and Paul's calibration examples for one widget.

import type { Criterion, CriterionId, Level, Rubric } from '../types.ts';
import type { CalibrationExample } from '../grading/apply.ts';
import {
  applicabilityFacts,
  isNotApplicable,
  plainWords,
  shotsFor,
  type WidgetInput,
} from '../grading/deck.ts';

const MAX_EXAMPLES = 6;

export interface JudgePromptOptions {
  rubric: Rubric;
  widget: WidgetInput;
  examples: CalibrationExample[];
  /** Widgets whose Paul scores the judge must not see (held-out widgets in the judge test). */
  exclude?: string[];
  /** Limit to these criteria; defaults to every Judge or Script + Judge criterion. */
  criteria?: CriterionId[];
}

/** Criteria the judge scores for this widget, with the levels each one allows. */
export function judgedCriteria(
  rubric: Rubric,
  widget: WidgetInput,
  only?: CriterionId[]
): { criterion: Criterion; levels: Level[] }[] {
  const facts = applicabilityFacts(widget);
  return rubric.dimensions
    .flatMap((d) => d.criteria)
    .filter(
      (c) =>
        c.method !== 'script' &&
        (!only || only.includes(c.id)) &&
        !isNotApplicable(c, facts)
    )
    .map((criterion) => ({
      criterion,
      levels: (Object.keys(criterion.descriptors) as `${Level}`[])
        .map(Number)
        .sort((a, b) => a - b) as Level[],
    }));
}

const examplesFor = (
  id: CriterionId,
  opts: JudgePromptOptions
): CalibrationExample[] => {
  const blocked = new Set([opts.widget.type, ...(opts.exclude ?? [])]);
  const latest = new Map<string, CalibrationExample>();
  for (const e of opts.examples) {
    if (e.criterionId !== id || blocked.has(e.widgetType)) continue;
    const prev = latest.get(e.widgetType);
    if (!prev || prev.gradedAt < e.gradedAt) latest.set(e.widgetType, e);
  }
  return [...latest.values()]
    .sort((a, b) => b.gradedAt.localeCompare(a.gradedAt))
    .slice(0, MAX_EXAMPLES);
};

export function buildJudgePrompt(opts: JudgePromptOptions): string {
  const { rubric, widget } = opts;
  const judged = judgedCriteria(rubric, widget, opts.criteria);
  const out: string[] = [
    `# Grade the ${widget.name} widget (${widget.type})`,
    '',
    `Rubric ${rubric.version}. Score each criterion below on its own levels, from the screenshots and measurements only. Open every screenshot with the Read tool before scoring.`,
    '',
    'Rules:',
    '- Pick exactly one of the levels listed for the criterion. Some criteria skip levels; never use a level that is not listed.',
    '- Never answer N/A. Applicability is decided by rule before you see the card (R15).',
    '- A script level, where given, is evidence, not an answer. Disagree with it when the screenshots show otherwise.',
    "- Paul's examples show how he reads the descriptors on other widgets. Match his reading, not the example widget's score.",
    '- Keep each reason to one sentence that names what you saw.',
    '',
  ];
  for (const { criterion: c, levels } of judged) {
    out.push(`## ${c.id} ${c.name}`, '', `Method: ${c.methodNotes}`, '');
    for (const l of levels) out.push(`- ${l}: ${c.descriptors[`${l}`]}`);
    if (c.banList?.length) out.push('', `Ban list: ${c.banList.join('; ')}.`);
    const m = widget.measurements.find(
      (x) => x.criterionId === c.id && x.size === null && !x.gate
    );
    if (m) {
      out.push('', 'Script measurements:');
      for (const line of plainWords(m.values)) out.push(`- ${line}`);
      if (m.impliedLevel != null) out.push(`- Script level: ${m.impliedLevel}`);
    }
    const shots = shotsFor(widget.type, c.id, widget.measurements);
    if (shots.length) {
      out.push('', 'Screenshots:');
      for (const s of shots) out.push(`- ${s.from} (${s.caption})`);
    }
    const examples = examplesFor(c.id, opts);
    if (examples.length) {
      out.push('', "Paul's examples:");
      for (const e of examples)
        out.push(
          `- ${e.widgetType}: ${e.paul}${e.note ? `. ${e.note}` : ''}${e.missed ? ` (descriptor missed: ${e.missed})` : ''}`
        );
    }
    out.push('');
  }
  out.push(
    '## Answer',
    '',
    'Reply with one JSON block and nothing after it:',
    '',
    '```json',
    JSON.stringify(
      {
        widgetType: widget.type,
        scores: Object.fromEntries(
          judged.map(({ criterion }) => [
            criterion.id,
            { level: 0, why: 'one sentence' },
          ])
        ),
      },
      null,
      2
    ),
    '```',
    ''
  );
  return out.join('\n');
}
