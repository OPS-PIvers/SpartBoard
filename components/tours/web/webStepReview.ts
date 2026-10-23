import {
  WEB_TOUR_ATTR_KEYS,
  type GuidedLearningSet,
  type GuidedLearningStep,
  type WebTourBinding,
  type WebTourCheckResult,
  type WebTourStableAttrs,
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
  | 'heading'
  | 'pageTitle'
  | `attr:${keyof WebTourStableAttrs}`
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
    ['heading', web?.locator.heading],
    ['pageTitle', web?.locator.pageTitle],
    ...WEB_TOUR_ATTR_KEYS.map((k): [ReviewField, string | undefined] => [
      `attr:${k}`,
      web?.locator.attrs?.[k],
    ]),
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
  field === 'url' || field === 'attr:href' || field.startsWith('frame:');

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
  const locator = { ...web.locator };
  if (field.startsWith('attr:')) {
    const attr = field.slice('attr:'.length) as keyof WebTourStableAttrs;
    const attrs = { ...locator.attrs };
    if (value === undefined) delete attrs[attr];
    else attrs[attr] = value;
    if (Object.keys(attrs).length) locator.attrs = attrs;
    else delete locator.attrs;
    return { ...step, web: { ...web, locator } };
  }
  type TextKey = 'role' | 'name' | 'text' | 'css' | 'heading' | 'pageTitle';
  const key: TextKey = field === 'pageText' ? 'text' : (field as TextKey);
  if (value === undefined) delete locator[key];
  else locator[key] = value;
  return { ...step, web: { ...web, locator } };
}

// FNV-1a, enough to notice that the pictures changed since they were last confirmed.
const fnv = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
};

/** Every step picture path, in step order. */
export const tourPicturePaths = (
  set: Pick<GuidedLearningSet, 'steps'>
): string[] =>
  (set.steps as WebStep[]).flatMap((s) =>
    s.web?.picture ? [s.web.picture.path] : []
  );

/** Fingerprint of the tour's pictures; reordering steps keeps it, a new or removed picture changes it. */
export const picturesSignature = (
  set: Pick<GuidedLearningSet, 'steps'>
): string => fnv(JSON.stringify([...tourPicturePaths(set)].sort()));

/** Whether Publish must first ask about the pictures: there are some, and they changed since the last confirm. */
export const picturesNeedConfirm = (
  set: Pick<GuidedLearningSet, 'steps' | 'webPicturesChecked'>
): boolean =>
  tourPicturePaths(set).length > 0 &&
  set.webPicturesChecked?.sig !== picturesSignature(set);

/** Records that this admin confirmed the pictures as they are now. */
export const confirmPictures = (
  set: GuidedLearningSet,
  uid: string
): GuidedLearningSet => ({
  ...set,
  webPicturesChecked: { by: uid, at: Date.now(), sig: picturesSignature(set) },
});

// Map keys sorted, so a Firestore round trip that reorders them keeps the signature.
const sortedKeys = (_key: string, value: unknown): unknown =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
          a < b ? -1 : a > b ? 1 : 0
        )
      )
    : value;

/** Fingerprint of what playback looks for: step ids in order, and each step's page, action and locator (frames included); text, notes and pictures stay out (C13). */
export const targetsSignature = (
  set: Pick<GuidedLearningSet, 'steps'>
): string =>
  fnv(
    JSON.stringify(
      (set.steps as WebStep[]).map((s) => [
        s.id,
        s.web?.urlPattern ?? null,
        s.web?.action ?? null,
        s.web?.locator ?? null,
      ]),
      sortedKeys
    )
  );

/** The last check run's results, or null once a target changed since it ran. */
export const currentCheckResults = (
  set: Pick<GuidedLearningSet, 'steps' | 'webTourChecked'>
): Record<string, WebTourCheckResult> | null => {
  const run = set.webTourChecked;
  return run && run.sig === targetsSignature(set) ? run.results : null;
};

