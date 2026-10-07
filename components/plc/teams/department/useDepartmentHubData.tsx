// Live data for the Department Hub (TEAMS_REDESIGN T23, T24): hero, next meeting, open work, docs and materials.

import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardList, Grid2x2, Library, SquareSquare } from 'lucide-react';
import type { Plc, PlcActionItem, PlcNote, PlcNoteBlock } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { usePlcNotes } from '@/hooks/usePlcNotes';
import { usePlcDocs } from '@/hooks/usePlcDocs';
import { usePlcQuizzes } from '@/hooks/usePlcQuizzes';
import { usePlcRubrics, toPortableRubric } from '@/hooks/usePlcRubrics';
import { usePlcQuestionBankEntries } from '@/hooks/usePlcQuestionBanks';
import { usePlcSharedBoards } from '@/hooks/usePlcSharedBoards';
import { usePlcQuizActions } from '@/hooks/usePlcQuizActions';
import { useRubrics } from '@/hooks/useRubrics';
import { canEditPlcContent, getPlcMembers } from '@/utils/plc';
import { logError } from '@/utils/logError';
import { buildMeetingNoteFromTemplate } from '@/utils/meetingNoteBuild';
import { ensureMeetingNote, mutateNoteBlocks } from '@/utils/plcNoteWrites';
import {
  newBlockId,
  selectDecisionsToRevisit,
  selectOpenActionItems,
  selectOpenDecisions,
} from '@/utils/plcNoteBlocks';
import { noteHeadings } from '@/utils/noteSections';
import { NotesMarkdown } from '@/components/plc/bodies/notesMarkdown';
import { DocHeroEmbed } from './DocHeroEmbed';
import type { ResolvedTeamLayout } from '@/utils/teamLayout';
import {
  useNow,
  useTeamMeetingTemplate,
} from '@/components/plc/teams/notes/useTeamNotes';
import { selectNextMeeting } from '@/components/plc/teams/notes/nextMeeting';
import { meetingNoteTitle } from '@/components/plc/teams/notes/meetingNoteTitle';
import {
  formatDayDate,
  formatShortDate,
} from '@/components/plc/teams/notes/noteFormat';
import {
  openTeamDoc,
  openTeamNote,
  openTeamPage,
  requestLayoutEditor,
} from '@/components/plc/teams/notes/teamNotesNavigation';
import type {
  DepartmentHubViewProps,
  HubActionItemModel,
  HubDocRow,
  HubHero,
  HubMaterial,
  HubRowModel,
} from './DepartmentHubView';

const MAX_OPEN_DECISIONS = 3;
const MAX_OPEN_ITEMS = 4;
const MAX_RECENT = 4;

/** Heading that holds agenda items: one named Agenda, else the first. */
export function agendaSectionOf(headings: readonly string[]): string | null {
  return (
    headings.find((h) => h.trim().toLowerCase().includes('agenda')) ??
    headings[0] ??
    null
  );
}

export interface DepartmentHubData {
  view: DepartmentHubViewProps;
  modals: React.ReactNode;
}

