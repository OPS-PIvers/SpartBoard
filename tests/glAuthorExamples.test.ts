// The gl-author examples must pass the skill's validator and the app's own importer.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  readWidgetTypes,
  validateGlSet,
} from '@/.claude/skills/gl-author/scripts/validate_gl_json.mjs';
import { parseTourAnchorRef, TOUR_ANCHORS } from '@/config/tourAnchors';
import { anchorProblem } from '@/components/tours/tourHealth';
import { parseGuidedLearningJson } from '@/components/widgets/GuidedLearning/utils/glTransfer';
import { validateGuidedLearningImport } from '@/components/widgets/GuidedLearning/adapters/guidedLearningImportAdapter';
import type { GuidedLearningSet } from '@/types';

const DIR = join(process.cwd(), '.claude/skills/gl-author/examples');
const files = readdirSync(DIR).filter((f) => f.endsWith('.gl.json'));
const load = (file: string) => readFileSync(join(DIR, file), 'utf8');
const opts = {
  tourAnchors: { TOUR_ANCHORS, parseTourAnchorRef },
  widgetTypes: readWidgetTypes(),
};

describe('gl-author examples', () => {
  it('has a diagram showcase and a live tour', () => {
    const sets = files.map((f) => JSON.parse(load(f)) as GuidedLearningSet);
    const tours = sets.filter((s) => s.steps.some((step) => step.tour));
    expect(tours.length).toBeGreaterThan(0);
    expect(sets.length - tours.length).toBeGreaterThan(0);
  });

  it.each(files)('%s passes the validator and the importer', (file) => {
    const text = load(file);
    const { warnings } = validateGlSet(JSON.parse(text), opts);
    expect(warnings).toEqual([]);
    const parsed = parseGuidedLearningJson(text);
    expect(parsed.warnings).toEqual([]);
    expect(validateGuidedLearningImport(parsed.set)).toEqual({
      ok: true,
      errors: [],
    });
    for (const step of parsed.set.steps) {
      if (step.tour) expect(anchorProblem(step.tour.anchor)).toBeNull();
    }
  });

  it('the showcase uses every interaction and question type', () => {
    const showcase = files
      .map((f) => JSON.parse(load(f)) as GuidedLearningSet)
      .find((s) => !s.steps.some((step) => step.tour));
    const types = new Set(showcase?.steps.map((s) => s.interactionType));
    for (const type of [
      'tooltip',
      'text-popover',
      'pan-zoom',
      'spotlight',
      'pan-zoom-spotlight',
      'audio',
      'video',
      'question',
    ]) {
      expect(types).toContain(type);
    }
    const questions = new Set(
      showcase?.steps.map((s) => s.question?.type).filter(Boolean)
    );
    expect(questions).toEqual(
      new Set(['multiple-choice', 'matching', 'sorting'])
    );
  });

  it('the tour uses per-type and per-field refs', () => {
    const refs = files
      .map((f) => JSON.parse(load(f)) as GuidedLearningSet)
      .flatMap((s) => s.steps.map((step) => step.tour?.anchor ?? ''))
      .map(parseTourAnchorRef);
    expect(refs.some((r) => r.widgetType && !r.fieldKey)).toBe(true);
    expect(refs.some((r) => r.fieldKey)).toBe(true);
  });
});
