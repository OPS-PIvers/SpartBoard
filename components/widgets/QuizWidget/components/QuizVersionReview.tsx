// Review step for a test with versions: structure only, wording is fixed later in the editors (QUIZ_IMPORT_VERSIONS V17).
import React from 'react';
import { AlertCircle } from 'lucide-react';
import { tourFieldAttr } from '@/config/tourAnchors';
import type {
  ExtractedImage,
  ImportedTestSet,
} from '@/utils/quizDocumentImport';
import {
  countMismatchFlag,
  planImportedRubrics,
} from '@/utils/quizDocumentImport/rubricImport';
import {
  NEW_GROUP,
  NO_GROUP,
  assignVersion,
  groupIsReordered,
  linkImage,
  planPairing,
  renameGroup,
  rubricSourceFor,
  setGroupCreate,
  setGroupKind,
  setVersionRubric,
  unlinkImage,
  type PlanGroup,
  type PlanGroupKind,
  type VersionPlan,
} from '@/utils/quizDocumentImport/versionPlan';

interface Props {
  set: ImportedTestSet;
  plan: VersionPlan;
  onChange: (next: VersionPlan) => void;
}

const KIND_LABEL: Record<PlanGroupKind, string> = {
  parallel: 'Random version',
  retake: 'Retake, random version',
  split: 'Split into parts',
  duplicate: 'One shuffled quiz',
};

// One URL per picture for the life of the read; a crop is a few KB, and revoking breaks remounts.
const previewUrls = new WeakMap<Blob, string>();
const previewUrl = (blob: Blob): string => {
  let url = previewUrls.get(blob);
  if (!url) {
    url = URL.createObjectURL(blob);
    previewUrls.set(blob, url);
  }
  return url;
};

const sectionLabel =
  'text-xxs font-bold uppercase tracking-wider text-slate-500';
const fieldClass =
  'rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800 focus:border-brand-blue-primary focus:outline-none';