/** Whether the draft has a check run of these targets in which every step was found clearly. */
export const checkPasses = (
  set: Pick<GuidedLearningSet, 'steps' | 'webTourChecked'>
): boolean => {
  const results = currentCheckResults(set);
  return (
    !!results &&
    set.steps.length > 0 &&
    set.steps.every((s) => results[s.id] === 'found')
  );
};

/** Starts a check run of the targets as they are now, clearing any earlier results. */
export const startCheckRun = (
  set: GuidedLearningSet,
  uid: string,
  sig = targetsSignature(set)
): GuidedLearningSet => ({
  ...set,
  webTourChecked: { by: uid, at: Date.now(), sig, results: {} },
});

/** Records one step's result for the run started with `sig`; a result from an older run is dropped. */
export const recordCheckResult = (
  set: GuidedLearningSet,
  sig: string,
  stepId: string,
  result: WebTourCheckResult
): GuidedLearningSet => {
  const run = set.webTourChecked;
  if (!run || run.sig !== sig || !set.steps.some((s) => s.id === stepId))
    return set;
  if (run.results[stepId] === result) return set;
  return {
    ...set,
    webTourChecked: { ...run, results: { ...run.results, [stepId]: result } },
  };
};

export interface HiddenText {
  /** 0-based step index, or null for the tour title. */
  step: number | null;
  field: ReviewField;
  before: string;
  after: string;
}

/** Hides every hard student-data hit in the title and step text, and lists what changed. */
export function hideStudentData(
  set: GuidedLearningSet,
  matcher: NameMatcher | null
): { set: GuidedLearningSet; hidden: HiddenText[] } {
  const hidden: HiddenText[] = [];
  const hideHard = (entry: ReviewEntry): string | null => {
    const hard = entry.hits.filter(isHardHit);
    return hard.length ? hideHits({ ...entry, hits: hard }) : null;
  };
  let title = set.title;
  const titleEntry: ReviewEntry = {
    field: 'label',
    value: title,
    hits: findStudentData(title, matcher),
  };
  const newTitle = hideHard(titleEntry);
  if (newTitle !== null) {
    hidden.push({ step: null, field: 'label', before: title, after: newTitle });
    title = newTitle;
  }
  const steps = (set.steps as WebStep[]).map((step, i) => {
    let next = step;
    for (const entry of reviewEntries(step, matcher)) {
      const after = hideHard(entry);
      if (after === null) continue;
      hidden.push({ step: i, field: entry.field, before: entry.value, after });
      next = setReviewField(next, entry.field, after);
    }
    return next;
  });
  return hidden.length
    ? { set: { ...set, title, steps }, hidden }
    : { set, hidden };
}

export type PublishBlocker =
  | { kind: 'no-steps' }
  | { kind: 'title-data' }
  | { kind: 'not-web'; stepId: string }
  | { kind: 'student-data'; stepId: string; field: ReviewField }
  | { kind: 'unchecked' };

/** Why the tour can't be published yet; empty when it can. */
export function publishBlockers(
  set: Pick<GuidedLearningSet, 'steps' | 'webTourChecked'> & {
    title?: string;
  },
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
  }
  if (!checkPasses(set)) out.push({ kind: 'unchecked' });
  return out;
}

/** Throws unless the set passes the publish gate, pictures confirmed as they are now; every publish path calls this. */
export function assertPublishable(
  set: Pick<
    GuidedLearningSet,
    'steps' | 'webPicturesChecked' | 'webTourChecked'
  > & {
    title?: string;
  },
  matcher: NameMatcher | null
): void {
  const kinds: string[] = publishBlockers(set, matcher).map((b) => b.kind);
  if (picturesNeedConfirm(set)) kinds.push('pictures-unchecked');
  if (kinds.length > 0)
    throw new Error(`Web tour can't be published: ${kinds.join(', ')}`);
}

/** A step playback can only find by page position, or not at all: the editor offers Fix on site. */
export const needsFixOnSite = (step: { web?: WebTourBinding }): boolean => {
  const loc = step.web?.locator;
  return !loc || (!(loc.role && loc.name) && !loc.text);
};
