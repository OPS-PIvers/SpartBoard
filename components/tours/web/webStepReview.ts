import type {
  GuidedLearningSet,
  GuidedLearningStep,
  WebTourBinding,
} from '@/types';
import type { NameMatcher } from '@/components/widgets/GuidedLearning/components/recorder/redaction';
import {
  findStudentData,
  isHardHit,
  REDACTED,
  type StudentDataHit,
} from './studentData';

/** Every piece of captured or written text the admin reviews before publishing. */
export type ReviewField =
  | 'label'
  | 'text'
  | 'url'
  | 'role'
  | 'name'
  | 'pageText'
  | 'css'
  | `frame:${number}`;

export interface ReviewEntry {
  field: ReviewField;
  value: string;
  hits: StudentDataHit[];
}

const frameField = (i: number): ReviewField => `frame:${i}`;

/** The step's text fields in review order, each with its student-data hits. */
export function reviewEntries(
  step: Pick<GuidedLearningStep, 'label' | 'text'> & { web?: WebTourBinding },
  matcher: NameMatcher | null
): ReviewEntry[] {
  const web = step.web;
  const raw: [ReviewField, string | undefined][] = [
    ['label', step.label],
    ['text', step.text],
    ['url', web?.urlPattern],
    ['role', web?.locator.role],
    ['name', web?.locator.name],
    ['pageText', web?.locator.text],
    ['css', web?.locator.css],
    ...(web?.locator.frames ?? []).map(
      (f, i) => [frameField(i), f.urlPattern] as [ReviewField, string]
    ),
  ];
  return raw
    .filter((e): e is [ReviewField, string] => !!e[1]?.trim())
    .map(([field, value]) => ({
      field,
      value,
      hits: findStudentData(value, matcher),
    }));
}

const isUrlField = (field: ReviewField) =>
  field === 'url' || field.startsWith('frame:');

/** The field's value with every hit hidden: `*` in addresses, the redaction mark elsewhere. */
export function hideHits(entry: ReviewEntry): string {
  const mark = isUrlField(entry.field) ? '*' : REDACTED;
  let out = '';
  let at = 0;
  for (const hit of entry.hits) {
    out += entry.value.slice(at, hit.start) + mark;
    at = hit.end;
  }
  return out + entry.value.slice(at);
}

type WebStep = GuidedLearningStep & { web?: WebTourBinding };

/** Writes a new value (or removes the field, for `undefined`) into a copy of the step. */
export function setReviewField(
  step: WebStep,
  field: ReviewField,
  value: string | undefined
): WebStep {
  if (field === 'label' || field === 'text') return { ...step, [field]: value };
  const web = step.web;
  if (!web) return step;
  if (field === 'url')
    return { ...step, web: { ...web, urlPattern: value ?? '*' } };
  if (field.startsWith('frame:')) {
    const index = Number(field.slice('frame:'.length));
    const frames = (web.locator.frames ?? []).map((f, i) =>
      i === index ? { ...f, urlPattern: value ?? '*' } : f
    );
    return { ...step, web: { ...web, locator: { ...web.locator, frames } } };
  }
  const key: 'role' | 'name' | 'text' | 'css' =
    field === 'pageText' ? 'text' : (field as 'role' | 'name' | 'css');
  const locator = { ...web.locator };
  if (value === undefined) delete locator[key];
  else locator[key] = value;
  return { ...step, web: { ...web, locator } };
}

// FNV-1a, enough to notice that a checked step changed afterwards.
const fnv = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
};

/** Fingerprint of everything the student-data tick covers: text, address, clues and picture. */
export function reviewSignature(step: WebStep): string {
  const web = step.web;
  const loc = web?.locator ?? {};
  // Fixed field order: Firestore doesn't keep map key order.
  return fnv(
    JSON.stringify([
      step.label ?? '',
      step.text ?? '',
      web?.urlPattern ?? '',
      loc.role ?? '',
      loc.name ?? '',
      loc.text ?? '',
      loc.css ?? '',
      (loc.frames ?? []).map((f) => [f.urlPattern, f.index]),
      loc.box ? [loc.box.x, loc.box.y, loc.box.w, loc.box.h] : null,
      web?.picture?.path ?? '',
    ])
  );
}

/** Whether the admin's tick still covers the step as it is now. */
export const isStepChecked = (step: WebStep): boolean =>
  !!step.web?.checked && step.web.checked.sig === reviewSignature(step);

/** Ticks the step as checked by this admin now. */
export function markStepChecked(step: WebStep, uid: string): WebStep {
  if (!step.web) return step;
  return {
    ...step,
    web: {
      ...step.web,
      checked: { by: uid, at: Date.now(), sig: reviewSignature(step) },
    },
  };
}

export function clearStepCheck(step: WebStep): WebStep {
  if (!step.web?.checked) return step;
  const { checked: _checked, ...web } = step.web;
  return { ...step, web };
}

export type PublishBlocker =
  | { kind: 'no-steps' }
  | { kind: 'title-data' }
  | { kind: 'not-web'; stepId: string }
  | { kind: 'student-data'; stepId: string; field: ReviewField }
  | { kind: 'unchecked'; stepId: string };

/** Why the tour can't be published yet; empty when it can. */
export function publishBlockers(
  set: Pick<GuidedLearningSet, 'steps'> & { title?: string },
  matcher: NameMatcher | null
): PublishBlocker[] {
  const steps = set.steps as WebStep[];
  if (steps.length === 0) return [{ kind: 'no-steps' }];
  const out: PublishBlocker[] = [];
  if (findStudentData(set.title ?? '', matcher).some(isHardHit))
    out.push({ kind: 'title-data' });
  for (const step of steps) {
    if (!step.web) {
      out.push({ kind: 'not-web', stepId: step.id });
      continue;
    }
    for (const entry of reviewEntries(step, matcher))
      if (entry.hits.some(isHardHit))
        out.push({ kind: 'student-data', stepId: step.id, field: entry.field });
    if (!isStepChecked(step)) out.push({ kind: 'unchecked', stepId: step.id });
  }
  return out;
}

/** Throws unless the set passes the publish gate; every publish path calls this. */
export function assertPublishable(
  set: Pick<GuidedLearningSet, 'steps'> & { title?: string },
  matcher: NameMatcher | null
): void {
  const blockers = publishBlockers(set, matcher);
  if (blockers.length > 0)
    throw new Error(
      `Web tour can't be published: ${blockers.map((b) => b.kind).join(', ')}`
    );
}
