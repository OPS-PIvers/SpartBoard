import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ClipboardPaste,
  FileUp,
  Plus,
  X,
} from 'lucide-react';
import {
  LEARNING_TARGET_LIST_CAP,
  LearningTargetList,
  StandardBenchmark,
} from '@/types';
import {
  DEFAULT_MASTERY_CUTOFFS,
  TargetCsvResult,
  addTargets,
  archiveTarget,
  parsePastedTargets,
  parseTargetsCsv,
  setMasteryCutoffs,
  unarchiveTarget,
} from '@/utils/learningTargets';
import { filterBenchmarks } from '@/hooks/useStandardsCatalog';
import { useSubjects } from '@/hooks/useSubjects';
import { ALL_GRADES } from '@/utils/gradeMatch';

interface LearningTargetsManagerProps {
  list: LearningTargetList | null;
  onSave: (list: LearningTargetList) => Promise<void>;
  canEdit: boolean;
  showMasteryCutoffs: boolean;
  standards?: StandardBenchmark[];
}

type Panel = 'add' | 'paste' | 'csv' | null;

const INPUT_CLASS =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary';
const PRIMARY_BTN =
  'inline-flex items-center gap-1.5 rounded-lg bg-brand-blue-primary px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-brand-blue-dark disabled:cursor-not-allowed disabled:opacity-50';
const SECONDARY_BTN =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