export function useDepartmentHubData(
  plc: Plc,
  layout: ResolvedTeamLayout,
  isLead: boolean
): DepartmentHubData {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { addToast } = useDashboard();
  const uid = user?.uid ?? '';
  const canEdit = !!uid && canEditPlcContent(plc, uid);
  const now = useNow();
  const members = useMemo(() => getPlcMembers(plc), [plc]);
  const nameOf = useCallback(
    (id: string | null | undefined) =>
      (id ? members.find((m) => m.uid === id)?.displayName : undefined) ?? '',
    [members]
  );

  const { notes, updateNote } = usePlcNotes(plc.id);
  const { docs, updateDoc } = usePlcDocs(plc.id);
  const { quizzes } = usePlcQuizzes(plc.id);
  const { rubrics } = usePlcRubrics(plc.id);
  const { entries: banks } = usePlcQuestionBankEntries(plc.id);
  const { boards } = usePlcSharedBoards(plc.id);
  const { saveRubric } = useRubrics(user?.uid);
  const quizActions = usePlcQuizActions(plc, () => undefined);
  const template = useTeamMeetingTemplate(plc);
  const [busy, setBusy] = useState(false);

  const cardOn = (id: ResolvedTeamLayout['cards'][number]) =>
    layout.cards.includes(id);

  const fail = useCallback(
    (where: string, err: unknown) => {
      logError(`DepartmentHub.${where}`, err, { plcId: plc.id });
      addToast(
        t('plcDashboard.notes.saveFailed', {
          defaultValue: "Couldn't save your changes. Please try again.",
        }),
        'error'
      );
    },
    [addToast, plc.id, t]
  );

  const next = useMemo(
    () => selectNextMeeting(plc, notes, now),
    [plc, notes, now]
  );

  // The planned note is written the first time someone adds to it or opens it.
  const ensureNextNote = useCallback(async (): Promise<string | null> => {
    if (!next) return null;
    if (next.kind === 'note') return next.note.id;
    const draft = buildMeetingNoteFromTemplate(template.parsed, {
      uid,
      now: Date.now(),
      latestAssessmentId: null,
    });
    await ensureMeetingNote(plc.id, uid, {
      id: next.noteId,
      title: meetingNoteTitle(t, 'department', next.meetingAt),
      body: draft.body,
      blocks: draft.blocks,
      meetingAt: next.meetingAt,
    });
    return next.noteId;
  }, [next, plc.id, t, template.parsed, uid]);

  const nextNote: PlcNote | null = next?.kind === 'note' ? next.note : null;
  const plannedHeadings = useMemo(
    () => template.sections.map((s) => s.heading),
    [template.sections]
  );

  const nextMeeting: DepartmentHubViewProps['nextMeeting'] = next
    ? {
        title: nextNote?.title.trim()
          ? nextNote.title
          : meetingNoteTitle(t, 'department', next.meetingAt),
        dateLabel: formatDayDate(next.meetingAt),
        agenda: (nextNote?.blocks ?? [])
          .filter(
            (b): b is Extract<PlcNoteBlock, { kind: 'agenda' }> =>
              b.kind === 'agenda'
          )
          .map((b) => ({
            id: b.id,
            text: b.text,
            who: nameOf(b.createdBy),
            onRemove:
              nextNote && (isLead || b.createdBy === uid)
                ? () =>
                    void mutateNoteBlocks(plc.id, nextNote.id, uid, (list) =>
                      list.filter((x) => x.id !== b.id)
                    ).catch((err: unknown) => fail('removeAgenda', err))
                : undefined,
          })),
        onOpenNote: () => {
          if (busy) return;
          if (!canEdit && next.kind === 'planned') {
            openTeamPage(plc.id, 'docs');
            return;
          }
          setBusy(true);
          ensureNextNote()
            .then((id) =>
              id ? openTeamNote(plc.id, id) : openTeamPage(plc.id, 'docs')
            )
            .catch((err: unknown) => fail('openNote', err))
            .finally(() => setBusy(false));
        },
        onAddAgenda: canEdit
          ? async (text: string) => {
              try {
                const id = await ensureNextNote();
                if (!id) return;
                const headings = nextNote
                  ? noteHeadings(nextNote.body)
                  : plannedHeadings;
                const section = agendaSectionOf(headings) ?? '';
                await mutateNoteBlocks(plc.id, id, uid, (list) => [
                  ...list,
                  {
                    id: newBlockId(),
                    kind: 'agenda',
                    text,
                    section,
                    createdBy: uid,
                    createdAt: Date.now(),
                  },
                ]);
              } catch (err) {
                fail('addAgenda', err);
                throw err;
              }
            }
          : undefined,
      }
    : null;

  const decisions: HubRowModel[] = useMemo(() => {
    const open = selectOpenDecisions(notes).map((d) => ({
      key: `${d.note.id}:${d.block.id}`,
      title: d.block.text,
      meta:
        d.block.revisitAt != null
          ? t('teams.hub.openDiscuss', {
              defaultValue: 'Open · discuss {{date}}',
              date: formatShortDate(d.block.revisitAt),
            })
          : t('teams.hub.open', { defaultValue: 'Open' }),
      onOpen: () => openTeamNote(plc.id, d.note.id),
    }));
    const revisit = selectDecisionsToRevisit(notes, now).map((d) => ({
      key: `${d.note.id}:${d.block.id}`,
      title: d.block.text,
      meta: t('teams.hub.decided', {
        defaultValue: 'Decided {{date}}',
        date: formatShortDate(d.block.decidedAt ?? d.block.createdAt),
      }),
      onOpen: () => openTeamNote(plc.id, d.note.id),
    }));
    return [...open, ...revisit].slice(0, MAX_OPEN_DECISIONS);
  }, [notes, now, plc.id, t]);

  const items: HubActionItemModel[] = useMemo(
    () =>
      selectOpenActionItems(notes, docs)
        .slice(0, MAX_OPEN_ITEMS)
        .map((v) => {
          const parts = [nameOf(v.item.assigneeUid)];
          if (v.item.dueAt != null) {
            parts.push(
              t('teams.notes.due', {
                defaultValue: 'due {{date}}',
                date: formatShortDate(v.item.dueAt),
              })
            );
          }
          const flip = (list: PlcActionItem[] | undefined) =>
            (list ?? []).map((i) =>
              i.id === v.item.id ? { ...i, done: true, doneAt: Date.now() } : i
            );
          const source = v.source;
          return {
            key: `${source.kind}:${source.kind === 'note' ? source.note.id : source.doc.id}:${v.item.id}`,
            title: v.item.text,
            meta: parts.filter(Boolean).join(' · '),
            done: false,
            onOpen: () =>
              source.kind === 'note'
                ? openTeamNote(plc.id, source.note.id)
                : openTeamDoc(plc.id, source.doc.id),
            onToggle: canEdit
              ? () => {
                  const write =
                    source.kind === 'note'
                      ? updateNote(
                          source.note.id,
                          { actionItems: flip(source.note.actionItems) },
                          { expectedVersion: source.note.version }
                        )
                      : updateDoc(source.doc.id, {
                          actionItems: flip(source.doc.actionItems),
                          actionItemsBase: source.doc.actionItems ?? [],
                        });
                  void Promise.resolve(write).catch((err: unknown) =>
                    fail('toggleItem', err)
                  );
                }
              : undefined,
          };
        }),
    [canEdit, docs, fail, nameOf, notes, plc.id, t, updateDoc, updateNote]
  );

  const recentDocs: HubDocRow[] = useMemo(() => {
    const rows = [
      ...docs
        .filter((d) => d.deletedAt == null)
        .map((d) => ({
          at: d.updatedAt,
          row: {
            key: `doc:${d.id}`,
            title: d.title,
            meta: d.createdByName,
            date: formatShortDate(d.updatedAt),
            onOpen: () => openTeamDoc(plc.id, d.id),
          },
        })),
      ...notes
        .filter((n) => n.deletedAt == null && n.title.trim())
        .map((n) => ({
          at: n.lastEditedAt,
          row: {
            key: `note:${n.id}`,
            title: n.title,
            meta: nameOf(n.lastEditedBy),
            date: formatShortDate(n.lastEditedAt),
            onOpen: () => openTeamNote(plc.id, n.id),
          },
        })),
    ];
    return rows
      .sort((a, b) => b.at - a.at)
      .slice(0, MAX_RECENT)
      .map((r) => r.row);
  }, [docs, nameOf, notes, plc.id]);

  const copyRubric = useCallback(
    async (entryId: string) => {
      const entry = rubrics.find((r) => r.id === entryId);
      if (!entry) return;
      try {
        const stamp = Date.now();
        await saveRubric({
          ...toPortableRubric(entry),
          id: crypto.randomUUID(),
          createdAt: stamp,
          updatedAt: stamp,
        });
        addToast(
          t('plcDashboard.rubricLibrary.importedToast', {
            title: entry.title,
            defaultValue: '"{{title}}" added to your rubric library.',
          }),
          'success'
        );
      } catch (err) {
        fail('copyRubric', err);
      }
    },
    [addToast, fail, rubrics, saveRubric, t]
  );

  const materials: HubMaterial[] = useMemo(() => {
    const openResources = () => openTeamPage(plc.id, 'resources');
    const rows: { at: number; row: HubMaterial }[] = [
      ...quizzes.map((q) => ({
        at: q.sharedAt,
        row: {
          key: `quiz:${q.id}`,
          icon: ClipboardList,
          title: q.title,
          meta: [
            t('teams.hub.quizKind', {
              defaultValue: 'Quiz · {{count}} questions',
              count: q.questionCount,
            }),
            q.sharedByName,
          ]
            .filter(Boolean)
            .join(' · '),
          onOpen: openResources,
          onCopy: quizActions.isInLibrary(q.syncGroupId)
            ? undefined
            : () =>
                quizActions.importQuiz({
                  plcQuizId: q.id,
                  syncGroupId: q.syncGroupId,
                  title: q.title,
                  sharedByName: q.sharedByName || null,
                }),
        },
      })),
      ...rubrics.map((r) => ({
        at: r.sharedAt,
        row: {
          key: `rubric:${r.id}`,
          icon: Grid2x2,
          title: r.title,
          meta: [
            t('teams.hub.rubricKind', {
              defaultValue: 'Rubric · {{count}} criteria',
              count: r.criteria.length,
            }),
            r.sharedByName,
          ]
            .filter(Boolean)
            .join(' · '),
          onOpen: openResources,
          onCopy: () => void copyRubric(r.id),
        },
      })),
      ...banks.map((b) => ({
        at: b.sharedAt,
        row: {
          key: `bank:${b.id}`,
          icon: Library,
          title: b.title,
          meta: [
            t('teams.hub.bankKind', {
              defaultValue: 'Question bank · {{count}} questions',
              count: b.questionCount,
            }),
            b.sharedByName,
          ]
            .filter(Boolean)
            .join(' · '),
          onOpen: openResources,
        },
      })),
      ...boards.map((b) => ({
        at: b.sharedAt,
        row: {
          key: `board:${b.id}`,
          icon: SquareSquare,
          title: b.name,
          meta: [
            t('teams.hub.boardKind', { defaultValue: 'Board' }),
            b.originalAuthorName,
          ]
            .filter(Boolean)
            .join(' · '),
          onOpen: openResources,
        },
      })),
    ];
    return rows
      .sort((a, b) => b.at - a.at)
      .slice(0, MAX_RECENT)
      .map((r) => r.row);
  }, [banks, boards, copyRubric, plc.id, quizActions, quizzes, rubrics, t]);

  const hero: HubHero | null = useMemo(() => {
    const ref = layout.hero.mode === 'pinned' ? layout.hero.ref : undefined;
    if (ref?.kind === 'doc') {
      const doc = docs.find((d) => d.id === ref.docId && d.deletedAt == null);
      if (doc) {
        return {
          title: doc.title,
          meta: t('teams.notes.docMeta', {
            defaultValue: 'Google Doc · updated {{date}} by {{name}}',
            date: formatShortDate(doc.updatedAt),
            name: doc.createdByName,
          }),
          pinned: true,
          docUrl: doc.url,
          body: <DocHeroEmbed url={doc.url} title={doc.title} />,
        };
      }
    }
    const pinnedNote =
      ref?.kind === 'note'
        ? notes.find((n) => n.id === ref.noteId && n.deletedAt == null)
        : undefined;
    const note = pinnedNote ?? nextNote;
    if (!note) return null;
    return {
      title: note.title,
      meta: note.meetingAt
        ? formatDayDate(note.meetingAt)
        : t('plcDashboard.notes.lastEdited', {
            defaultValue: 'Last edited {{when}}',
            when: formatShortDate(note.lastEditedAt),
          }),
      pinned: !!pinnedNote,
      onOpenNote: () => openTeamNote(plc.id, note.id),
      body: (
        <div className="max-h-[28rem] overflow-y-auto px-6 pb-6 pt-4">
          <NotesMarkdown body={note.body} />
        </div>
      ),
    };
  }, [docs, layout.hero, nextNote, notes, plc.id, t]);

  return {
    view: {
      isLead,
      cards: {
        hero: cardOn('hero'),
        nextMeeting: cardOn('nextMeeting'),
        openDecisions: cardOn('openDecisions'),
        openItems: cardOn('openItems'),
        recentDocs: cardOn('recentDocs'),
        newMaterials: cardOn('newMaterials'),
      },
      hero,
      onChangeHero: isLead ? () => requestLayoutEditor(plc.id) : undefined,
      nextMeeting,
      decisions,
      items,
      recentDocs,
      materials,
      onOpenNotes: () => openTeamPage(plc.id, 'docs'),
      onOpenResources: () => openTeamPage(plc.id, 'resources'),
      onNewMeetingNote: canEdit
        ? () => openTeamPage(plc.id, 'docs')
        : undefined,
    },
    modals: quizzes.length > 0 ? quizActions.modals : null,
  };
}
