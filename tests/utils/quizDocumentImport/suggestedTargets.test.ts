import { describe, expect, it } from 'vitest';
import type { LearningTarget } from '@/types';
import type { LearningTargetSource } from '@/hooks/useLearningTargets';
import {
  createDestinations,
  createSuggestedTargets,
  normalizeTargetCode,
  normalizeTargetLabel,
  planSuggestedTargets,
  resolveSuggestedTarget,
  suggestionKey,
  withTargetTag,
} from '@/utils/quizDocumentImport/suggestedTargets';

const target = (
  id: string,
  label: string,
  extra: Partial<LearningTarget> = {}
): LearningTarget => ({ id, label, createdAt: 1, updatedAt: 1, ...extra });

const personal = (targets: LearningTarget[]): LearningTargetSource => ({
  kind: 'personal',
  name: 'My learning targets',
  list: { targets, updatedAt: 1 },
});

const plc = (
  id: string,
  targets: LearningTarget[],
  name = `PLC ${id}`
): LearningTargetSource => ({
  kind: 'plc',
  ownerId: id,
  name,
  list: { targets, updatedAt: 1 },
});

describe('normalizeTargetCode', () => {
  it('treats spacing, dashes and case as the same code', () => {
    expect(normalizeTargetCode('ELT 1.1')).toBe('elt1.1');
    expect(normalizeTargetCode('ELT-1.1')).toBe('elt1.1');
    expect(normalizeTargetCode('elt1.1')).toBe('elt1.1');
    expect(normalizeTargetCode('ELT 1.1.')).toBe('elt1.1');
  });

  it('keeps the dot, so 1.1 and 11 stay different', () => {
    expect(normalizeTargetCode('ELT 1.1')).not.toBe(
      normalizeTargetCode('ELT 11')
    );
  });
});

describe('normalizeTargetLabel', () => {
  it('drops a leading "I can", case and trailing punctuation', () => {
    expect(normalizeTargetLabel('I can explain the  water cycle.')).toBe(
      normalizeTargetLabel('explain the water cycle')
    );
  });
});

describe('resolveSuggestedTarget', () => {
  it('matches an existing target by normalized code first', () => {
    const sources = [
      personal([target('p1', 'Explain the water cycle')]),
      plc('plc-a', [target('t1', 'Something else', { code: 'ELT-1.1' })]),
    ];
    const res = resolveSuggestedTarget(
      { code: 'ELT 1.1', label: 'Explain the water cycle' },
      sources
    );
    expect(res.kind).toBe('existing');
    if (res.kind !== 'existing') return;
    expect(res.target.id).toBe('t1');
    expect(res.tag).toMatchObject({
      id: 't1',
      kind: 'plc',
      ownerId: 'plc-a',
      code: 'ELT-1.1',
    });
  });

  it('falls back to the label when no code matches', () => {
    const sources = [personal([target('p1', 'I can explain the water cycle')])];
    const res = resolveSuggestedTarget(
      { code: 'LT3', label: 'explain the water cycle.' },
      sources
    );
    expect(res).toMatchObject({
      kind: 'existing',
      tag: { id: 'p1', kind: 'personal' },
    });
  });

  it('matches targets on a PLC the teacher only views', () => {
    const res = resolveSuggestedTarget({ code: 'LT3', label: 'x' }, [
      personal([]),
      plc('viewer-plc', [target('v1', 'y', { code: 'lt3' })]),
    ]);
    expect(res).toMatchObject({ kind: 'existing', tag: { id: 'v1' } });
  });

  it('ignores archived targets and offers to create', () => {
    const sources = [
      personal([target('p1', 'Explain', { code: 'LT1', archived: true })]),
    ];
    expect(
      resolveSuggestedTarget({ code: 'LT1', label: 'Explain' }, sources)
    ).toEqual({ kind: 'create' });
  });

  it('offers to create when a list is still loading', () => {
    const loading: LearningTargetSource = {
      kind: 'personal',
      name: 'My learning targets',
      list: null,
    };
    expect(resolveSuggestedTarget({ label: 'Explain' }, [loading])).toEqual({
      kind: 'create',
    });
  });
});

describe('createDestinations', () => {
  it('lists My targets and only the PLCs the teacher can edit', () => {
    const sources = [
      personal([]),
      plc('edit', [], 'Science PLC'),
      plc('view', [], 'Math PLC'),
    ];
    expect(createDestinations(sources, new Set(['edit']))).toEqual([
      { kind: 'personal', name: 'My learning targets' },
      { kind: 'plc', plcId: 'edit', name: 'Science PLC' },
    ]);
  });

  it('is just My targets when no PLC is editable', () => {
    expect(
      createDestinations([personal([]), plc('view', [])], new Set())
    ).toEqual([{ kind: 'personal', name: 'My learning targets' }]);
  });
});

describe('planSuggestedTargets + createSuggestedTargets', () => {
  it('creates each distinct target once and tags every row', () => {
    const suggestions = [
      { code: 'ELT 1.1', label: 'Explain the water cycle' },
      { code: 'ELT-1.1', label: 'Explain the water cycle' },
      { code: 'ELT 1.2', label: 'Describe evaporation' },
      { label: 'Already there' },
    ];
    const sources = [personal([target('p1', 'Already there')])];
    const plan = planSuggestedTargets(suggestions, sources);
    expect(plan.existing.get(suggestionKey(suggestions[3]))?.id).toBe('p1');
    expect(plan.toCreate.map((c) => c.suggestion.code)).toEqual([
      'ELT 1.1',
      'ELT 1.2',
    ]);

    const list = sources[0].list ?? { targets: [], updatedAt: 0 };
    const { list: next, tags } = createSuggestedTargets(
      list,
      plan.toCreate,
      { kind: 'plc', plcId: 'plc-a', name: 'Science PLC' },
      50
    );
    expect(next.targets).toHaveLength(3);
    expect(next.targets.slice(1).map((t) => t.code)).toEqual([
      'ELT 1.1',
      'ELT 1.2',
    ]);
    const first = tags.get(suggestionKey(suggestions[1]));
    expect(first).toMatchObject({
      kind: 'plc',
      ownerId: 'plc-a',
      label: 'Explain the water cycle',
    });
    expect(first?.id).toBe(next.targets[1].id);
  });

  it('uses the code as the label when the line had none', () => {
    const { list, tags } = createSuggestedTargets(
      { targets: [], updatedAt: 0 },
      [{ key: 'code:lt4', suggestion: { code: 'LT4', label: ' ' } }],
      { kind: 'personal', name: 'My learning targets' }
    );
    expect(list.targets[0]).toMatchObject({ code: 'LT4', label: 'LT4' });
    expect(tags.get('code:lt4')?.kind).toBe('personal');
  });
});

describe('withTargetTag', () => {
  it('does not tag a question twice with the same target', () => {
    const tag = { id: 't1', kind: 'personal' as const, label: 'x' };
    expect(withTargetTag([tag], tag)).toHaveLength(1);
    expect(withTargetTag(undefined, tag)).toEqual([tag]);
  });
});