/** Searchable checklist of benchmarks; selection is a list of benchmark ids. */
const StandardsPicker: React.FC<{
  standards: StandardBenchmark[];
  selected: string[];
  onChange: (ids: string[]) => void;
}> = ({ standards, selected, onChange }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    if (!query.trim()) return [];
    return filterBenchmarks(standards, { query }).slice(0, 25);
  }, [standards, query]);
  const byId = useMemo(
    () => new Map(standards.map((s) => [s.id, s])),
    [standards]
  );
  const toggle = (id: string) =>
    onChange(
      selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id]
    );

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              className="inline-flex items-center gap-1 rounded-full bg-brand-blue-lighter px-2 py-0.5 text-xxs font-bold text-brand-blue-primary hover:bg-brand-blue-light/30"
              title={byId.get(id)?.text ?? id}
            >
              {byId.get(id)?.code ?? id}
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('learningTargets.searchStandards', {
          defaultValue: 'Search standards by code or text…',
        })}
        className={INPUT_CLASS}
        aria-label={t('learningTargets.searchStandards', {
          defaultValue: 'Search standards by code or text…',
        })}
      />
      {query.trim() && (
        <ul className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
          {matches.length === 0 && (
            <li className="px-3 py-2 text-xs text-slate-500">
              {t('learningTargets.noStandardsMatch', {
                defaultValue: 'No standards match.',
              })}
            </li>
          )}
          {matches.map((b) => {
            const checked = selected.includes(b.id);
            return (
              <li key={b.id}>
                <label className="flex cursor-pointer items-start gap-2 px-3 py-1.5 text-xs hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(b.id)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="font-mono font-bold text-slate-700">
                      {b.code}
                    </span>
                    <span className="ml-1.5 text-slate-600">{b.text}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export const LearningTargetsManager: React.FC<LearningTargetsManagerProps> = ({
  list,
  onSave,
  canEdit,
  showMasteryCutoffs,
  standards = [],
}) => {
  const { t } = useTranslation();
  const { active: subjects, byId: subjectById } = useSubjects();
  const [panel, setPanel] = useState<Panel>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);

  const [draftCode, setDraftCode] = useState('');
  const [draftLabel, setDraftLabel] = useState('');
  const [draftStandards, setDraftStandards] = useState<string[]>([]);
  const [draftGrades, setDraftGrades] = useState<string[]>([]);
  const [draftSubject, setDraftSubject] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [csvPreview, setCsvPreview] = useState<TargetCsvResult | null>(null);
  const [csvName, setCsvName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const cutoffs = list?.masteryCutoffs ?? DEFAULT_MASTERY_CUTOFFS;
  const [cutoffDraft, setCutoffDraft] = useState<{
    proficient: string;
    approaching: string;
  } | null>(null);
  const proficientValue = cutoffDraft?.proficient ?? String(cutoffs.proficient);
  const approachingValue =
    cutoffDraft?.approaching ?? String(cutoffs.approaching);
  const cutoffsDirty =
    cutoffDraft !== null &&
    (proficientValue !== String(cutoffs.proficient) ||
      approachingValue !== String(cutoffs.approaching));

  const codeById = useMemo(
    () => new Map(standards.map((s) => [s.id, s.code])),
    [standards]
  );
  const idByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of standards) {
      m.set(s.code.toLowerCase(), s.id);
      m.set(s.id.toLowerCase(), s.id);
    }
    return m;
  }, [standards]);

  const subjectIdByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of subjects) {
      m.set(s.id.toLowerCase(), s.id);
      m.set(s.label.toLowerCase(), s.id);
    }
    return m;
  }, [subjects]);
  const subjectLabel = (id: string | undefined) =>
    id ? (subjectById.get(id)?.label ?? id) : '—';
  const gradesLabel = (grades: string[] | undefined) =>
    grades && grades.length > 0 ? grades.join(', ') : '—';

  const active = useMemo(
    () => (list?.targets ?? []).filter((x) => !x.archived),
    [list]
  );
  const archived = useMemo(
    () => (list?.targets ?? []).filter((x) => x.archived),
    [list]
  );

  const commit = async (next: LearningTargetList): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      await onSave(next);
      return true;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('learningTargets.saveFailed', { defaultValue: 'Save failed' })
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const withList = (): LearningTargetList =>
    list ?? { targets: [], updatedAt: 0 };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftLabel.trim()) return;
    try {
      const next = addTargets(withList(), [
        {
          code: draftCode,
          label: draftLabel,
          standardIds: draftStandards,
          grades: draftGrades,
          subject: draftSubject,
        },
      ]);
      if (await commit(next)) {
        setDraftCode('');
        setDraftLabel('');
        setDraftStandards([]);
        setDraftGrades([]);
        setDraftSubject('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handlePaste = async () => {
    const drafts = parsePastedTargets(pasteText);
    if (drafts.length === 0) return;
    try {
      if (await commit(addTargets(withList(), drafts))) {
        setPasteText('');
        setPanel(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCsvFile = (file: File | undefined) => {
    if (!file) return;
    setCsvName(file.name);
    void file.text().then((text) => setCsvPreview(parseTargetsCsv(text)));
  };

  const handleCsvImport = async () => {
    if (!csvPreview || csvPreview.rows.length === 0) return;
    const drafts = csvPreview.rows.map((r) => ({
      code: r.code,
      label: r.label,
      standardIds: r.standardCodes
        .map((c) => idByCode.get(c.toLowerCase()))
        .filter((id): id is string => Boolean(id)),
      grades: r.grades,
      subject: r.subject ? subjectIdByName.get(r.subject.toLowerCase()) : '',
    }));
    try {
      if (await commit(addTargets(withList(), drafts))) {
        setCsvPreview(null);
        setCsvName('');
        if (fileRef.current) fileRef.current.value = '';
        setPanel(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleArchive = (id: string, restore: boolean) => {
    const next = restore
      ? unarchiveTarget(withList(), id)
      : archiveTarget(withList(), id);
    void commit(next);
  };

  const handleSaveCutoffs = async () => {
    try {
      const next = setMasteryCutoffs(withList(), {
        proficient: Number(proficientValue),
        approaching: Number(approachingValue),
      });
      if (await commit(next)) setCutoffDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const unresolvedCsvCodes = useMemo(() => {
    if (!csvPreview) return [];
    const missing = new Set<string>();
    for (const r of csvPreview.rows) {
      for (const c of r.standardCodes) {
        if (!idByCode.has(c.toLowerCase())) missing.add(c);
      }
    }
    return [...missing];
  }, [csvPreview, idByCode]);

  const unresolvedCsvSubjects = useMemo(() => {
    if (!csvPreview) return [];
    const missing = new Set<string>();
    for (const r of csvPreview.rows) {
      if (r.subject && !subjectIdByName.has(r.subject.toLowerCase())) {
        missing.add(r.subject);
      }
    }
    return [...missing];
  }, [csvPreview, subjectIdByName]);

  const togglePanel = (p: Panel) => setPanel((cur) => (cur === p ? null : p));
  const atCap = (list?.targets.length ?? 0) >= LEARNING_TARGET_LIST_CAP;

  return (
    <div className="space-y-4">
      {list === null ? (
        <p className="text-xs text-slate-500">
          {t('learningTargets.loading', { defaultValue: 'Loading targets…' })}
        </p>
      ) : active.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-500">
          {t('learningTargets.empty', {
            defaultValue:
              'No learning targets yet. Add one, paste a list, or import a CSV.',
          })}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-xxs font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">
                  {t('learningTargets.columns.code', { defaultValue: 'Code' })}
                </th>
                <th className="px-3 py-2">
                  {t('learningTargets.columns.label', {
                    defaultValue: 'Target',
                  })}
                </th>
                <th className="px-3 py-2">
                  {t('learningTargets.columns.standards', {
                    defaultValue: 'Standards',
                  })}
                </th>
                <th className="px-3 py-2">
                  {t('learningTargets.columns.grades', {
                    defaultValue: 'Grades',
                  })}
                </th>
                <th className="px-3 py-2">
                  {t('learningTargets.columns.subject', {
                    defaultValue: 'Subject',
                  })}
                </th>
                {canEdit && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {active.map((target) => (
                <tr key={target.id}>
                  <td className="px-3 py-2 font-mono font-bold text-slate-700 whitespace-nowrap">
                    {target.code ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-slate-800">{target.label}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {target.standardIds && target.standardIds.length > 0
                      ? target.standardIds
                          .map((id) => codeById.get(id) ?? id)
                          .join(', ')
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                    {gradesLabel(target.grades)}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {subjectLabel(target.subject)}
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleArchive(target.id, false)}
                        disabled={saving}
                        className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                        aria-label={t('learningTargets.archive', {
                          defaultValue: 'Archive target',
                        })}
                        title={t('learningTargets.archive', {
                          defaultValue: 'Archive target',
                        })}
                      >
                        <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {archived.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setArchivedOpen((o) => !o)}
            aria-expanded={archivedOpen}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-800"
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${archivedOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
            {t('learningTargets.archivedCount', {
              defaultValue: 'Archived ({{count}})',
              count: archived.length,
            })}
          </button>
          {archivedOpen && (
            <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white text-xs">
              {archived.map((target) => (
                <li
                  key={target.id}
                  className="flex items-center gap-3 px-3 py-2 text-slate-500"
                >
                  {target.code && (
                    <span className="font-mono font-bold">{target.code}</span>
                  )}
                  <span className="flex-1 line-through">{target.label}</span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => handleArchive(target.id, true)}
                      disabled={saving}
                      className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                      aria-label={t('learningTargets.restore', {
                        defaultValue: 'Restore target',
                      })}
                      title={t('learningTargets.restore', {
                        defaultValue: 'Restore target',
                      })}
                    >
                      <ArchiveRestore
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {canEdit && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => togglePanel('add')}
              disabled={atCap}
              className={panel === 'add' ? PRIMARY_BTN : SECONDARY_BTN}
              aria-expanded={panel === 'add'}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {t('learningTargets.addTarget', { defaultValue: 'Add target' })}
            </button>
            <button
              type="button"
              onClick={() => togglePanel('paste')}
              disabled={atCap}
              className={panel === 'paste' ? PRIMARY_BTN : SECONDARY_BTN}
              aria-expanded={panel === 'paste'}
            >
              <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
              {t('learningTargets.pasteList', { defaultValue: 'Paste list' })}
            </button>
            <button
              type="button"
              onClick={() => togglePanel('csv')}
              disabled={atCap}
              className={panel === 'csv' ? PRIMARY_BTN : SECONDARY_BTN}
              aria-expanded={panel === 'csv'}
            >
              <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
              {t('learningTargets.importCsv', { defaultValue: 'Import CSV' })}
            </button>
          </div>

          {panel === 'add' && (
            <form
              onSubmit={(e) => void handleAdd(e)}
              className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,3fr)] gap-2">
                <input
                  value={draftCode}
                  onChange={(e) => setDraftCode(e.target.value)}
                  placeholder={t('learningTargets.codePlaceholder', {
                    defaultValue: 'Code',
                  })}
                  className={INPUT_CLASS}
                  aria-label={t('learningTargets.columns.code', {
                    defaultValue: 'Code',
                  })}
                />
                <input
                  value={draftLabel}
                  onChange={(e) => setDraftLabel(e.target.value)}
                  placeholder={t('learningTargets.labelPlaceholder', {
                    defaultValue: 'I can…',
                  })}
                  className={INPUT_CLASS}
                  aria-label={t('learningTargets.columns.label', {
                    defaultValue: 'Target',
                  })}
                  required
                />
              </div>
              {standards.length > 0 && (
                <StandardsPicker
                  standards={standards}
                  selected={draftStandards}
                  onChange={setDraftStandards}
                />
              )}
              <div className="flex flex-wrap items-start gap-3">
                <div
                  role="group"
                  aria-label={t('learningTargets.columns.grades', {
                    defaultValue: 'Grades',
                  })}
                  className="flex flex-wrap gap-1"
                >
                  {ALL_GRADES.map((grade) => {
                    const selected = draftGrades.includes(grade);
                    return (
                      <button
                        key={grade}
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          setDraftGrades((cur) =>
                            cur.includes(grade)
                              ? cur.filter((g) => g !== grade)
                              : [...cur, grade]
                          )
                        }
                        className={`min-w-[2rem] rounded-md border px-2 py-1 text-xxs font-bold transition-colors ${
                          selected
                            ? 'border-brand-blue-primary bg-brand-blue-primary text-white'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-brand-blue-light'
                        }`}
                      >
                        {grade}
                      </button>
                    );
                  })}
                </div>
                <select
                  value={draftSubject}
                  onChange={(e) => setDraftSubject(e.target.value)}
                  aria-label={t('learningTargets.columns.subject', {
                    defaultValue: 'Subject',
                  })}
                  className={`${INPUT_CLASS} w-auto`}
                >
                  <option value="">
                    {t('learningTargets.anySubject', {
                      defaultValue: 'Any subject',
                    })}
                  </option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xxs text-slate-500">
                {t('learningTargets.gradesSubjectHint', {
                  defaultValue:
                    'Optional. Leave grades and subject empty to inherit them from the linked standards.',
                })}
              </p>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving || !draftLabel.trim()}
                  className={PRIMARY_BTN}
                >
                  {t('learningTargets.add', { defaultValue: 'Add' })}
                </button>
              </div>
            </form>
          )}

          {panel === 'paste' && (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xxs text-slate-500">
                {t('learningTargets.pasteHint', {
                  defaultValue:
                    'One target per line. Optional code before a pipe: LT1 | I can add fractions.',
                })}
              </p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={5}
                className={`${INPUT_CLASS} font-mono`}
                aria-label={t('learningTargets.pasteList', {
                  defaultValue: 'Paste list',
                })}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xxs text-slate-500">
                  {t('learningTargets.parsedCount', {
                    defaultValue: '{{count}} targets found',
                    count: parsePastedTargets(pasteText).length,
                  })}
                </span>
                <button
                  type="button"
                  onClick={() => void handlePaste()}
                  disabled={
                    saving || parsePastedTargets(pasteText).length === 0
                  }
                  className={PRIMARY_BTN}
                >
                  {t('learningTargets.add', { defaultValue: 'Add' })}
                </button>
              </div>
            </div>
          )}

          {panel === 'csv' && (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xxs text-slate-500">
                {t('learningTargets.csvHint', {
                  defaultValue:
                    'Header row with label (required); optional code, standards, grades (separate values with ;) and subject.',
                })}
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => handleCsvFile(e.target.files?.[0])}
                className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-slate-700"
                aria-label={t('learningTargets.importCsv', {
                  defaultValue: 'Import CSV',
                })}
              />
              {csvPreview && (
                <div className="space-y-2">
                  {csvPreview.errors.length > 0 && (
                    <ul className="rounded-lg border border-brand-red-light/40 bg-red-50 px-3 py-2 text-xxs text-brand-red-dark">
                      {csvPreview.errors.map((err) => (
                        <li key={`${err.line}-${err.message}`}>
                          {t('learningTargets.csvLineError', {
                            defaultValue: 'Line {{line}}: {{message}}',
                            line: err.line,
                            message: err.message,
                          })}
                        </li>
                      ))}
                    </ul>
                  )}
                  {unresolvedCsvCodes.length > 0 && (
                    <p className="text-xxs text-amber-700">
                      {t('learningTargets.csvUnknownStandards', {
                        defaultValue:
                          'Unknown standard codes will be skipped: {{codes}}',
                        codes: unresolvedCsvCodes.join(', '),
                      })}
                    </p>
                  )}
                  {unresolvedCsvSubjects.length > 0 && (
                    <p className="text-xxs text-amber-700">
                      {t('learningTargets.csvUnknownSubjects', {
                        defaultValue:
                          'Unknown subjects will be skipped: {{subjects}}',
                        subjects: unresolvedCsvSubjects.join(', '),
                      })}
                    </p>
                  )}
                  {csvPreview.rows.length > 0 && (
                    <div className="max-h-48 overflow-auto rounded-lg border border-slate-200 bg-white">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-xxs font-bold uppercase tracking-wider text-slate-500">
                          <tr>
                            <th className="px-3 py-1.5">
                              {t('learningTargets.columns.code', {
                                defaultValue: 'Code',
                              })}
                            </th>
                            <th className="px-3 py-1.5">
                              {t('learningTargets.columns.label', {
                                defaultValue: 'Target',
                              })}
                            </th>
                            <th className="px-3 py-1.5">
                              {t('learningTargets.columns.standards', {
                                defaultValue: 'Standards',
                              })}
                            </th>
                            <th className="px-3 py-1.5">
                              {t('learningTargets.columns.grades', {
                                defaultValue: 'Grades',
                              })}
                            </th>
                            <th className="px-3 py-1.5">
                              {t('learningTargets.columns.subject', {
                                defaultValue: 'Subject',
                              })}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {csvPreview.rows.map((row, i) => (
                            <tr key={`${i}-${row.label}`}>
                              <td className="px-3 py-1.5 font-mono text-slate-700">
                                {row.code ?? '—'}
                              </td>
                              <td className="px-3 py-1.5 text-slate-800">
                                {row.label}
                              </td>
                              <td className="px-3 py-1.5 text-slate-600">
                                {row.standardCodes.join(', ') || '—'}
                              </td>
                              <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">
                                {gradesLabel(row.grades)}
                              </td>
                              <td className="px-3 py-1.5 text-slate-600">
                                {(() => {
                                  if (!row.subject) return '—';
                                  const id = subjectIdByName.get(
                                    row.subject.toLowerCase()
                                  );
                                  return id ? (
                                    subjectLabel(id)
                                  ) : (
                                    <span className="text-amber-700 line-through">
                                      {row.subject}
                                    </span>
                                  );
                                })()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xxs text-slate-500">
                      {csvName}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleCsvImport()}
                      disabled={saving || csvPreview.rows.length === 0}
                      className={PRIMARY_BTN}
                    >
                      {t('learningTargets.importCount', {
                        defaultValue: 'Import {{count}}',
                        count: csvPreview.rows.length,
                      })}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showMasteryCutoffs && (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs font-bold text-slate-800">
            {t('learningTargets.masteryCutoffs.heading', {
              defaultValue: 'Mastery cutoffs',
            })}
          </div>
          <p className="mt-0.5 text-xxs text-slate-500">
            {t('learningTargets.masteryCutoffs.description', {
              defaultValue:
                'Percent correct needed for a target to count as proficient or approaching.',
            })}
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <label className="text-xxs font-bold uppercase tracking-wider text-slate-500">
              {t('learningTargets.masteryCutoffs.proficient', {
                defaultValue: 'Proficient',
              })}
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={proficientValue}
                disabled={!canEdit}
                onChange={(e) =>
                  setCutoffDraft({
                    proficient: e.target.value,
                    approaching: approachingValue,
                  })
                }
                className={`${INPUT_CLASS} mt-1 w-24 font-normal normal-case tracking-normal`}
              />
            </label>
            <label className="text-xxs font-bold uppercase tracking-wider text-slate-500">
              {t('learningTargets.masteryCutoffs.approaching', {
                defaultValue: 'Approaching',
              })}
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={approachingValue}
                disabled={!canEdit}
                onChange={(e) =>
                  setCutoffDraft({
                    proficient: proficientValue,
                    approaching: e.target.value,
                  })
                }
                className={`${INPUT_CLASS} mt-1 w-24 font-normal normal-case tracking-normal`}
              />
            </label>
            {canEdit && (
              <button
                type="button"
                onClick={() => void handleSaveCutoffs()}
                disabled={saving || !cutoffsDirty}
                className={PRIMARY_BTN}
              >
                {t('learningTargets.masteryCutoffs.save', {
                  defaultValue: 'Save cutoffs',
                })}
              </button>
            )}
          </div>
        </div>
      )}

      {(saving || error) && (
        <p
          role={error ? 'alert' : 'status'}
          className={`text-xxs ${error ? 'text-brand-red-dark' : 'text-slate-500'}`}
        >
          {error ?? t('learningTargets.saving', { defaultValue: 'Saving…' })}
        </p>
      )}
    </div>
  );
};