export const QuizVersionReview: React.FC<Props> = ({ set, plan, onChange }) => {
  const labelOf = (v: number): string => set.versions[v]?.label ?? '';
  const groupOf = (v: number): PlanGroup | undefined =>
    plan.groups.find((g) => g.versions.includes(v));
  const imageById = new Map(set.images.map((img) => [img.id, img]));
  const sharable = Object.keys(set.sharedImages).filter((id) =>
    imageById.has(id)
  );

  const summary = (v: number): string => {
    const questions = set.versions[v]?.questions ?? [];
    const written =
      questions.length > 0 &&
      questions.every((q) => q.type === 'free-response');
    const pictures = new Set(questions.flatMap((q) => q.imageIds)).size;
    const what = written
      ? 'Written response'
      : `${questions.length} question${questions.length === 1 ? '' : 's'}`;
    return pictures > 0
      ? `${what} · ${pictures} picture${pictures === 1 ? '' : 's'}`
      : what;
  };

  const pairing = planPairing(set, plan);
  const mismatch = countMismatchFlag(pairing);
  // Flags only; the rubrics themselves are built again when the import saves (V16).
  const flagsByUnit = new Map(
    planImportedRubrics(rubricSourceFor(set, plan), pairing, set.fileTitle, {
      scoringGuides: false,
    }).map((p) => [p.unitIndex, p.flags])
  );
  const NO_RUBRIC = 'none';

  const pictureName = (img: ExtractedImage): string =>
    /^figure-page-\d+\.png$/.test(img.name) ? 'Picture' : img.name;

  return (
    <div className="space-y-4" data-testid="quiz-version-review">
      <p className="text-sm font-bold text-slate-700">
        {set.versions.length} versions found
      </p>

      <section className="space-y-1">
        <h4 className={sectionLabel}>Quizzes to create</h4>
        {plan.groups.length === 0 ? (
          <p className="text-xs text-slate-500">
            Every version goes to the question bank.
          </p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {plan.groups.map((g, gi) => {
              const reordered = groupIsReordered(set, g.versions);
              const kinds: PlanGroupKind[] = reordered
                ? ['parallel', 'retake', 'split', 'duplicate']
                : ['parallel', 'retake', 'split'];
              const field = `quiz-${gi + 1}`;
              return (
                <li key={g.id} className="space-y-1 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="checkbox"
                      {...tourFieldAttr(
                        'quiz-import.versions-quiz-create',
                        'quiz',
                        field
                      )}
                      checked={g.create}
                      onChange={(e) =>
                        onChange(setGroupCreate(plan, g.id, e.target.checked))
                      }
                      aria-label={`Create ${g.name || 'this quiz'}`}
                      className="shrink-0 accent-brand-blue-primary"
                    />
                    <input
                      type="text"
                      {...tourFieldAttr(
                        'quiz-import.versions-quiz-name',
                        'quiz',
                        field
                      )}
                      value={g.name}
                      disabled={!g.create}
                      onChange={(e) =>
                        onChange(renameGroup(plan, g.id, e.target.value))
                      }
                      aria-label="Quiz name"
                      className={`min-w-0 flex-1 basis-48 ${fieldClass} disabled:opacity-60`}
                    />
                    <select
                      {...tourFieldAttr(
                        'quiz-import.versions-quiz-kind',
                        'quiz',
                        field
                      )}
                      value={g.kind}
                      disabled={!g.create}
                      onChange={(e) =>
                        onChange(
                          setGroupKind(
                            set,
                            plan,
                            g.id,
                            e.target.value as PlanGroupKind
                          )
                        )
                      }
                      aria-label={`How ${g.name || 'this quiz'} uses its versions`}
                      className={`${fieldClass} disabled:opacity-60`}
                    >
                      {kinds.map((k) => (
                        <option key={k} value={k}>
                          {KIND_LABEL[k]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="pl-6 text-xs text-slate-600">
                    {g.versions.map(labelOf).join(', ')}
                  </p>
                  {reordered &&
                    g.versions.slice(1).map((v) => (
                      <p
                        key={v}
                        className="pl-6 text-xs font-medium text-slate-700"
                      >
                        {labelOf(v)} is {labelOf(g.versions[0])} reordered.
                      </p>
                    ))}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-1">
        <h4 className={sectionLabel}>Versions</h4>
        <ul className="divide-y divide-slate-200">
          {set.versions.map((version, v) => (
            <li
              key={v}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800">
                  {version.label}
                </p>
                <p className="text-xs text-slate-500">{summary(v)}</p>
              </div>
              <select
                {...tourFieldAttr(
                  'quiz-import.versions-version-quiz',
                  'quiz',
                  `version-${v + 1}`
                )}
                value={groupOf(v)?.id ?? NO_GROUP}
                onChange={(e) =>
                  onChange(assignVersion(set, plan, v, e.target.value))
                }
                aria-label={`Quiz for ${version.label}`}
                className={fieldClass}
              >
                {plan.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name || KIND_LABEL[g.kind]}
                  </option>
                ))}
                <option value={NEW_GROUP}>New quiz</option>
                <option value={NO_GROUP}>Question bank only</option>
              </select>
            </li>
          ))}
        </ul>
      </section>

      {set.rubrics.length > 0 && (
        <section className="space-y-1">
          <h4 className={sectionLabel}>Rubrics</h4>
          {mismatch && (
            <p className="flex items-start gap-1 text-xs font-medium text-amber-700">
              <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              {mismatch.message}
            </p>
          )}
          <ul className="divide-y divide-slate-200">
            {pairing.units.map((unit, ui) => {
              const first = unit.versions[0];
              const chosen = pairing.rubricFor[ui];
              const flags = flagsByUnit.get(ui) ?? [];
              return (
                <li key={first} className="space-y-1 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 text-sm font-bold text-slate-800">
                      {unit.label}
                    </p>
                    <select
                      {...tourFieldAttr(
                        'quiz-import.versions-rubric',
                        'quiz',
                        `version-${first + 1}`
                      )}
                      value={chosen === null ? NO_RUBRIC : String(chosen)}
                      onChange={(e) =>
                        onChange(
                          setVersionRubric(
                            plan,
                            first,
                            e.target.value === NO_RUBRIC
                              ? null
                              : Number(e.target.value)
                          )
                        )
                      }
                      aria-label={`Rubric for ${unit.label}`}
                      className={fieldClass}
                    >
                      {set.rubrics.map((r, ri) => (
                        <option key={ri} value={String(ri)}>
                          {r.label || r.title}
                        </option>
                      ))}
                      <option value={NO_RUBRIC}>No rubric</option>
                    </select>
                  </div>
                  {flags.length > 0 && (
                    <ul className="space-y-0.5">
                      {flags.map((f, fi) => (
                        <li
                          key={fi}
                          className="flex items-start gap-1 text-xs font-medium text-amber-700"
                        >
                          <AlertCircle
                            className="mt-px h-3.5 w-3.5 shrink-0"
                            aria-hidden
                          />
                          {f.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {sharable.length > 0 && (
        <section className="space-y-1">
          <h4 className={sectionLabel}>Pictures</h4>
          <ul className="divide-y divide-slate-200">
            {sharable.map((id) => {
              const img = imageById.get(id);
              if (!img) return null;
              const version = labelOf(set.imageVersion[id]);
              const source = set.sharedImages[id];
              const linked = plan.sharedImages[id] === source;
              return (
                <li key={id} className="flex items-center gap-3 py-2">
                  <img
                    src={previewUrl(img.blob)}
                    alt={`${pictureName(img)} in ${version}`}
                    className="h-12 w-16 shrink-0 rounded border border-slate-200 object-contain"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800">
                      {pictureName(img)} in {version}
                    </p>
                    <p className="text-xs text-slate-600">
                      {linked
                        ? `Same as ${labelOf(set.imageVersion[source])}`
                        : 'Kept as its own picture'}
                    </p>
                  </div>
                  <button
                    type="button"
                    {...tourFieldAttr(
                      'quiz-import.versions-picture-link',
                      'quiz',
                      id
                    )}
                    onClick={() =>
                      onChange(
                        linked
                          ? unlinkImage(plan, id)
                          : linkImage(plan, id, source)
                      )
                    }
                    className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-brand-blue-primary hover:bg-slate-100"
                  >
                    {linked ? 'Unlink' : 'Link'}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
};
